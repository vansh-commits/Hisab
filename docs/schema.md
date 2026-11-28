# Postgres Schema

Conventions:
- `uuid` PKs (`gen_random_uuid()`, built into PG13+).
- Money is `bigint` **paise**. Weight and quantity are `bigint` **milli-units** (for grams that means mg). GST/TCS rates are `int` **milli-percent** (3% = 3000).
- `timestamptz` everywhere. Business dates (invoice date) are `date`, interpreted in Asia/Kolkata.
- Every tenant-owned table has `business_id NOT NULL`, and every tenant query filters on it. Cross-table references use **composite FKs** `(business_id, id)`, so a row can't point at another tenant's row.
- One DB role (Neon's default owner). *ponytail: no RLS or role split for a handful of tenants; add RLS together with staff users.*

```sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Reference ────────────────────────────────────────────────────────────
CREATE TABLE states (
  code  char(2) PRIMARY KEY,                -- GST state code: '07' Delhi, '27' Maharashtra, '97' Other Territory
  name  text NOT NULL,
  is_ut_without_legislature boolean NOT NULL DEFAULT false  -- prints UTGST instead of SGST (04, 26, 31, 35, 38)
);
-- seeded from the CBIC state-code list in migration 0001

-- ── Identity & sessions ──────────────────────────────────────────────────
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE,              -- nullable: future phone-only users
  name          text NOT NULL DEFAULT '',
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE auth_identities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  provider   text NOT NULL CHECK (provider IN ('google')),   -- add 'phone' later
  subject    text NOT NULL,                                   -- Google `sub` / E.164 phone
  email      citext,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);
CREATE INDEX ON auth_identities (user_id);

CREATE TABLE sessions (
  token_hash   bytea PRIMARY KEY,           -- sha256(raw token); raw token only in cookie
  user_id      uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  audience     text NOT NULL CHECK (audience IN ('app','admin')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,        -- min(idle, absolute) recomputed on touch
  absolute_expires_at timestamptz NOT NULL,
  ip           inet,
  user_agent   text
);
CREATE INDEX ON sessions (user_id);
CREATE INDEX ON sessions (expires_at);

-- ── Tenants ──────────────────────────────────────────────────────────────
CREATE TABLE businesses (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending','rejected','approved','active','suspended')),

  -- waitlist application (as submitted; kept for history)
  applicant_business_name text NOT NULL,
  applicant_owner_name    text NOT NULL,
  applicant_phone         text NOT NULL CHECK (applicant_phone ~ '^\+91[6-9][0-9]{9}$'),
  applicant_city          text NOT NULL,
  applicant_gstin         text,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewed_by  citext,                       -- admin email
  review_note  text,

  -- profile (onboarding / settings)
  registration_type text CHECK (registration_type IN ('regular','composition','unregistered')),
  legal_name    text,
  trade_name    text,
  address_line1 text,
  address_line2 text,
  city          text,
  pincode       char(6) CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  state_code    char(2) REFERENCES states,
  phone         text,
  email         citext,
  gstin         char(15) CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),  -- checksum in app
  udyam_no      text CHECK (udyam_no ~ '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$'),
  logo_id       uuid,                        -- FK added after logos
  onboarding_step smallint NOT NULL DEFAULT 0,
  onboarded_at  timestamptz,
  suspended_at  timestamptz,
  suspend_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CHECK (gstin IS NULL OR state_code IS NULL OR left(gstin, 2) = state_code),
  CHECK (status <> 'active' OR registration_type IS DISTINCT FROM 'regular' OR gstin IS NOT NULL),  -- only once active: onboarding saves GST status before the GSTIN
  CHECK (status <> 'active' OR onboarded_at IS NOT NULL)
);
CREATE INDEX ON businesses (status, applied_at);
CREATE INDEX ON businesses USING gin (applicant_business_name gin_trgm_ops);

CREATE TABLE memberships (
  business_id uuid NOT NULL REFERENCES businesses ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),  -- add 'staff' etc. later
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id),
  UNIQUE (user_id)    -- one business per user for now; drop this to allow many
);

CREATE TABLE logos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES businesses ON DELETE CASCADE,
  sha256       bytea NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
  data         bytea NOT NULL CHECK (octet_length(data) <= 204800),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, sha256)        -- immutable, content-addressed; never UPDATEd
);
ALTER TABLE businesses ADD FOREIGN KEY (logo_id) REFERENCES logos;

CREATE TABLE business_settings (
  business_id      uuid PRIMARY KEY REFERENCES businesses ON DELETE CASCADE,
  -- numbering
  invoice_prefix   text NOT NULL DEFAULT 'INV/' CHECK (invoice_prefix ~ '^[A-Za-z0-9/-]{0,8}$'),
  include_fy       boolean NOT NULL DEFAULT true,    -- "26-27/" token
  number_min_digits smallint NOT NULL DEFAULT 3 CHECK (number_min_digits BETWEEN 1 AND 8),
  fy_reset         boolean NOT NULL DEFAULT true,
  -- print
  copies           text[] NOT NULL DEFAULT '{Customer,Store}'  -- free-text copy labels
                   CHECK (cardinality(copies) BETWEEN 1 AND 5 AND array_position(copies, '') IS NULL),
  terms            text NOT NULL DEFAULT '',
  declaration      text NOT NULL DEFAULT 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  jurisdiction     text NOT NULL DEFAULT '',          -- "Subject to Jaipur jurisdiction"
  signatory_name   text NOT NULL DEFAULT '',
  -- bank
  bank_name        text, bank_account_name text, bank_account_no text,
  bank_ifsc        text CHECK (bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_branch      text, upi_id text,
  -- defaults
  default_gst_rate     int    NOT NULL DEFAULT 3000 CHECK (default_gst_rate BETWEEN 0 AND 28000),
  default_making_mode  text   NOT NULL DEFAULT 'per_gram' CHECK (default_making_mode IN ('per_gram','flat','percent')),
  default_making_value bigint NOT NULL DEFAULT 0 CHECK (default_making_value >= 0),  -- paise/g | paise | milli-%
  -- calculation
  round_off_enabled            boolean NOT NULL DEFAULT true,
  reverse_round_taxable_rupee  boolean NOT NULL DEFAULT true,   -- matches Bill A
  -- template
  template_version text  NOT NULL DEFAULT 'classic-v1',
  template_config  jsonb NOT NULL DEFAULT '{}',   -- {accent:"#9A7B2F", show:{hsn:true,gross_wt:true,purity:true,huid:false,...}}
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Gapless numbering: one row per (business, doc type, FY). Locked by UPDATE in the issue tx.
CREATE TABLE number_series (
  business_id uuid NOT NULL REFERENCES businesses ON DELETE CASCADE,
  doc_type    text NOT NULL CHECK (doc_type IN ('invoice','purchase_voucher','credit_note','debit_note')),
  series_key  smallint NOT NULL,   -- FY start year (2026 = FY 2026-27) when fy_reset, else 0
  next_no     int NOT NULL DEFAULT 1 CHECK (next_no > 0),
  PRIMARY KEY (business_id, doc_type, series_key)
);

-- Daily rate board (Q1 default): pre-fills line rate
CREATE TABLE metal_rates (
  business_id uuid NOT NULL REFERENCES businesses ON DELETE CASCADE,
  metal       text NOT NULL,           -- '24K','22K','18K','silver' (free text, user-defined)
  rate_paise  bigint NOT NULL CHECK (rate_paise > 0),   -- per gram
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, metal)
);

-- ── Masters ──────────────────────────────────────────────────────────────
CREATE TABLE parties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES businesses ON DELETE CASCADE,
  name         text NOT NULL CHECK (name <> ''),
  phone        text,
  email        citext,
  gstin        char(15) CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  pan          char(10) CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  bill_address text NOT NULL DEFAULT '',
  bill_state_code char(2) REFERENCES states,
  ship_same_as_bill boolean NOT NULL DEFAULT true,
  ship_name    text, ship_address text,
  ship_state_code char(2) REFERENCES states,
  opening_balance_paise bigint NOT NULL DEFAULT 0,   -- +ve = customer owes us
  opening_balance_date  date,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (gstin IS NULL OR bill_state_code IS NULL OR left(gstin,2) = bill_state_code),
  UNIQUE (business_id, id)   -- target for composite FKs (tenant-safe references)
);
CREATE INDEX ON parties (business_id) WHERE archived_at IS NULL;
CREATE INDEX ON parties USING gin (name gin_trgm_ops);
CREATE INDEX ON parties (business_id, phone);

CREATE TABLE items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses ON DELETE CASCADE,
  name          text NOT NULL CHECK (name <> ''),
  hsn           text CHECK (hsn ~ '^[0-9]{4}([0-9]{2}){0,2}$'),   -- 4/6/8 digits, optional
  unit          text NOT NULL DEFAULT 'g' CHECK (unit IN ('g','pcs','ct','pair','set','nos')),
  purity        text,                                -- '22K', '0.995', '916'
  gst_rate      int NOT NULL DEFAULT 3000 CHECK (gst_rate BETWEEN 0 AND 28000),
  default_rate_paise bigint CHECK (default_rate_paise >= 0),   -- per unit; null = use metal_rates
  metal         text,                                -- link to metal_rates.metal for auto rate
  making_mode   text CHECK (making_mode IN ('per_gram','flat','percent')),
  making_value  bigint CHECK (making_value >= 0),
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON items (business_id) WHERE archived_at IS NULL;
CREATE INDEX ON items USING gin (name gin_trgm_ops);

-- ── Documents ────────────────────────────────────────────────────────────
CREATE TABLE invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses,
  doc_type      text NOT NULL CHECK (doc_type IN ('tax_invoice','bill_of_supply','credit_note','debit_note')),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','cancelled')),

  series_key    smallint,                   -- copy of number_series.series_key at issue
  invoice_no    text CHECK (char_length(invoice_no) <= 16 AND invoice_no ~ '^[A-Za-z0-9/-]+$'),
  invoice_date  date NOT NULL,
  fy            smallint NOT NULL,          -- derived from invoice_date (Apr–Mar), for reports

  party_id      uuid,                       -- null for walk-in
  buyer_name    text NOT NULL DEFAULT '',   -- denormalised for list/search
  buyer_gstin   char(15),                   -- B2B vs B2C in reports
  original_invoice_id uuid REFERENCES invoices,   -- credit/debit notes (phase 7)

  input         jsonb NOT NULL,             -- what the user entered (editable while draft)
  snapshot      jsonb,                      -- frozen, fully computed render document (set at issue)
  template_version text,
  engine_version   smallint,

  place_of_supply char(2) REFERENCES states,
  supply_type   text CHECK (supply_type IN ('intra','inter')),
  taxable_paise   bigint NOT NULL DEFAULT 0,
  cgst_paise      bigint NOT NULL DEFAULT 0,
  sgst_paise      bigint NOT NULL DEFAULT 0,   -- or UTGST, label from snapshot
  igst_paise      bigint NOT NULL DEFAULT 0,
  tcs_rate        int NOT NULL DEFAULT 0 CHECK (tcs_rate BETWEEN 0 AND 10000),  -- per bill, R5
  tcs_paise       bigint NOT NULL DEFAULT 0,
  round_off_paise bigint NOT NULL DEFAULT 0 CHECK (round_off_paise BETWEEN -50 AND 50),
  grand_total_paise bigint NOT NULL DEFAULT 0,      -- GST invoice value (old gold does NOT reduce this)
  old_gold_paise    bigint NOT NULL DEFAULT 0 CHECK (old_gold_paise >= 0),   -- exchange deduction
  net_payable_paise bigint NOT NULL DEFAULT 0,      -- grand_total − old_gold
  CHECK (net_payable_paise = grand_total_paise - old_gold_paise),
  CHECK (old_gold_paise <= grand_total_paise),

  -- reserved for e-invoicing (phase 7); nullable, unused in MVP
  irn text, irn_ack_no text, irn_ack_at timestamptz, irn_signed_qr text,
  eway_bill_no text,

  cancel_reason text,
  created_by    uuid REFERENCES users,
  issued_by     uuid REFERENCES users,
  cancelled_by  uuid REFERENCES users,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  issued_at     timestamptz,
  cancelled_at  timestamptz,

  FOREIGN KEY (business_id, party_id) REFERENCES parties (business_id, id),  -- party must be same tenant
  CHECK (status = 'draft' OR (invoice_no IS NOT NULL AND series_key IS NOT NULL AND snapshot IS NOT NULL AND issued_at IS NOT NULL)),
  CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL)),
  CHECK (doc_type <> 'tax_invoice' OR status = 'draft' OR supply_type IS NOT NULL)
);
CREATE UNIQUE INDEX invoices_number_uq ON invoices (business_id, doc_type, series_key, invoice_no)
  WHERE invoice_no IS NOT NULL;
CREATE INDEX ON invoices (business_id, invoice_date DESC, id DESC);   -- list + cursor pagination
CREATE INDEX ON invoices (business_id, party_id, invoice_date);
CREATE INDEX ON invoices (business_id, status);
CREATE INDEX ON invoices USING gin (buyer_name gin_trgm_ops);

-- Issued invoices are immutable: only issued → cancelled (with cancel fields) is allowed.
CREATE FUNCTION invoices_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed text[] := ARRAY['status','cancel_reason','cancelled_at','cancelled_by','updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'issued invoice % cannot be deleted', OLD.id; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'draft' THEN RETURN NEW; END IF;
  IF OLD.status = 'issued' AND NEW.status = 'cancelled'
     AND (to_jsonb(NEW) - allowed) = (to_jsonb(OLD) - allowed) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invoice % is immutable (status %)', OLD.id, OLD.status;
END $$;
CREATE TRIGGER invoices_guard BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_guard();

ALTER TABLE invoices ADD UNIQUE (business_id, id);

-- Old gold bought from customers (URD purchase). No GST. Exchange against a sale, or standalone.
CREATE TABLE purchase_vouchers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses,
  status        text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),  -- no drafts: created atomically
  series_key    smallint NOT NULL,
  voucher_no    text NOT NULL CHECK (char_length(voucher_no) <= 16 AND voucher_no ~ '^[A-Za-z0-9/-]+$'),
  voucher_date  date NOT NULL,
  fy            smallint NOT NULL,
  party_id      uuid,
  seller_name   text NOT NULL,                -- denormalised
  seller_kind   text NOT NULL DEFAULT 'individual' CHECK (seller_kind IN ('individual','business')),  -- tax-engine.md §5
  settlement    text NOT NULL CHECK (settlement IN ('exchange','paid','on_account')),
  invoice_id    uuid,                         -- set when settlement = 'exchange'
  paid_mode     text CHECK (paid_mode IN ('cash','upi','bank','cheque')),
  snapshot      jsonb NOT NULL,               -- seller block, lines, totals, template version
  net_weight_mg bigint NOT NULL CHECK (net_weight_mg > 0),   -- for the register
  total_paise   bigint NOT NULL CHECK (total_paise > 0),     -- after rupee round-off
  round_off_paise bigint NOT NULL DEFAULT 0 CHECK (round_off_paise BETWEEN -50 AND 50),
  cancel_reason text,
  created_by    uuid REFERENCES users,
  created_at    timestamptz NOT NULL DEFAULT now(),
  cancelled_at  timestamptz,
  cancelled_by  uuid REFERENCES users,
  FOREIGN KEY (business_id, party_id)   REFERENCES parties  (business_id, id),
  FOREIGN KEY (business_id, invoice_id) REFERENCES invoices (business_id, id),
  UNIQUE (business_id, id),
  CHECK ((settlement = 'exchange') = (invoice_id IS NOT NULL)),
  CHECK ((settlement = 'paid') = (paid_mode IS NOT NULL)),
  CHECK (settlement <> 'on_account' OR party_id IS NOT NULL),
  CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL))
);
CREATE UNIQUE INDEX ON purchase_vouchers (business_id, series_key, voucher_no);
CREATE INDEX ON purchase_vouchers (business_id, voucher_date DESC);
CREATE UNIQUE INDEX ON purchase_vouchers (invoice_id) WHERE invoice_id IS NOT NULL;  -- one exchange voucher per bill
-- Same guard as invoices: only issued → cancelled (cancel fields) allowed; no DELETE.
CREATE TRIGGER purchase_vouchers_guard BEFORE UPDATE OR DELETE ON purchase_vouchers
  FOR EACH ROW EXECUTE FUNCTION invoices_guard();   -- function is generic over these columns
-- An exchange voucher is cancelled only together with its invoice (same tx).

CREATE TABLE payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES businesses,
  party_id     uuid,
  invoice_id   uuid REFERENCES invoices,       -- null = on-account payment from party
  voucher_id   uuid REFERENCES purchase_vouchers,   -- set iff mode = 'old_gold'
  received_on  date NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  mode         text NOT NULL CHECK (mode IN ('cash','upi','bank','cheque','card','old_gold')),
  reference    text,                           -- UTR / cheque no.
  note         text,
  created_by   uuid REFERENCES users,
  created_at   timestamptz NOT NULL DEFAULT now(),
  voided_at    timestamptz,
  void_reason  text,
  FOREIGN KEY (business_id, party_id) REFERENCES parties (business_id, id),
  CHECK (party_id IS NOT NULL OR invoice_id IS NOT NULL),
  CHECK ((mode = 'old_gold') = (voucher_id IS NOT NULL)),
  CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);
CREATE INDEX ON payments (business_id, invoice_id) WHERE voided_at IS NULL;
CREATE INDEX ON payments (business_id, party_id, received_on) WHERE voided_at IS NULL;
-- Overpayment guard lives in the tx: SELECT … FROM invoices WHERE id=$1 FOR UPDATE; sum(payments)+new <= grand_total.
-- ponytail: one payment ↔ one invoice; add payment_allocations table when multi-invoice receipts are needed.

-- ── Audit ────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- gaps are fine here
  at            timestamptz NOT NULL DEFAULT now(),
  actor_type    text NOT NULL CHECK (actor_type IN ('user','admin','system')),
  actor_user_id uuid,
  actor_email   citext,
  business_id   uuid,
  action        text NOT NULL,      -- 'invoice.issued','invoice.cancelled','settings.updated','business.approved',...
  entity_type   text,
  entity_id     uuid,
  data          jsonb NOT NULL DEFAULT '{}',   -- {before:{…}, after:{…}} for settings; {invoice_no, total} for invoices
  ip            inet
);
CREATE INDEX ON audit_log (business_id, at DESC);
CREATE INDEX ON audit_log (action, at DESC);
```

## Tenant isolation
- The tenant middleware resolves `business_id` from the session's membership. Handlers never take it from the request body or URL.
- Every sqlc tenant query has `business_id = $1` (a code-review rule, plus a test that greps `queries/*.sql` for tenant tables lacking `business_id`).
- Composite FKs `(business_id, id)` stop cross-tenant references at the DB level.
- Integration test: seed businesses A and B, then call every tenant endpoint as A with B's IDs, and expect 404 for all of them.

## Invoice numbering (gapless, concurrency-safe)

Issue transaction (`docs.IssueInvoice`):
```
BEGIN
  SELECT * FROM invoices WHERE id=$1 AND business_id=$2 AND status='draft' FOR UPDATE
  load settings, business profile, party, logo id
  compute = tax.Compute(input, profile)        -- Go engine (authoritative)
  if compute.grand_total != client_expected_total → ROLLBACK, 409 (client shows refreshed totals)
  series_key = settings.fy_reset ? fyStartYear(invoice_date) : 0
  INSERT INTO number_series (business_id, doc_type, series_key, next_no)
       VALUES ($b,'invoice',$k, 1) ON CONFLICT DO NOTHING   -- new FY starts at 1; onboarding pre-seeds current FY
  UPDATE number_series SET next_no = next_no + 1
   WHERE business_id=$b AND doc_type='invoice' AND series_key=$k
   RETURNING next_no - 1 AS n                  -- row lock serialises concurrent issuers
  invoice_no = prefix + (include_fy ? "26-27/" : "") + lpad(n, min_digits)
  assert len(invoice_no) <= 16                 -- also enforced at settings save
  UPDATE invoices SET status='issued', invoice_no, series_key, snapshot, totals…, issued_at=now()
  IF input.old_gold present:                   -- exchange (same tx, so all-or-nothing)
    next number from number_series(doc_type='purchase_voucher')  → PV/26-27/007
    INSERT purchase_vouchers (settlement='exchange', invoice_id, snapshot, total)
    INSERT payments (invoice_id, voucher_id, mode='old_gold', amount=voucher total)
  INSERT audit_log ('invoice.issued' [+ 'voucher.issued'])
COMMIT
```
Standalone vouchers (`docs.IssueVoucher`) use the same numbering pattern with `doc_type='purchase_voucher'`. Cancelling an invoice that has an exchange voucher cancels the voucher and voids its `old_gold` payment in the same transaction.
- A rollback anywhere also rolls back the counter increment, so there are **no gaps**. Cancelled invoices keep their number, so the series stays continuous.
- Drafts have no number, so abandoned drafts never burn numbers.
- The onboarding "starting number" seeds `next_no` for the current FY (e.g. 148 when continuing from a paper book).
- Settings validation: `len(prefix) + (include_fy ? 6 : 0) + max(min_digits, 5) <= 16`, so 99,999 bills per year still fit.

## Snapshot document (`invoices.snapshot`)

```jsonc
{
  "schema": 1,
  "engine_version": 1,
  "template": { "version": "classic-v1", "config": { "accent": "#9A7B2F", "show": { "hsn": true, "gross_wt": true, "purity": true, "huid": false, "making_as_row": true } } },
  "doc":   { "type": "tax_invoice", "title": "TAX INVOICE", "no": "SJ/26-27/0148", "date": "2026-11-16",
             "date_of_supply": "2026-11-16", "place_of_supply": { "code": "08", "name": "Rajasthan" },
             "reverse_charge": false, "refs": { "eway_bill_no": null, "buyer_order_no": null, "dispatch_doc_no": null, "terms_of_delivery": null } },
  "seller": { "legal_name": "…", "trade_name": "…", "address": "…", "state": { "code": "08", "name": "Rajasthan" },
              "gstin": "08ABCDE1234F1Z5", "udyam_no": null, "phone": "…", "email": "…", "logo_id": "uuid|null",
              "bank": { "name": "…", "account_no": "…", "ifsc": "…", "branch": "…" } },
  "buyer":     { "name": "…", "address": "…", "state": { "code": "08", "name": "Rajasthan" }, "gstin": null, "phone": "…", "pan": null },
  "consignee": { "...same shape..." },
  "lines": [ { "sno": 1, "description": "22ct Gold Jewellery", "hsn": "7113", "purity": "22K", "huid": null, "unit": "g",
               "gross_weight_mg": 31800, "qty_milli": 31370, "rate_paise": 1345700, "rate_derived": false,
               "metal_paise": 42214609, "making": { "mode": "per_gram", "value": 35000, "paise": 1097950 },
               "other_paise": 0, "other_label": null, "taxable_paise": 43312559, "gst_rate": 3000 } ],
  "tax_groups": [ { "hsn": "7113", "gst_rate": 3000, "taxable_paise": 43312559, "cgst_paise": 649688, "sgst_paise": 649688, "igst_paise": 0 } ],
  "totals": { "supply_type": "intra", "sgst_label": "SGST", "taxable_paise": 43312559, "cgst_paise": 649688, "sgst_paise": 649688,
              "igst_paise": 0, "tcs_paise": 0, "round_off_paise": -35, "grand_total_paise": 44611900,
              "old_gold_paise": 13056000, "net_payable_paise": 31555900 },
  "old_gold": { "voucher_no": "PV/26-27/007", "lines": [ { "description": "Old gold ornaments", "purity": "22K",
                "gross_weight_mg": 10500, "less_weight_mg": 300, "net_weight_mg": 10200, "rate_paise": 1280000, "amount_paise": 13056000 } ],
                "round_off_paise": 0, "total_paise": 13056000 },     // null when no exchange
  "settings": { "copies": ["Customer","Store"], "terms": "…", "declaration": "…", "jurisdiction": "…", "signatory_name": "…" }
}
```
The logo bytes aren't copied into the snapshot. `logo_id` points at an immutable `logos` row, which is never deleted while referenced. The Go PDF template (versioned) produces amount-in-words and Indian formatting from these integers. **PDFs are never stored**: snapshot + template version = the same PDF every time.

`purchase_vouchers.snapshot` has the same shape minus tax: `{schema, template, doc:{no,date}, seller, from:{name,address,phone,pan}, lines:[…], totals:{total_paise, round_off_paise}, settlement}`.

## Reports (SQL sources)
- **Sales register:** `invoices WHERE status='issued' AND invoice_date BETWEEN …` using the typed total columns.
- **GST summary:** `SUM(cgst/sgst/igst/taxable)` grouped by month and B2B/B2C (`buyer_gstin IS NULL`).
- **HSN summary:** `jsonb_array_elements(snapshot->'tax_groups')` grouped by `hsn, gst_rate`. *ponytail: JSONB scan; materialise an `invoice_tax_groups` table if this gets slow.*
- **Old gold register:** `purchase_vouchers WHERE status='issued'` by date: voucher no, seller, seller kind, net weight, amount, settlement.
- **Party ledger:** a UNION ordered by date with a running balance (window function):
  - opening balance
  - issued invoices: debit `grand_total`
  - non-voided payments, including `old_gold`: credit
  - `on_account` vouchers: credit
  - `paid` vouchers: a credit (gold received) and a matching debit (cash paid out), which net to zero but are shown for the record

  Exchange vouchers already appear through their `old_gold` payment and aren't counted twice.
