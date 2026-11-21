-- name: UpsertMarketRates :exec
-- One round trip for the whole page. Keys must be unique within the call.
INSERT INTO market_rates (day, session, purity, paise_per_gram)
SELECT unnest(@days::date[]), unnest(@sessions::text[]), unnest(@purities::text[]), unnest(@paise::bigint[])
ON CONFLICT (day, session, purity) DO UPDATE SET paise_per_gram = EXCLUDED.paise_per_gram, fetched_at = now()
WHERE market_rates.paise_per_gram <> EXCLUDED.paise_per_gram;

-- name: ListMarketRates :many
SELECT day, session, purity, paise_per_gram, fetched_at FROM market_rates
WHERE day >= $1 ORDER BY day, session, purity;

-- name: HasMarketRate :one
SELECT EXISTS (SELECT 1 FROM market_rates WHERE day = $1 AND session = $2);

-- name: LatestMarketDay :one
SELECT coalesce(max(day), '2000-01-01')::date FROM market_rates;
