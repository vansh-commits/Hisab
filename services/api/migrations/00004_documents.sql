-- +goose Up
CREATE TABLE invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses,
  doc_type      text NOT NULL CHECK (doc_type IN ('tax_invoice','bill_of_supply','credit_note','debit_note')),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','cancelled')),
  series_key    smallint,
  invoice_no    text CHECK (char_length(invoice_no) <= 16 AND invoice_no ~ '^[A-Za-z0-9/-]+$'),
  invoice_date  date NOT NULL,
  fy            smallint NOT NULL,
  party_id      uuid,
  buyer_name    text NOT NULL DEFAULT '',
  buyer_gstin   char(15),
  original_invoice_id uuid REFERENCES invoices,
  input         jsonb NOT NULL,
  snapshot      jsonb,
  template_version text,
  engine_version   smallint,
  place_of_supply char(2) REFERENCES states,
  supply_type   text CHECK (supply_type IN ('intra','inter')),
  taxable_paise   bigint NOT NULL DEFAULT 0,
  cgst_paise      bigint NOT NULL DEFAULT 0,
  sgst_paise      bigint NOT NULL DEFAULT 0,
  igst_paise      bigint NOT NULL DEFAULT 0,
  tcs_rate        int NOT NULL DEFAULT 0 CHECK (tcs_rate BETWEEN 0 AND 10000),
  tcs_paise       bigint NOT NULL DEFAULT 0,
  round_off_paise bigint NOT NULL DEFAULT 0 CHECK (round_off_paise BETWEEN -50 AND 50),
  grand_total_paise bigint NOT NULL DEFAULT 0,
  old_gold_paise    bigint NOT NULL DEFAULT 0 CHECK (old_gold_paise >= 0),
  net_payable_paise bigint NOT NULL DEFAULT 0,
  CHECK (net_payable_paise = grand_total_paise - old_gold_paise),
  CHECK (old_gold_paise <= grand_total_paise),
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
  FOREIGN KEY (business_id, party_id) REFERENCES parties (business_id, id),
  CHECK (status = 'draft' OR (invoice_no IS NOT NULL AND series_key IS NOT NULL AND snapshot IS NOT NULL AND issued_at IS NOT NULL)),
  CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL)),
  CHECK (doc_type <> 'tax_invoice' OR status = 'draft' OR supply_type IS NOT NULL)
);
CREATE UNIQUE INDEX invoices_number_uq ON invoices (business_id, doc_type, series_key, invoice_no)
  WHERE invoice_no IS NOT NULL;
CREATE INDEX ON invoices (business_id, invoice_date DESC, id DESC);
CREATE INDEX ON invoices (business_id, party_id, invoice_date);
CREATE INDEX ON invoices (business_id, status);
CREATE INDEX ON invoices USING gin (buyer_name gin_trgm_ops);

-- Issued documents are immutable: only issued → cancelled (with cancel fields) is allowed.
-- +goose StatementBegin
CREATE FUNCTION invoices_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed text[] := ARRAY['status','cancel_reason','cancelled_at','cancelled_by','updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'issued document % cannot be deleted', OLD.id; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'draft' THEN RETURN NEW; END IF;
  IF OLD.status = 'issued' AND NEW.status = 'cancelled'
     AND (to_jsonb(NEW) - allowed) = (to_jsonb(OLD) - allowed) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'document % is immutable (status %)', OLD.id, OLD.status;
END $$;
-- +goose StatementEnd
CREATE TRIGGER invoices_guard BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_guard();

ALTER TABLE invoices ADD UNIQUE (business_id, id);

CREATE TABLE purchase_vouchers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses,
  status        text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
  series_key    smallint NOT NULL,
  voucher_no    text NOT NULL CHECK (char_length(voucher_no) <= 16 AND voucher_no ~ '^[A-Za-z0-9/-]+$'),
  voucher_date  date NOT NULL,
  fy            smallint NOT NULL,
  party_id      uuid,
  seller_name   text NOT NULL,
  seller_kind   text NOT NULL DEFAULT 'individual' CHECK (seller_kind IN ('individual','business')),
  settlement    text NOT NULL CHECK (settlement IN ('exchange','paid','on_account')),
  invoice_id    uuid,
  paid_mode     text CHECK (paid_mode IN ('cash','upi','bank','cheque')),
  snapshot      jsonb NOT NULL,
  net_weight_mg bigint NOT NULL CHECK (net_weight_mg > 0),
  total_paise   bigint NOT NULL CHECK (total_paise > 0),
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
CREATE UNIQUE INDEX ON purchase_vouchers (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE TRIGGER purchase_vouchers_guard BEFORE UPDATE OR DELETE ON purchase_vouchers
  FOR EACH ROW EXECUTE FUNCTION invoices_guard();

CREATE TABLE payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES businesses,
  party_id     uuid,
  invoice_id   uuid,
  voucher_id   uuid,
  received_on  date NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  mode         text NOT NULL CHECK (mode IN ('cash','upi','bank','cheque','card','old_gold')),
  reference    text,
  note         text,
  created_by   uuid REFERENCES users,
  created_at   timestamptz NOT NULL DEFAULT now(),
  voided_at    timestamptz,
  void_reason  text,
  FOREIGN KEY (business_id, party_id)   REFERENCES parties (business_id, id),
  FOREIGN KEY (business_id, invoice_id) REFERENCES invoices (business_id, id),
  FOREIGN KEY (business_id, voucher_id) REFERENCES purchase_vouchers (business_id, id),
  CHECK (party_id IS NOT NULL OR invoice_id IS NOT NULL),
  CHECK ((mode = 'old_gold') = (voucher_id IS NOT NULL)),
  CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);
CREATE INDEX ON payments (business_id, invoice_id) WHERE voided_at IS NULL;
CREATE INDEX ON payments (business_id, party_id, received_on) WHERE voided_at IS NULL;

-- +goose Down
DROP TABLE payments, purchase_vouchers, invoices;
DROP FUNCTION invoices_guard;
