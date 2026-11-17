# Tax Engine

Package `services/api/internal/tax` holds pure functions with no I/O and only stdlib. **It is the only tax implementation.** The UI calls `POST /api/invoices/compute` (debounced 300 ms) for live totals, and issue recomputes server-side. Amount-in-words and Indian formatting live in `internal/inr` (Go), and the PDF template and the `compute` response both use them.

## 1. Units
| Quantity | Type | Unit | Example |
|---|---|---|---|
| Money | int64 | paise | ₹13,457.00/g → `1345700` |
| Quantity / weight | int64 | milli-units (grams → mg) | 31.370 g → `31370` |
| GST / TCS rate | int32 | milli-percent | 3% → `3000`, 1.5% → `1500`, 0.25% → `250` |

Milli-percent exists because half of 0.25% (cut diamonds) is 0.125%. The largest product (≈10^12 paise × 10^5) overflows int64, so the multiply-then-divide helper uses `math/big`. **No floats anywhere.** User input like `"13457.5"` is parsed as a string straight into paise.

## 2. Rounding rules (normative)
**R0. Rounding function.** `roundHalfUp(n, d)` = round n/d to the nearest integer, with ties away from zero (symmetric for negative credit-note values). Every division goes through this one function.

1. **R1. Line components:** each is rounded to paise separately.
   - `metal = roundHalfUp(qty_milli × rate_paise, 1000)`
   - making `per_gram`: `roundHalfUp(qty_milli × value, 1000)`; `flat`: `value`; `percent`: `roundHalfUp(metal × value, 100000)`
   - `other = other_paise`
   - `taxable_line = metal + making + other`
2. **R2. Tax groups:** lines are grouped by `(hsn, gst_rate)`, and tax is computed per group on the group's taxable sum. The printed HSN summary therefore adds up exactly to the invoice totals.
3. **R3. Supply type:** from §3 POS.
   - intra: `cgst = roundHalfUp(taxable_g × rate, 200000)` and `sgst = cgst`. The label is `UTGST` when the seller's state is a UT without legislature.
   - inter: `igst = roundHalfUp(taxable_g × rate, 100000)`
   - Intra and inter totals may differ by 1 paisa (standard).
4. **R4. Bill of supply** (seller is composition or unregistered): no tax, and `doc_type = bill_of_supply`.
5. **R5. TCS** (per bill, default off): `tcs = roundHalfUp((taxable + GST) × tcs_rate, 100000)`.
   - Ordinary jewellery sales: **no TCS**, whatever the value. Jewellery isn't on the luxury-goods list (CBDT Notification 36/2025).
   - The jeweller switches TCS on only for a qualifying sale: **2%** on a scrap sale (s.394 Income-tax Act 2025; unusable manufacturing waste, not old jewellery) or **1%** on notified luxury goods.
   - GST TCS (s.52) applies only to e-commerce operators, so it is never charged.
6. **R6. Round off** (if enabled): `pre = taxable + gst + tcs`, `grand = roundHalfUp(pre, 100) × 100`, `round_off = grand − pre`, always in [−50, +50] paise. ₹x.50 rounds up.
7. **R7. Displayed rate in reverse mode:** `rate_paise = roundHalfUp((taxable_line − making − other) × 1000, qty_milli)` with `rate_derived = true`. The amount column is authoritative.
8. **R8. Old gold** (§5): there is no tax. Each line is `roundHalfUp(net_mg × rate, 1000)`, and the total is rounded to the rupee by R6.

## 3. Place of supply (your rule, verbatim)

```
IF customer is UNREGISTERED:
    IF customer state/address is recorded on invoice:
        place_of_supply = customer state
    ELSE:
        place_of_supply = shop state

ELSE IF customer is GST REGISTERED:
    IF goods movement is involved:
        place_of_supply = state where movement terminates for delivery
    ELSE:
        place_of_supply = state where goods are located at delivery

IF shop state == place_of_supply:
    Apply CGST + SGST
ELSE:
    Apply IGST
```

How the inputs map:
- **Registered** means `buyer.gstin` is present (checksum valid).
- **Movement** is `goods_movement`. The terminating state is `delivery_state`, else the consignee's state, else the buyer's state.
- **No movement** means the goods are located at the shop at delivery, so POS = shop state.
- **Recorded state** for an unregistered buyer is `delivery_state` if set (delivery address differs from billing), else `buyer.state_code`.
- `place_of_supply_override` (optional, per bill) always wins and is noted in the audit log.

**Legal basis (confirmed):**
- Unregistered buyer: s.10(1)(ca) IGST Act (from 1 Oct 2023), CBIC Circular 209/03/2024-GST. Recording just the state is enough. Example: Delhi shop, Haryana walk-in who collects at the Delhi counter → POS Haryana → **IGST**.
- Registered buyer: s.10(1)(a)/(b) rules, as in the pseudocode.

The rule is one function (`tax.PlaceOfSupply`).

## 4. Reverse ("Total se") mode
The jeweller chooses per bill. Input: each line's `target_total_paise` T (incl. GST, excl. TCS) and rate r.

```
est        = T × 100000 / (100000 + r_effective)       // exact rational; r_effective = 0 for bill of supply
step       = settings.reverse_round_taxable_rupee ? 100 : 1
candidates = [floor(est/step)·step, ceil(est/step)·step], ordered by |c − est|
for c in candidates:
    line.taxable = c        // metal = c − making − other (making 'percent' solved as c / (1 + pct))
    compute taxes (R2, R3)
    accept if (round_off ? roundRupee(c + tax) == T : c + tax == T)
none accepted, step 100 → retry with step 1 (a rupee-step taxable can't always hit T, e.g. at 28%)
still none (round_off off) → closest, with warning "₹0.03 short of target"
```
**Multi-line:** if the invoice's `roundRupee(pre) ≠ ΣT`, the largest line's taxable is moved by `(ΣT − pre)/(1 + r)` (rounded to the step on the first try, then to the paisa), at most 2 times. If it still misses, a warning is shown.
**Fuzz invariant:** for all T ≥ ₹1, rates {0, 250, 1000, 3000, 5000, 12000, 18000, 28000}, and both step settings, `grand_total == ΣT` when round-off is on.

## 5. Old gold exchange
- **Line:** `net_weight_mg = gross_weight_mg − less_weight_mg` (stone/wastage), which must be > 0. `amount = roundHalfUp(net_mg × rate_paise, 1000)`.
- **Total:** `pre = Σ amount`, `total = roundHalfUp(pre, 100) × 100`, `round_off = total − pre`.
- **On the invoice:** `grand_total` (GST value) is **unchanged**. `net_payable = grand_total − old_gold_total`. 422 if `old_gold_total > grand_total`.
- **GST on the exchange sale (confirmed):** GST is on the full value of the new jewellery. Old gold is non-monetary consideration, not a discount (Rule 27 CGST Rules; CBIC jewellery FAQ: 3% on the total transaction value incl. making).
- **The old gold purchase:** no tax is computed in either case. Each voucher records `seller_kind`:
  - `individual` (default): someone selling personal jewellery. This is not a "supply" (s.7 CGST; PIB press release 13 Jul 2017), so there is no GST and no RCM.
  - `business`: an unregistered dealer. There is no automatic RCM: s.9(4) covers only notified categories, and Notification 06/2024-CT(R) (metal scrap) covers Ch. 72–81, not gold (Ch. 71). Notification 07/2019 is about real-estate promoters. The CBIC sectoral FAQ that says otherwise predates the 2019 amendment. `seller_kind` is recorded for the register only, and nothing is computed from it.
  - *ponytail: no RCM computation. Add it if a notification ever covers Ch. 71.*

## 5a. Making charges vs job work
- **Retail making** stays inside the jewellery line (R1 `making`) and is taxed at the line's **3%**. It is never split out at another rate.
- **Job work** (Chapter 71 work done on someone else's gold) is a separate `kind: "charge"` line using the "Job work" preset, SAC 9988, **5%**. The jeweller picks it explicitly. A line that merely says "making" is never treated as job work.
- **Repairs and other services** are a `charge` line with whatever SAC/rate the jeweller enters.

## 6. Worked examples (unit-test vectors)

### Bill A: intra-state, reverse
52.161 g Standard Gold 0.995, HSN 71081310, target ₹7,60,000.00 incl. 3%, unregistered buyer with no other state recorded (POS = shop state), `reverse_round_taxable_rupee = on`.

| Step | Calculation | Result |
|---|---|---|
| est | 7,60,00,000 × 100000 / 103000 | 7,37,86,407.77 paise |
| candidates | 73786400 (Δ 7.77), 73786500 (Δ 92.23) | try 73786400 |
| CGST = SGST | roundHalfUp(73786400 × 3000, 200000) = 1106796 | **₹11,067.96** each |
| pre | 73786400 + 2213592 | ₹7,59,999.92 → rounds to ₹7,60,000 = T ✓ |
| round off | | **+₹0.08** |
| taxable | | **₹7,37,864.00** |
| derived rate | roundHalfUp(73786400 × 1000, 52161) = 1414589 | ₹14,145.89/g |
| words | | "Rupees Seven Lakh Sixty Thousand Only" |
| tax words | ₹22,135.92 | "Rupees Twenty-Two Thousand One Hundred Thirty-Five and Ninety-Two Paise Only" |

### Bill B: intra-state, forward
22ct jewellery, HSN 7113, net 31.370 g @ ₹13,457/g, labour ₹350/g, 3%.

| Step | Calculation | Result |
|---|---|---|
| metal | roundHalfUp(31370 × 1345700, 1000) = 42214609 | **₹4,22,146.09** (handwritten ₹4,22,155 was an error) |
| making | roundHalfUp(31370 × 35000, 1000) = 1097950 | **₹10,979.50** |
| taxable | | **₹4,33,125.59** |
| CGST = SGST | roundHalfUp(43312559 × 3000, 200000) = 649688 | **₹6,496.88** each |
| pre | | ₹4,46,119.35 |
| round off / grand | | **−₹0.35 / ₹4,46,119.00** |
| tax words | ₹12,993.76 | "Rupees Twelve Thousand Nine Hundred Ninety-Three and Seventy-Six Paise Only" |

### Bill B′: same, inter-state
Registered buyer in Delhi (07) with goods movement. IGST = roundHalfUp(43312559 × 3000, 100000) = 1299377 (₹12,993.77). pre ₹4,46,119.36, round off −₹0.36, grand ₹4,46,119.00.

### Bill B + old gold exchange
Old gold: gross 10.500 g, less 0.300 g → net 10.200 g @ ₹12,800/g.

| Step | Calculation | Result |
|---|---|---|
| amount | roundHalfUp(10200 × 1280000, 1000) = 13056000 | ₹1,30,560.00 (round off 0) |
| grand total (GST value) | unchanged | ₹4,46,119.00 |
| net payable | 44611900 − 13056000 | **₹3,15,559.00**, "Rupees Three Lakh Fifteen Thousand Five Hundred Fifty-Nine Only" |

## 7. Test cases (`internal/tax/engine_test.go`, table-driven)
**Must pass:** Bill A, Bill B, Bill B′, the old gold exchange case.

**Plus:**
- POS rule: all four branches + override, plus `delivery_state` beating `buyer.state_code` for an unregistered buyer, plus the Delhi-shop / Haryana-walk-in → IGST case
- half-paisa tie
- negative amounts (credit note)
- making `percent` / `flat`
- two HSN groups
- 0.25% rate
- 0% rate
- UTGST label
- TCS on
- round-off off
- reverse with step 1
- reverse multi-line nudge
- `.50` rupee round-up
- ₹10 crore / 100 kg with no overflow
- bill of supply
- old gold with paise and rupee round-off (e.g. 3.333 g @ ₹12,345 = 4114588.5 → 4114589 paise → total ₹41,146.00, round off +₹0.11)
- old gold > grand total → error

**Other tests:**
- `fuzz_test.go`: the reverse invariant, `round_off ∈ [−50, 50]`, intra `cgst == sgst`.
- `internal/inr`: words for 0, 0.08, 1 lakh, 1 crore, 100 crore, and negatives; grouping for `0.00`, `999.99`, `1,00,000.00`, `7,37,864.00`.
- `internal/gstin`: checksum corpus.

## 8. GSTIN checksum
For the first 14 characters: `v = index in "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"`, factor alternates 1, 2 starting at 1, `p = v × factor`, `sum += p/36 + p%36`. The check character is `chars[(36 − sum%36) % 36]`. The prefix must be a valid state code, and characters 3–12 must match the PAN pattern. The server is authoritative. The web form has a ~15-line TS copy for instant feedback only.

## 9. Versioning
`engine_version` is stored per document and bumped on any change that could alter a number. Issued documents are never recomputed, because they render from the snapshot.
