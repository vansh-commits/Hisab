# API Design

**Conventions**
- Base path `/api`. JSON with `snake_case` field names.
- Money is `*_paise` (integer). Weights and quantities are `*_mg` / `*_milli` (integer). Rates are milli-percent (`3000` = 3%). JSON numbers are safe up to 2^53 paise.
- Dates are `YYYY-MM-DD` (IST business date). Timestamps are RFC 3339.
- Errors look like `{"error": {"code": "validation_failed", "message": "…", "fields": {"lines[0].hsn": "must be 4, 6 or 8 digits"}}}` with status 400/401/403/404/409/422/429.
- List pagination is keyset: `?limit=50&cursor=<opaque>` and returns `{"items": [...], "next_cursor": "…|null"}`.
- Auth is the session cookie. Every non-GET request passes `CrossOriginProtection`.
- Middleware chains: `public` (no session), `session` (any logged-in user), `tenant(statuses…)` (session + membership + status gate; puts `business_id` in the request context and handlers pass it to every query), `admin` (admin audience + allowlist re-check).

## Auth
| Method & path | Chain | Purpose |
|---|---|---|
| `GET /api/auth/google/start?return_to=/app` | public | 302 to Google (state, nonce, PKCE in `__Host-oauth`) |
| `GET /api/auth/google/callback` | public | Verify, create session, 302 by status |
| `POST /api/auth/logout` | session | Delete session, clear cookie → 204 |
| `GET /api/me` | session | Current user + business status |
| `POST /api/dev/login` | public, **dev only** | `{email}` → session for seed users |

`GET /api/me` → 200
```json
{
  "user": { "id": "uuid", "email": "owner@example.com", "name": "Ramesh Soni", "avatar_url": "…" },
  "business": { "id": "uuid", "status": "approved", "onboarding_step": 3, "trade_name": null, "review_note": null }
}
```
`business` is `null` if the user hasn't applied yet.

## Waitlist
| Method & path | Chain |
|---|---|
| `POST /api/waitlist` | session (no business yet) |
| `GET /api/waitlist` | session |
| `PUT /api/waitlist` | session, status ∈ {pending, rejected} (re-submit → pending) |

`POST /api/waitlist`
```json
{ "business_name": "Soni Jewellers", "owner_name": "Ramesh Soni", "phone": "+919876543210", "city": "Jaipur", "gstin": "08ABCDE1234F1Z5" }
```
→ `201 {"business": {"id": "uuid", "status": "pending"}}`. A GSTIN, if present, gets a format + checksum validation. Sends a "we received your application" email. Rate limited.

## Business profile, settings, onboarding
Onboarding uses **the same resource endpoints** as Settings. It only adds progress tracking.

| Method & path | Chain |
|---|---|
| `GET /api/business` / `PATCH /api/business` | tenant(approved, active) |
| `PUT /api/business/logo` (multipart `file`, ≤200 KB png/jpeg/webp, magic bytes checked) / `DELETE` | tenant(approved, active) |
| `GET /api/logos/{id}` | tenant(any incl. suspended), `Cache-Control: private, max-age=31536000, immutable` |
| `GET /api/settings` / `PATCH /api/settings` | tenant(approved, active) |
| `PUT /api/settings/number-series` `{starting_no}` (only if no invoice issued in current FY) | tenant(approved, active) |
| `GET /api/metal-rates` / `PUT /api/metal-rates` `[{metal, rate_paise}]` | tenant(approved, active) |
| `GET /api/onboarding` | tenant(approved, active) |
| `PATCH /api/onboarding` `{step}` | tenant(approved) |
| `POST /api/onboarding/complete` | tenant(approved) → status `active` |
| `GET /api/states` | public, cacheable |

`PATCH /api/business` (partial; validates GSTIN checksum and that the state prefix matches `state_code`)
```json
{ "registration_type": "regular", "legal_name": "Soni Jewellers Pvt Ltd", "trade_name": "Soni Jewellers",
  "address_line1": "12 Johari Bazaar", "city": "Jaipur", "pincode": "302003", "state_code": "08",
  "gstin": "08ABCDE1234F1Z5", "udyam_no": null, "phone": "+919876543210", "email": "shop@example.com" }
```
`POST /api/onboarding/complete` → 422 with `fields` listing what's still missing (legal name, address, state, plus GSTIN if `regular`, plus prefix). Optional steps never block.

## Parties
| Method & path | Notes |
|---|---|
| `GET /api/parties?q=&cursor=` | trigram search on name, plus phone prefix |
| `POST /api/parties` | `{name, phone, gstin, pan, bill_address, bill_state_code, ship_same_as_bill, ship_*, opening_balance_paise, opening_balance_date}` |
| `POST /api/parties/bulk` | onboarding "add several", `[party…]`, all or nothing |
| `GET /api/parties/{id}` / `PATCH` | |
| `DELETE /api/parties/{id}` | archives if referenced by invoices/payments, else deletes |
| `GET /api/parties/{id}/ledger?from=&to=` | see below |

`GET /api/parties/{id}/ledger` → 200
```json
{ "party": { "id": "uuid", "name": "Meena Traders" },
  "opening_balance_paise": 1500000,
  "entries": [
    { "date": "2026-11-02", "type": "invoice", "ref": "SJ/26-27/0148", "id": "uuid", "debit_paise": 44611900, "credit_paise": 0, "balance_paise": 46111900 },
    { "date": "2026-11-05", "type": "payment", "ref": "UPI 4321…", "id": "uuid", "debit_paise": 0, "credit_paise": 20000000, "balance_paise": 26111900 }
  ],
  "closing_balance_paise": 26111900 }
```

## Items
`GET /api/items?q=` · `POST /api/items` · `POST /api/items/bulk` · `PATCH /api/items/{id}` · `DELETE /api/items/{id}` (archive if used)

## Invoices
| Method & path | Notes |
|---|---|
| `GET /api/invoices?q=&status=&from=&to=&party_id=&doc_type=&cursor=` | list (number, date, buyer, total, paid, status) |
| `POST /api/invoices` | create draft `{input}`. With `"issue": true` + `expected_grand_total_paise` it creates and issues in one call (the fast path). |
| `POST /api/invoices/compute` | stateless `{input}` → computed result (server check, used before issue on slow clients) |
| `GET /api/invoices/{id}` | `{invoice, computed}` for drafts, `{invoice, snapshot, payments, paid_paise}` for issued |
| `PUT /api/invoices/{id}` | replace draft input (409 if not draft) |
| `DELETE /api/invoices/{id}` | drafts only |
| `POST /api/invoices/{id}/issue` | `{expected_grand_total_paise}` → number + snapshot. 409 `totals_mismatch` with server totals if they differ. |
| `POST /api/invoices/{id}/cancel` | `{reason}` → issued → cancelled. 409 if non-voided non-old-gold payments exist (void them first). An exchange voucher is cancelled with it. |
| `GET /api/invoices/{id}/pdf` | PDF built from the snapshot on every request (never stored). Drafts get a "DRAFT" watermark. |

**Invoice input** (draft body, also the `compute` body)
```jsonc
{
  "doc_type": "tax_invoice",            // server forces bill_of_supply if business isn't 'regular'
  "invoice_date": "2026-11-16",
  "date_of_supply": "2026-11-16",
  "calc_mode": "forward",               // "forward" | "reverse"
  "party_id": "uuid",                   // or null for walk-in
  "buyer": { "name": "Meena Traders", "address": "…", "state_code": "08", "gstin": null, "phone": "…", "pan": null },
  "consignee": null,                    // null = same as buyer
  "goods_movement": false,              // registered buyer: are goods transported to them?
  "delivery_state": null,               // where movement terminates (defaults to consignee/buyer state)
  "place_of_supply_override": null,     // e.g. "07"; null = server derives via tax-engine.md §3
  "reverse_charge": false,
  "tcs_rate": null,                     // milli-percent; null = off. 2000 only for a qualifying scrap sale (tax-engine.md R5)
  "refs": { "eway_bill_no": null, "buyer_order_no": null, "dispatch_doc_no": null, "terms_of_delivery": null },
  "lines": [{
    "kind": "goods",                    // "goods" | "charge" (separate line with own HSN/rate, e.g. job work)
    "item_id": "uuid|null",
    "description": "22ct Gold Jewellery", "hsn": "7113", "purity": "22K", "huid": null,
    "unit": "g", "gross_weight_mg": 31800, "qty_milli": 31370,
    "rate_paise": 1345700,              // forward mode
    "making": { "mode": "per_gram", "value": 35000 },   // or null
    "other_paise": 0, "other_label": null,
    "gst_rate": 3000,
    "target_total_paise": null          // reverse mode: inclusive total for this line
  }],
  "old_gold": {                         // optional exchange; null if none
    "seller_kind": "individual",        // "individual" | "business"
    "lines": [{ "description": "Old gold ornaments", "purity": "22K",
                "gross_weight_mg": 10500, "less_weight_mg": 300, "rate_paise": 1280000 }]
  },
  "notes": ""
}
```
**Computed result** (from `compute`, and embedded in drafts)
```json
{
  "supply_type": "intra", "place_of_supply": "08", "sgst_label": "SGST",
  "lines": [{ "metal_paise": 42214609, "making_paise": 1097950, "other_paise": 0, "taxable_paise": 43312559, "rate_paise": 1345700, "rate_derived": false }],
  "tax_groups": [{ "hsn": "7113", "gst_rate": 3000, "taxable_paise": 43312559, "cgst_paise": 649688, "sgst_paise": 649688, "igst_paise": 0 }],
  "taxable_paise": 43312559, "cgst_paise": 649688, "sgst_paise": 649688, "igst_paise": 0,
  "tcs_paise": 0, "round_off_paise": -35, "grand_total_paise": 44611900,
  "old_gold": { "lines": [{ "net_weight_mg": 10200, "amount_paise": 13056000 }], "round_off_paise": 0, "total_paise": 13056000 },
  "net_payable_paise": 31555900,
  "words": { "grand_total": "Rupees Four Lakh Forty-Six Thousand One Hundred Nineteen Only",
             "tax": "Rupees Twelve Thousand Nine Hundred Ninety-Three and Seventy-Six Paise Only",
             "net_payable": "Rupees Three Lakh Fifteen Thousand Five Hundred Fifty-Nine Only" },
  "warnings": [{ "code": "pan_recommended", "message": "PAN is required for jewellery sales above ₹2,00,000 (Rule 114B)" }]
}
```
The UI calls `compute` debounced by 300 ms while typing. It is the only tax engine (Go), and the UI shows the live totals from it. Validation (422): old gold total must not exceed the grand total (use a standalone voucher instead). At least one line. Unregistered buyer with value ≥ ₹50,000 requires name, address, and state (Rule 46). `gstin` must pass checksum and its prefix must match the buyer state. HSN must be 4/6/8 digits if given. `qty_milli > 0`. Reverse mode requires `target_total_paise`.

## Old gold purchase vouchers
| Method & path | Notes |
|---|---|
| `GET /api/purchase-vouchers?from=&to=&party_id=&cursor=` | list |
| `POST /api/purchase-vouchers/compute` | `{lines}` → amounts, round off, total (live preview) |
| `POST /api/purchase-vouchers` | standalone purchase, issued immediately (see below) |
| `GET /api/purchase-vouchers/{id}` · `GET /api/purchase-vouchers/{id}/pdf` | view, PDF from snapshot |
| `POST /api/purchase-vouchers/{id}/cancel` | `{reason}`. Standalone only. Exchange vouchers are cancelled via their invoice. |

`POST /api/purchase-vouchers`
```jsonc
{ "voucher_date": "2026-11-16", "party_id": null,
  "seller": { "name": "Sunita Devi", "address": "…", "phone": "…", "pan": null },
  "seller_kind": "individual",                       // "individual" (personal jewellery) | "business" (unregistered dealer); register only, no tax
  "settlement": "paid", "paid_mode": "cash",          // or "on_account" (requires party_id)
  "lines": [{ "description": "Old chain", "purity": "22K", "gross_weight_mg": 10500, "less_weight_mg": 300, "rate_paise": 1280000 }] }
```
→ `201 {"voucher": {"id": "uuid", "voucher_no": "PV/26-27/008", "total_paise": 13056000}}`

## Payments
| Method & path | Notes |
|---|---|
| `GET /api/payments?party_id=&invoice_id=&from=&to=` | |
| `POST /api/payments` | `{invoice_id?, party_id?, received_on, amount_paise, mode, reference, note}`. Overpayment → 409. Cash ≥ ₹2,00,000 → warning in response (s.269ST). |
| `POST /api/payments/{id}/void` | `{reason}` |

## Reports and home
| Method & path | Output |
|---|---|
| `GET /api/reports/sales-register?from=&to=&format=json\|csv` | one row per issued invoice: no, date, buyer, GSTIN, POS, taxable, CGST, SGST, IGST, TCS, round-off, total, status |
| `GET /api/reports/gst-summary?from=&to=` | totals by month × {B2B, B2C} × {intra, inter} |
| `GET /api/reports/hsn-summary?from=&to=&format=` | hsn, rate, qty (by unit), taxable, CGST, SGST, IGST |
| `GET /api/reports/old-gold-register?from=&to=&format=` | voucher no, date, seller, seller kind, net wt, amount, settlement |
| `GET /api/home` | today's and month's sales, invoice count, outstanding receivables, 5 recent invoices |

Cancelled invoices appear in the register, flagged, and are excluded from tax totals.

## Health
`GET /healthz` → `200 ok`. Doesn't touch the DB, so health checks don't wake Neon.

## Admin (`hisab.vercel.app/api/admin/*`, UI at `/admin/`, all audit-logged)
| Method & path | Notes |
|---|---|
| `GET /api/admin/auth/google/start` · `/callback` · `POST /api/admin/auth/logout` · `GET /api/admin/me` | allowlist only |
| `GET /api/admin/applications?status=pending&q=&cursor=` | waitlist queue |
| `POST /api/admin/applications/{id}/approve` | `{note?}` → status approved, email sent. Response includes `email_sent: bool`. |
| `POST /api/admin/applications/{id}/reject` | `{note?}` → rejected, email sent |
| `POST /api/admin/applications/{id}/resend-email` | retry a failed send |
| `GET /api/admin/clients?status=&q=&cursor=` | business, owner email, status, invoice count, last active (max `sessions.last_seen_at`), created |
| `GET /api/admin/clients/{id}` | detail + usage + recent audit |
| `POST /api/admin/clients/{id}/suspend` `{reason}` · `/reactivate` | suspension also revokes nothing, because the status gate makes the client read-only |
| `GET /api/admin/metrics` | totals: applications by status, active clients, invoices issued (7/30 d), DB size (`pg_database_size`) vs the 1 GB cap |
| `GET /api/admin/audit?business_id=&action=&cursor=` | |

Approve response:
```json
{ "business": { "id": "uuid", "status": "approved", "reviewed_at": "2026-11-16T10:00:00Z" }, "email_sent": true }
```
