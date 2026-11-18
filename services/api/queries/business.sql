-- name: UpdateProfile :one
UPDATE businesses SET registration_type = $2, legal_name = $3, trade_name = $4, address_line1 = $5,
  address_line2 = $6, city = $7, pincode = $8, state_code = $9, phone = $10, email = $11, gstin = $12,
  udyam_no = $13, updated_at = now()
WHERE id = $1 RETURNING *;

-- name: UpsertLogo :one
INSERT INTO logos (business_id, sha256, content_type, data) VALUES ($1, $2, $3, $4)
ON CONFLICT (business_id, sha256) DO UPDATE SET content_type = EXCLUDED.content_type
RETURNING id;

-- name: SetLogo :exec
UPDATE businesses SET logo_id = $2, updated_at = now() WHERE id = $1;

-- name: GetLogo :one
SELECT content_type, data FROM logos WHERE id = $1 AND business_id = $2;

-- name: EnsureSettings :exec
INSERT INTO business_settings (business_id) VALUES ($1) ON CONFLICT DO NOTHING;

-- name: GetSettings :one
SELECT * FROM business_settings WHERE business_id = $1;

-- name: UpdateSettings :one
UPDATE business_settings SET invoice_prefix = $2, include_fy = $3, number_min_digits = $4, fy_reset = $5,
  copies = $6, terms = $7, declaration = $8, jurisdiction = $9, signatory_name = $10,
  bank_name = $11, bank_account_name = $12, bank_account_no = $13, bank_ifsc = $14, bank_branch = $15, upi_id = $16,
  default_gst_rate = $17, default_making_mode = $18, default_making_value = $19,
  round_off_enabled = $20, reverse_round_taxable_rupee = $21, template_config = $22, updated_at = now()
WHERE business_id = $1 RETURNING *;

-- name: NextNo :one
SELECT next_no FROM number_series WHERE business_id = $1 AND doc_type = $2 AND series_key = $3;

-- name: SetNextNo :exec
INSERT INTO number_series (business_id, doc_type, series_key, next_no) VALUES ($1, $2, $3, $4)
ON CONFLICT (business_id, doc_type, series_key) DO UPDATE SET next_no = EXCLUDED.next_no;

-- name: ListRates :many
SELECT metal, rate_paise, updated_at FROM metal_rates WHERE business_id = $1 ORDER BY metal;

-- name: DeleteRates :exec
DELETE FROM metal_rates WHERE business_id = $1;

-- name: InsertRate :exec
INSERT INTO metal_rates (business_id, metal, rate_paise) VALUES ($1, $2, $3);

-- name: SetOnboardingStep :exec
UPDATE businesses SET onboarding_step = $2, updated_at = now() WHERE id = $1 AND status = 'approved';

-- name: CompleteOnboarding :one
UPDATE businesses SET status = 'active', onboarded_at = now(), updated_at = now()
WHERE id = $1 AND status = 'approved' RETURNING *;
