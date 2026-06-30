ALTER TABLE child_profiles
ADD COLUMN IF NOT EXISTS story_text_size_multiplier real NOT NULL DEFAULT 1;

ALTER TABLE child_profiles
DROP CONSTRAINT IF EXISTS child_profiles_story_text_size_multiplier_check;

ALTER TABLE child_profiles
ADD CONSTRAINT child_profiles_story_text_size_multiplier_check
CHECK (story_text_size_multiplier IN (0.9::real, 0.95::real, 1::real, 1.05::real, 1.1::real));
