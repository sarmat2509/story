ALTER TABLE child_profiles
ADD COLUMN IF NOT EXISTS story_complexity_adjustments jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'child_profiles_story_complexity_adjustments_check'
  ) THEN
    ALTER TABLE child_profiles
    ADD CONSTRAINT child_profiles_story_complexity_adjustments_check
    CHECK (
      jsonb_typeof(story_complexity_adjustments) = 'object'
      AND (story_complexity_adjustments - ARRAY['uk', 'ru', 'en', 'es', 'de', 'fr', 'pl']) = '{}'::jsonb
      AND NOT jsonb_path_exists(
        story_complexity_adjustments,
        '$.* ? (@ != -2 && @ != -1 && @ != 0 && @ != 1 && @ != 2)'
      )
    );
  END IF;
END $$;
