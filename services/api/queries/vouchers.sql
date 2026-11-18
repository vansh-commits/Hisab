-- name: CreateVoucher :one
INSERT INTO purchase_vouchers (business_id, series_key, voucher_no, voucher_date, fy, party_id, seller_name, seller_kind,
  settlement, invoice_id, paid_mode, snapshot, net_weight_mg, total_paise, round_off_paise, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *;

-- name: GetVoucher :one
SELECT * FROM purchase_vouchers WHERE id = $1 AND business_id = $2;

-- name: LockVoucher :one
SELECT * FROM purchase_vouchers WHERE id = $1 AND business_id = $2 FOR UPDATE;

-- name: VoucherForInvoice :one
SELECT * FROM purchase_vouchers WHERE business_id = $1 AND invoice_id = $2;

-- name: CancelVoucher :exec
UPDATE purchase_vouchers SET status = 'cancelled', cancel_reason = $3, cancelled_by = $4, cancelled_at = now()
WHERE id = $1 AND business_id = $2 AND status = 'issued';

-- name: ListVouchers :many
SELECT id, status, voucher_no, voucher_date, party_id, seller_name, seller_kind, settlement, invoice_id, paid_mode,
  net_weight_mg, total_paise
FROM purchase_vouchers
WHERE business_id = @business_id
  AND (sqlc.narg('party_id')::uuid IS NULL OR party_id = sqlc.narg('party_id'))
  AND (sqlc.narg('from')::date IS NULL OR voucher_date >= sqlc.narg('from'))
  AND (sqlc.narg('to')::date IS NULL OR voucher_date <= sqlc.narg('to'))
  AND (sqlc.narg('after_date')::date IS NULL OR (voucher_date, id) < (sqlc.narg('after_date'), sqlc.narg('after_id')::uuid))
ORDER BY voucher_date DESC, id DESC
LIMIT 50;

-- name: CreatePayment :one
INSERT INTO payments (business_id, party_id, invoice_id, voucher_id, received_on, amount_paise, mode, reference, note, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *;

-- name: GetPayment :one
SELECT * FROM payments WHERE id = $1 AND business_id = $2;

-- name: VoidPayment :execrows
UPDATE payments SET voided_at = now(), void_reason = $3
WHERE id = $1 AND business_id = $2 AND voided_at IS NULL AND mode <> 'old_gold';

-- name: VoidVoucherPayments :exec
UPDATE payments SET voided_at = now(), void_reason = $3
WHERE business_id = $1 AND voucher_id = $2 AND voided_at IS NULL;

-- name: ListPayments :many
SELECT p.*, i.invoice_no FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id AND i.business_id = p.business_id
WHERE p.business_id = @business_id
  AND (sqlc.narg('party_id')::uuid IS NULL OR p.party_id = sqlc.narg('party_id'))
  AND (sqlc.narg('invoice_id')::uuid IS NULL OR p.invoice_id = sqlc.narg('invoice_id'))
  AND (sqlc.narg('from')::date IS NULL OR p.received_on >= sqlc.narg('from'))
  AND (sqlc.narg('to')::date IS NULL OR p.received_on <= sqlc.narg('to'))
ORDER BY p.received_on DESC, p.created_at DESC
LIMIT 200;
