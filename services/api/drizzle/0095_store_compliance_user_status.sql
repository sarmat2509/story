ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_by_user_id UUID;

CREATE INDEX IF NOT EXISTS users_status_idx ON users(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_suspended_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_suspended_by_user_id_users_id_fk
      FOREIGN KEY (suspended_by_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;
