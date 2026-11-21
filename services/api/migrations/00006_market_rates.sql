-- +goose Up
-- IBJA benchmark rates, shared by every shop. Rates exclude GST.
CREATE TABLE market_rates (
  day            date NOT NULL,
  session        text NOT NULL CHECK (session IN ('AM', 'PM')),
  purity         text NOT NULL CHECK (purity IN ('gold999', 'gold995', 'gold916', 'gold750', 'gold585', 'silver999')),
  paise_per_gram bigint NOT NULL CHECK (paise_per_gram > 0),
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, session, purity)
);

-- +goose Down
DROP TABLE market_rates;
