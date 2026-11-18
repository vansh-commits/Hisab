-- name: ListParties :many
SELECT * FROM parties
WHERE business_id = @business_id AND archived_at IS NULL
  AND (sqlc.narg('q')::text IS NULL OR name ILIKE '%' || sqlc.narg('q') || '%' OR phone LIKE sqlc.narg('q') || '%')
  AND (sqlc.narg('after_name')::text IS NULL OR (name, id) > (sqlc.narg('after_name'), sqlc.narg('after_id')::uuid))
ORDER BY name, id LIMIT 50;

-- name: GetParty :one
SELECT * FROM parties WHERE id = $1 AND business_id = $2;

-- name: CreateParty :one
INSERT INTO parties (business_id, name, phone, email, gstin, pan, bill_address, bill_state_code, ship_same_as_bill,
  ship_name, ship_address, ship_state_code, opening_balance_paise, opening_balance_date)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *;

-- name: UpdateParty :one
UPDATE parties SET name = $3, phone = $4, email = $5, gstin = $6, pan = $7, bill_address = $8, bill_state_code = $9,
  ship_same_as_bill = $10, ship_name = $11, ship_address = $12, ship_state_code = $13,
  opening_balance_paise = $14, opening_balance_date = $15, updated_at = now()
WHERE id = $1 AND business_id = $2 RETURNING *;

-- name: DeleteParty :execrows
DELETE FROM parties WHERE id = $1 AND business_id = $2;

-- name: ArchiveParty :execrows
UPDATE parties SET archived_at = now() WHERE id = $1 AND business_id = $2;

-- name: ListItems :many
SELECT * FROM items
WHERE business_id = @business_id AND archived_at IS NULL
  AND (sqlc.narg('q')::text IS NULL OR name ILIKE '%' || sqlc.narg('q') || '%')
ORDER BY name, id LIMIT 200;

-- name: GetItem :one
SELECT * FROM items WHERE id = $1 AND business_id = $2;

-- name: CreateItem :one
INSERT INTO items (business_id, name, hsn, unit, purity, gst_rate, default_rate_paise, metal, making_mode, making_value)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *;

-- name: UpdateItem :one
UPDATE items SET name = $3, hsn = $4, unit = $5, purity = $6, gst_rate = $7, default_rate_paise = $8, metal = $9,
  making_mode = $10, making_value = $11, updated_at = now()
WHERE id = $1 AND business_id = $2 RETURNING *;

-- name: DeleteItem :execrows
DELETE FROM items WHERE id = $1 AND business_id = $2;

-- name: ArchiveItem :execrows
UPDATE items SET archived_at = now() WHERE id = $1 AND business_id = $2;
