-- Parent-managed first launch and per-child story creation mode

ALTER TABLE users
  ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing accounts already passed the old launch flow. New accounts keep the
-- default FALSE value and enter the parent-managed first-launch flow.
UPDATE users
SET onboarding_completed = TRUE;

ALTER TABLE child_profiles
  ADD COLUMN story_creation_mode VARCHAR(20) NOT NULL DEFAULT 'instant';

ALTER TABLE child_profiles
  ADD CONSTRAINT check_child_profiles_story_creation_mode
  CHECK (story_creation_mode IN ('instant', 'artisan'));

CREATE INDEX idx_child_profiles_story_creation_mode
  ON child_profiles(story_creation_mode);
