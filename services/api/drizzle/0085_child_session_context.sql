-- Session context for parent-owned child mode guardrails.
-- Created: 2026-05-01

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'parent';

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS parent_user_id UUID;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS child_profile_id UUID;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP;

UPDATE sessions
SET parent_user_id = user_id
WHERE parent_user_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_parent_user_id_fkey'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_parent_user_id_fkey
      FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_child_profile_id_fkey'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_child_profile_id_fkey
      FOREIGN KEY (child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_mode_check'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_mode_check
      CHECK (mode IN ('parent', 'child'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_child_context_check'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_child_context_check
      CHECK (
        mode <> 'child'
        OR (parent_user_id IS NOT NULL AND child_profile_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sessions_mode_idx
  ON sessions (mode);

CREATE INDEX IF NOT EXISTS sessions_parent_user_id_idx
  ON sessions (parent_user_id);

CREATE INDEX IF NOT EXISTS sessions_child_profile_id_idx
  ON sessions (child_profile_id);

CREATE INDEX IF NOT EXISTS sessions_revoked_at_idx
  ON sessions (revoked_at);
