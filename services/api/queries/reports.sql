-- name: SalesRegister :many
SELECT invoice_no, invoice_date, doc_type, status, buyer_name, buyer_gstin, place_of_supply, supply_type,
  taxable_paise, cgst_paise, sgst_paise, igst_paise, tcs_paise, round_off_paise, grand_total_paise
FROM invoices
WHERE business_id = @business_id AND status <> 'draft' AND invoice_date BETWEEN @date_from::date AND @date_to::date
ORDER BY invoice_date, invoice_no;

-- name: GSTSummary :many
SELECT to_char(invoice_date, 'YYYY-MM') AS month, (buyer_gstin IS NOT NULL)::bool AS b2b, COALESCE(supply_type, 'intra')::text AS supply_type,
  count(*) AS invoices, sum(taxable_paise)::bigint AS taxable_paise, sum(cgst_paise)::bigint AS cgst_paise,
  sum(sgst_paise)::bigint AS sgst_paise, sum(igst_paise)::bigint AS igst_paise, sum(grand_total_paise)::bigint AS total_paise
FROM invoices
WHERE business_id = @business_id AND status = 'issued' AND invoice_date BETWEEN @date_from::date AND @date_to::date
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- name: HSNSummary :many
SELECT (g->>'hsn')::text AS hsn, (g->>'gst_rate')::int AS gst_rate,
  sum((g->>'taxable_paise')::bigint)::bigint AS taxable_paise, sum((g->>'cgst_paise')::bigint)::bigint AS cgst_paise,
  sum((g->>'sgst_paise')::bigint)::bigint AS sgst_paise, sum((g->>'igst_paise')::bigint)::bigint AS igst_paise
FROM invoices, jsonb_array_elements(snapshot->'tax_groups') g
WHERE business_id = @business_id AND status = 'issued' AND invoice_date BETWEEN @date_from::date AND @date_to::date
GROUP BY 1, 2 ORDER BY 1, 2;

-- name: HSNQuantities :many
SELECT COALESCE(l->>'hsn', '')::text AS hsn, (l->>'gst_rate')::int AS gst_rate, (l->>'unit')::text AS unit,
  sum((l->>'qty_milli')::bigint)::bigint AS qty_milli
FROM invoices, jsonb_array_elements(snapshot->'lines') l
WHERE business_id = @business_id AND status = 'issued' AND invoice_date BETWEEN @date_from::date AND @date_to::date
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- name: OldGoldRegister :many
SELECT v.voucher_no, v.voucher_date, v.status, v.seller_name, v.seller_kind, v.settlement, v.net_weight_mg, v.total_paise,
  i.invoice_no
FROM purchase_vouchers v LEFT JOIN invoices i ON i.id = v.invoice_id AND i.business_id = v.business_id
WHERE v.business_id = @business_id AND v.voucher_date BETWEEN @date_from::date AND @date_to::date
ORDER BY v.voucher_date, v.voucher_no;

-- name: PartyLedger :many
SELECT i.invoice_date AS date, 'invoice'::text AS type, i.invoice_no::text AS ref, i.id, i.grand_total_paise AS debit_paise, 0::bigint AS credit_paise, i.issued_at AS at
  FROM invoices i WHERE i.business_id = $1 AND i.party_id = $2 AND i.status = 'issued'
UNION ALL
SELECT y.received_on, CASE WHEN y.mode = 'old_gold' THEN 'old_gold' ELSE 'payment' END, concat_ws(' ', upper(y.mode), y.reference), y.id, 0, y.amount_paise, y.created_at
  FROM payments y WHERE y.business_id = $1 AND y.party_id = $2 AND y.voided_at IS NULL
UNION ALL
SELECT v.voucher_date, 'voucher', v.voucher_no, v.id, 0, v.total_paise, v.created_at
  FROM purchase_vouchers v WHERE v.business_id = $1 AND v.party_id = $2 AND v.status = 'issued' AND v.settlement IN ('on_account', 'paid')
UNION ALL
SELECT v.voucher_date, 'voucher_paid', v.voucher_no, v.id, v.total_paise, 0, v.created_at
  FROM purchase_vouchers v WHERE v.business_id = $1 AND v.party_id = $2 AND v.status = 'issued' AND v.settlement = 'paid'
ORDER BY 1, 7, 2;

-- name: HomeSales :one
SELECT
  COALESCE(sum(CASE WHEN invoice_date = @today::date THEN grand_total_paise END), 0)::bigint AS today_paise,
  count(CASE WHEN invoice_date = @today::date THEN 1 END) AS today_count,
  COALESCE(sum(grand_total_paise), 0)::bigint AS month_paise,
  count(*) AS month_count
FROM invoices WHERE business_id = @business_id AND status = 'issued' AND invoice_date >= @month_start::date;

-- name: Outstanding :one
SELECT (
  (SELECT COALESCE(sum(grand_total_paise), 0) FROM invoices i WHERE i.business_id = @business_id AND i.status = 'issued')
  + (SELECT COALESCE(sum(opening_balance_paise), 0) FROM parties p WHERE p.business_id = @business_id)
  - (SELECT COALESCE(sum(amount_paise), 0) FROM payments y WHERE y.business_id = @business_id AND y.voided_at IS NULL)
  - (SELECT COALESCE(sum(total_paise), 0) FROM purchase_vouchers v WHERE v.business_id = @business_id AND v.status = 'issued' AND v.settlement = 'on_account')
)::bigint AS outstanding_paise;

-- name: PartyBalances :many
SELECT p.id, p.name, p.phone, p.opening_balance_paise + COALESCE(x.bal, 0) AS balance_paise
FROM parties p
LEFT JOIN LATERAL (
  SELECT (SELECT COALESCE(sum(grand_total_paise), 0) FROM invoices WHERE business_id = p.business_id AND party_id = p.id AND status = 'issued')
       - (SELECT COALESCE(sum(amount_paise), 0) FROM payments WHERE business_id = p.business_id AND party_id = p.id AND voided_at IS NULL)
       - (SELECT COALESCE(sum(total_paise), 0) FROM purchase_vouchers WHERE business_id = p.business_id AND party_id = p.id AND status = 'issued' AND settlement = 'on_account') AS bal
) x ON true
WHERE p.business_id = $1 AND p.archived_at IS NULL
ORDER BY p.name;

-- name: InvoicesIssuedSince :one
-- cross-tenant: admin metrics only.
SELECT count(*) FROM invoices WHERE status <> 'draft' AND issued_at >= $1;
