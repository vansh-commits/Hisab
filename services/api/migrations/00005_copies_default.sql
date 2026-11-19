-- +goose Up
-- New shops print a customer copy and a shop copy by default.
ALTER TABLE business_settings ALTER COLUMN copies SET DEFAULT '{original,duplicate}';

-- +goose Down
ALTER TABLE business_settings ALTER COLUMN copies SET DEFAULT '{original}';
