-- Add a parent-controlled story continuation setting in Child Mode, enabled by default.
ALTER TABLE child_profiles
  ALTER COLUMN child_mode_settings SET DEFAULT '{
    "storyGenerationEnabled": true,
    "storyContinuationEnabled": true,
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
  || jsonb_build_object(
    'storyContinuationEnabled',
    COALESCE((child_mode_settings->>'storyContinuationEnabled')::boolean, true)
  )
WHERE child_mode_settings IS NULL
  OR NOT (child_mode_settings ? 'storyContinuationEnabled');
