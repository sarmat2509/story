ALTER TABLE child_profiles
  ADD COLUMN IF NOT EXISTS child_mode_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS child_mode_settings JSONB NOT NULL DEFAULT '{
    "dailyGenerationLimit": null,
    "monthlyGenerationLimit": null,
    "allowedThemeSlugs": [],
    "allowedLanguageCodes": [],
    "allowedCharacterIds": [],
    "freeTextPromptsEnabled": false,
    "audioGenerationEnabled": false,
    "parentReviewRequired": true,
    "allowSiblingCharacters": false,
    "allowSharedFamilyStories": false
  }'::jsonb;

CREATE INDEX IF NOT EXISTS child_profiles_child_mode_enabled_idx
  ON child_profiles(child_mode_enabled);
