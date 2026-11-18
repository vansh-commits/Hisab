-- +goose Up
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE,
  name          text NOT NULL DEFAULT '',
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE auth_identities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  provider   text NOT NULL CHECK (provider IN ('google')),
  subject    text NOT NULL,
  email      citext,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);
CREATE INDEX ON auth_identities (user_id);

CREATE TABLE sessions (
  token_hash   bytea PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  audience     text NOT NULL CHECK (audience IN ('app','admin')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  ip           inet,
  user_agent   text
);
CREATE INDEX ON sessions (user_id);
CREATE INDEX ON sessions (expires_at);

CREATE TABLE businesses (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending','rejected','approved','active','suspended')),

  applicant_business_name text NOT NULL,
  applicant_owner_name    text NOT NULL,
  applicant_phone         text NOT NULL CHECK (applicant_phone ~ '^\+91[6-9][0-9]{9}$'),
  applicant_city          text NOT NULL,
  applicant_gstin         text,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewed_by  citext,
  review_note  text,

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
  gstin         char(15) CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  udyam_no      text CHECK (udyam_no ~ '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$'),
  logo_id       uuid,
  onboarding_step smallint NOT NULL DEFAULT 0,
  onboarded_at  timestamptz,
  suspended_at  timestamptz,
  suspend_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CHECK (gstin IS NULL OR state_code IS NULL OR left(gstin, 2) = state_code),
  CHECK (registration_type IS DISTINCT FROM 'regular' OR gstin IS NOT NULL),
  CHECK (status <> 'active' OR onboarded_at IS NOT NULL)
);
CREATE INDEX ON businesses (status, applied_at);
CREATE INDEX ON businesses USING gin (applicant_business_name gin_trgm_ops);

CREATE TABLE memberships (
  business_id uuid NOT NULL REFERENCES businesses ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id),
  UNIQUE (user_id)
);

CREATE TABLE audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_type    text NOT NULL CHECK (actor_type IN ('user','admin','system')),
  actor_user_id uuid,
  actor_email   citext,
  business_id   uuid,
  action        text NOT NULL,
  entity_type   text,
  entity_id     uuid,
  data          jsonb NOT NULL DEFAULT '{}',
  ip            inet
);
CREATE INDEX ON audit_log (business_id, at DESC);
CREATE INDEX ON audit_log (action, at DESC);

-- +goose Down
DROP TABLE audit_log, memberships, businesses, sessions, auth_identities, users;
