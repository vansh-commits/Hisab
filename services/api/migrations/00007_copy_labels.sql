-- +goose Up
-- Copies are now free-text labels the shop picks (one page set per label).
ALTER TABLE business_settings DROP CONSTRAINT business_settings_copies_check;
UPDATE business_settings SET copies = array_replace(array_replace(array_replace(copies,
  'original', 'Customer'), 'duplicate', 'Store'), 'triplicate', 'Extra');
ALTER TABLE business_settings ALTER COLUMN copies SET DEFAULT '{Customer,Store}';
ALTER TABLE business_settings ADD CONSTRAINT business_settings_copies_check
  CHECK (cardinality(copies) BETWEEN 1 AND 5 AND array_position(copies, '') IS NULL);

-- +goose Down
ALTER TABLE business_settings DROP CONSTRAINT business_settings_copies_check;
UPDATE business_settings SET copies = '{original,duplicate}';
ALTER TABLE business_settings ALTER COLUMN copies SET DEFAULT '{original,duplicate}';
ALTER TABLE business_settings ADD CONSTRAINT business_settings_copies_check
  CHECK (copies <@ ARRAY['original','duplicate','triplicate'] AND cardinality(copies) >= 1);
