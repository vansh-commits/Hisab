-- name: CreateInvoice :one
INSERT INTO invoices (business_id, doc_type, invoice_date, fy, party_id, buyer_name, buyer_gstin, input, created_by,
  taxable_paise, grand_total_paise, old_gold_paise, net_payable_paise)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *;

-- name: UpdateDraft :one
UPDATE invoices SET doc_type = $3, invoice_date = $4, fy = $5, party_id = $6, buyer_name = $7, buyer_gstin = $8,
  input = $9, taxable_paise = $10, grand_total_paise = $11, old_gold_paise = $12, net_payable_paise = $13, updated_at = now()
WHERE id = $1 AND business_id = $2 AND status = 'draft' RETURNING *;

-- name: DeleteDraft :execrows
DELETE FROM invoices WHERE id = $1 AND business_id = $2 AND status = 'draft';

-- name: GetInvoice :one
SELECT * FROM invoices WHERE id = $1 AND business_id = $2;

-- name: LockInvoice :one
SELECT * FROM invoices WHERE id = $1 AND business_id = $2 FOR UPDATE;

-- name: IssueInvoice :one
UPDATE invoices SET status = 'issued', doc_type = $3, invoice_date = $4, fy = $5, party_id = $6, buyer_name = $7,
  buyer_gstin = $8, input = $9, series_key = $10, invoice_no = $11, snapshot = $12, template_version = $13,
  engine_version = $14, place_of_supply = $15, supply_type = $16, taxable_paise = $17, cgst_paise = $18,
  sgst_paise = $19, igst_paise = $20, tcs_rate = $21, tcs_paise = $22, round_off_paise = $23,
  grand_total_paise = $24, old_gold_paise = $25, net_payable_paise = $26, issued_by = $27,
  issued_at = now(), updated_at = now()
WHERE id = $1 AND business_id = $2 AND status = 'draft' RETURNING *;

-- name: CancelInvoice :one
UPDATE invoices SET status = 'cancelled', cancel_reason = $3, cancelled_by = $4, cancelled_at = now(), updated_at = now()
WHERE id = $1 AND business_id = $2 AND status = 'issued' RETURNING *;

-- name: ListInvoices :many
SELECT i.id, i.doc_type, i.status, i.invoice_no, i.invoice_date, i.party_id, i.buyer_name, i.buyer_gstin,
  i.grand_total_paise, i.old_gold_paise, i.net_payable_paise, i.created_at,
  COALESCE((SELECT sum(p.amount_paise) FROM payments p
            WHERE p.business_id = i.business_id AND p.invoice_id = i.id AND p.voided_at IS NULL), 0)::bigint AS paid_paise
FROM invoices i
WHERE i.business_id = @business_id
  AND (sqlc.narg('status')::text IS NULL OR i.status = sqlc.narg('status'))
  AND (sqlc.narg('doc_type')::text IS NULL OR i.doc_type = sqlc.narg('doc_type'))
  AND (sqlc.narg('party_id')::uuid IS NULL OR i.party_id = sqlc.narg('party_id'))
  AND (sqlc.narg('from')::date IS NULL OR i.invoice_date >= sqlc.narg('from'))
  AND (sqlc.narg('to')::date IS NULL OR i.invoice_date <= sqlc.narg('to'))
  AND (sqlc.narg('q')::text IS NULL OR i.buyer_name ILIKE '%' || sqlc.narg('q') || '%' OR i.invoice_no ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('after_date')::date IS NULL OR (i.invoice_date, i.id) < (sqlc.narg('after_date'), sqlc.narg('after_id')::uuid))
ORDER BY i.invoice_date DESC, i.id DESC
LIMIT 50;

-- name: LastIssuedDate :one
SELECT invoice_date FROM invoices WHERE business_id = $1 AND status <> 'draft' ORDER BY invoice_date DESC LIMIT 1;

-- name: EnsureSeries :exec
INSERT INTO number_series (business_id, doc_type, series_key, next_no) VALUES ($1, $2, $3, 1)
ON CONFLICT DO NOTHING;

-- name: TakeNumber :one
UPDATE number_series SET next_no = next_no + 1
WHERE business_id = $1 AND doc_type = $2 AND series_key = $3
RETURNING (next_no - 1)::int AS n;

-- name: IssuedInSeries :one
SELECT EXISTS (SELECT 1 FROM invoices WHERE business_id = $1 AND series_key = $2 AND status <> 'draft');

-- name: PaidForInvoice :one
SELECT COALESCE(sum(amount_paise), 0)::bigint FROM payments
WHERE business_id = $1 AND invoice_id = $2 AND voided_at IS NULL;

-- name: LiveCashPayments :one
SELECT count(*) FROM payments
WHERE business_id = $1 AND invoice_id = $2 AND voided_at IS NULL AND mode <> 'old_gold';

-- name: InvoicePayments :many
SELECT * FROM payments WHERE business_id = $1 AND invoice_id = $2 ORDER BY received_on, created_at;

-- name: LockSeries :exec
SELECT 1 FROM number_series WHERE business_id = $1 AND doc_type = $2 AND series_key = $3 FOR UPDATE;
