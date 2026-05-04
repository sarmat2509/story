ALTER TABLE "child_profiles"
  ADD COLUMN IF NOT EXISTS "author_pseudonym" varchar(100),
  ADD COLUMN IF NOT EXISTS "author_about_me" text,
  ADD COLUMN IF NOT EXISTS "child_mode_passcode_hash" text,
  ADD COLUMN IF NOT EXISTS "child_mode_passcode_set_at" timestamp;

ALTER TABLE "characters"
  ADD COLUMN IF NOT EXISTS "child_profile_id" uuid REFERENCES "child_profiles"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "characters_child_profile_id_idx" ON "characters" ("child_profile_id");

ALTER TABLE "stories"
  ADD COLUMN IF NOT EXISTS "author_type" varchar(20) NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "author_child_profile_id" uuid REFERENCES "child_profiles"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "stories_author_type_idx" ON "stories" ("author_type");
CREATE INDEX IF NOT EXISTS "stories_author_child_profile_id_idx" ON "stories" ("author_child_profile_id");

ALTER TABLE "child_profiles"
  ALTER COLUMN "child_mode_settings" SET DEFAULT '{
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
    "parentReviewRequired": false,
    "allowSiblingCharacters": false,
    "allowSharedFamilyStories": false
  }'::jsonb;

UPDATE "child_profiles"
SET "child_mode_settings" = '{
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
    "parentReviewRequired": false,
    "allowSiblingCharacters": false,
    "allowSharedFamilyStories": false
  }'::jsonb
  || COALESCE("child_mode_settings", '{}'::jsonb)
  || CASE
    WHEN "child_mode_settings" IS NULL OR NOT ("child_mode_settings" ? 'storyGenerationEnabled')
      THEN '{
        "freeTextPromptsEnabled": true,
        "audioGenerationEnabled": true,
        "parentReviewRequired": false,
        "allowSharedFamilyStories": false
      }'::jsonb
    ELSE '{}'::jsonb
  END
WHERE "child_mode_settings" IS NULL
  OR NOT (
    "child_mode_settings" ? 'storyGenerationEnabled'
    AND "child_mode_settings" ? 'publicStoriesEnabled'
    AND "child_mode_settings" ? 'dailyAudioGenerationLimit'
  );
