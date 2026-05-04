ALTER TABLE users
  ADD COLUMN IF NOT EXISTS child_mode_exit_passcode_hash text,
  ADD COLUMN IF NOT EXISTS child_mode_exit_passcode_set_at timestamp;

WITH ranked_child_passcodes AS (
  SELECT
    child_profiles.user_id,
    child_profiles.child_mode_passcode_hash,
    child_profiles.child_mode_passcode_set_at,
    ROW_NUMBER() OVER (
      PARTITION BY child_profiles.user_id
      ORDER BY child_profiles.child_mode_passcode_set_at DESC NULLS LAST,
               child_profiles.updated_at DESC
    ) AS row_number
  FROM child_profiles
  WHERE child_profiles.child_mode_passcode_hash IS NOT NULL
)
UPDATE users
SET
  child_mode_exit_passcode_hash = ranked_child_passcodes.child_mode_passcode_hash,
  child_mode_exit_passcode_set_at = COALESCE(ranked_child_passcodes.child_mode_passcode_set_at, NOW())
FROM ranked_child_passcodes
WHERE ranked_child_passcodes.user_id = users.id
  AND ranked_child_passcodes.row_number = 1
  AND users.child_mode_exit_passcode_hash IS NULL;
