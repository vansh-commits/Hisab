-- +goose Up
CREATE TABLE logos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES businesses ON DELETE CASCADE,
  sha256       bytea NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
  data         bytea NOT NULL CHECK (octet_length(data) <= 204800),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, sha256)
);
ALTER TABLE businesses ADD FOREIGN KEY (logo_id) REFERENCES logos;
-- Onboarding saves GST status (step 1) before the GSTIN (step 2), so "regular needs a GSTIN" holds once active.
ALTER TABLE businesses DROP CONSTRAINT businesses_check1,
  ADD CONSTRAINT businesses_regular_gstin CHECK (status <> 'active' OR registration_type IS DISTINCT FROM 'regular' OR gstin IS NOT NULL);

CREATE TABLE business_settings (
  business_id      uuid PRIMARY KEY REFERENCES businesses ON DELETE CASCADE,
  invoice_prefix   text NOT NULL DEFAULT 'INV/' CHECK (invoice_prefix ~ '^[A-Za-z0-9/-]{0,8}$'),
  include_fy       boolean NOT NULL DEFAULT true,
  number_min_digits smallint NOT NULL DEFAULT 3 CHECK (number_min_digits BETWEEN 1 AND 8),
  fy_reset         boolean NOT NULL DEFAULT true,
  copies           text[] NOT NULL DEFAULT '{original}'
                   CHECK (copies <@ ARRAY['original','duplicate','triplicate'] AND cardinality(copies) >= 1),
  terms            text NOT NULL DEFAULT '',
  declaration      text NOT NULL DEFAULT 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  jurisdiction     text NOT NULL DEFAULT '',
  signatory_name   text NOT NULL DEFAULT '',
  bank_name        text, bank_account_name text, bank_account_no text,
  bank_ifsc        text CHECK (bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_branch      text, upi_id text,
  default_gst_rate     int    NOT NULL DEFAULT 3000 CHECK (default_gst_rate BETWEEN 0 AND 28000),
  default_making_mode  text   NOT NULL DEFAULT 'per_gram' CHECK (default_making_mode IN ('per_gram','flat','percent')),
  default_making_value bigint NOT NULL DEFAULT 0 CHECK (default_making_value >= 0),
  round_off_enabled            boolean NOT NULL DEFAULT true,
  reverse_round_taxable_rupee  boolean NOT NULL DEFAULT true,
  template_version text  NOT NULL DEFAULT 'classic-v1',
  template_config  jsonb NOT NULL DEFAULT '{}',
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE number_series (
  business_id uuid NOT NULL REFERENCES businesses ON DELETE CASCADE,
  doc_type    text NOT NULL CHECK (doc_type IN ('invoice','purchase_voucher','credit_note','debit_note')),
  series_key  smallint NOT NULL,
  next_no     int NOT NULL DEFAULT 1 CHECK (next_no > 0),
  PRIMARY KEY (business_id, doc_type, series_key)
);

CREATE TABLE metal_rates (
  business_id uuid NOT NULL REFERENCES businesses ON DELETE CASCADE,
  metal       text NOT NULL CHECK (metal <> ''),
  rate_paise  bigint NOT NULL CHECK (rate_paise > 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, metal)
);

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
  opening_balance_paise bigint NOT NULL DEFAULT 0,
  opening_balance_date  date,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (gstin IS NULL OR bill_state_code IS NULL OR left(gstin,2) = bill_state_code),
  UNIQUE (business_id, id)
);
CREATE INDEX ON parties (business_id) WHERE archived_at IS NULL;
CREATE INDEX ON parties USING gin (name gin_trgm_ops);
CREATE INDEX ON parties (business_id, phone);

CREATE TABLE items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses ON DELETE CASCADE,
  name          text NOT NULL CHECK (name <> ''),
  hsn           text CHECK (hsn ~ '^[0-9]{4}([0-9]{2}){0,2}$'),
  unit          text NOT NULL DEFAULT 'g' CHECK (unit IN ('g','pcs','ct','pair','set','nos')),
  purity        text,
  gst_rate      int NOT NULL DEFAULT 3000 CHECK (gst_rate BETWEEN 0 AND 28000),
  default_rate_paise bigint CHECK (default_rate_paise >= 0),
  metal         text,
  making_mode   text CHECK (making_mode IN ('per_gram','flat','percent')),
  making_value  bigint CHECK (making_value >= 0),
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id)
);
CREATE INDEX ON items (business_id) WHERE archived_at IS NULL;
CREATE INDEX ON items USING gin (name gin_trgm_ops);

-- +goose Down
ALTER TABLE businesses DROP CONSTRAINT businesses_regular_gstin,
  ADD CONSTRAINT businesses_check1 CHECK (registration_type IS DISTINCT FROM 'regular' OR gstin IS NOT NULL);
ALTER TABLE businesses DROP CONSTRAINT businesses_logo_id_fkey;
DROP TABLE items, parties, metal_rates, number_series, business_settings, logos;
