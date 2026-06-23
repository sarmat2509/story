ALTER TABLE image_validation_results
  ALTER COLUMN validation_score DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS validation_status varchar(40) NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS request_manifest jsonb,
  ADD COLUMN IF NOT EXISTS provider_error text;
