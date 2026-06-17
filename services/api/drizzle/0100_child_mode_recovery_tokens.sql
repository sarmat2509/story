ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(50) NOT NULL DEFAULT 'password_reset',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS password_reset_tokens_purpose_idx
  ON password_reset_tokens(purpose);
