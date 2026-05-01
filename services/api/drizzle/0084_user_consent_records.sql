-- User consent records for launch legal gates.
-- Created: 2026-05-01

CREATE TABLE IF NOT EXISTS user_consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type VARCHAR(64) NOT NULL,
  document_version VARCHAR(64) NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_consent_records_user_type_idx
  ON user_consent_records (user_id, consent_type, accepted_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS user_consent_records_user_type_version_uidx
  ON user_consent_records (user_id, consent_type, document_version);

