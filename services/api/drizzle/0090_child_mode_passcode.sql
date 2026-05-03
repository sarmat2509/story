ALTER TABLE child_profiles
  ADD COLUMN IF NOT EXISTS child_mode_passcode_hash text,
  ADD COLUMN IF NOT EXISTS child_mode_passcode_set_at timestamp;
