ALTER TABLE child_profiles
  ALTER COLUMN child_mode_settings SET DEFAULT '{
    "storyGenerationEnabled": true,
    "publicStoriesEnabled": true,
    "dailyGenerationLimit": null,
    "dailyAudioGenerationLimit": null,
    "monthlyGenerationLimit": null,
    "allowedThemeSlugs": [],
    "allowedLanguageCodes": [],
    "allowedCharacterIds": [],
    "freeTextPromptsEnabled": true,
    "audioGenerationEnabled": true,
    "quizGenerationEnabled": true,
    "parentReviewRequired": false,
    "allowSiblingCharacters": false,
    "allowSharedFamilyStories": false
  }'::jsonb;

UPDATE child_profiles
SET child_mode_settings = COALESCE(child_mode_settings, '{}'::jsonb)
  || jsonb_build_object('quizGenerationEnabled', COALESCE((child_mode_settings->>'quizGenerationEnabled')::boolean, true))
WHERE child_mode_settings IS NULL
  OR NOT (child_mode_settings ? 'quizGenerationEnabled');

CREATE TABLE IF NOT EXISTS story_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_profile_id uuid REFERENCES child_profiles(id) ON DELETE SET NULL,
  language varchar(10) NOT NULL,
  source_age_group varchar(20) NOT NULL,
  quiz_age_bucket varchar(10) NOT NULL,
  prompt_version varchar(40) NOT NULL,
  source_fingerprint varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'generating',
  payload jsonb,
  error_message text,
  generation_time_ms integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS story_quizzes_story_id_idx
  ON story_quizzes(story_id);

CREATE INDEX IF NOT EXISTS story_quizzes_user_id_idx
  ON story_quizzes(user_id);

CREATE INDEX IF NOT EXISTS story_quizzes_child_profile_id_idx
  ON story_quizzes(child_profile_id);

CREATE INDEX IF NOT EXISTS story_quizzes_status_idx
  ON story_quizzes(status);

CREATE UNIQUE INDEX IF NOT EXISTS story_quizzes_cache_uidx
  ON story_quizzes(story_id, language, quiz_age_bucket, prompt_version, source_fingerprint);
