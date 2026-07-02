ALTER TABLE tts_voices
ADD COLUMN IF NOT EXISTS supported_languages VARCHAR(10)[];

UPDATE tts_voices
SET supported_languages = ARRAY['uk', 'ru', 'en', 'es', 'de', 'fr', 'pl']::varchar[]
WHERE supported_languages IS NULL
  AND provider <> 'grok';

UPDATE tts_voices
SET supported_languages = ARRAY['en', 'ru', 'es', 'de', 'fr', 'pl']::varchar[]
WHERE supported_languages IS NULL
  AND provider = 'grok';

UPDATE tts_voices
SET supported_languages = ARRAY['uk', 'ru', 'es', 'de', 'fr', 'pl']::varchar[]
WHERE provider = 'elevenlabs'
  AND provider_voice_id = 'Ntd0iVwICtUtA6Fvx27M';

UPDATE tts_voices
SET supported_languages = ARRAY['uk', 'ru', 'es', 'de', 'fr', 'pl']::varchar[]
WHERE provider = 'elevenlabs'
  AND provider_voice_id = 'eLDtXX7z65CuLasDRxrP';

UPDATE tts_voices
SET supported_languages = ARRAY['uk', 'ru', 'es', 'de', 'fr', 'pl']::varchar[]
WHERE provider = 'elevenlabs'
  AND provider_voice_id = 'ARxhnQPZCfSLpMBASSii';

INSERT INTO tts_voices (
  provider,
  provider_voice_id,
  name,
  display_name,
  language,
  supported_languages,
  gender,
  age_category,
  description,
  role_type,
  voice_tags,
  tags,
  accent,
  is_active,
  is_premium,
  default_speed,
  sample_audio_url,
  provider_preview_url,
  updated_at
)
VALUES (
  'elevenlabs',
  'cCYjmrGZaI86GUJ7F2Nn',
  'orion',
  'Orion',
  'en',
  ARRAY['en']::varchar[],
  'male',
  'adult',
  'Premium male voice for storytelling (ElevenLabs v3)',
  'both',
  ARRAY['narrator', 'storyteller', 'warm', 'premium']::varchar[],
  NULL,
  NULL,
  TRUE,
  TRUE,
  1.0,
  NULL,
  '',
  NOW()
)
ON CONFLICT (provider, provider_voice_id) DO UPDATE
SET
  name = EXCLUDED.name,
  display_name = EXCLUDED.display_name,
  language = EXCLUDED.language,
  supported_languages = EXCLUDED.supported_languages,
  gender = EXCLUDED.gender,
  age_category = EXCLUDED.age_category,
  description = EXCLUDED.description,
  role_type = EXCLUDED.role_type,
  voice_tags = EXCLUDED.voice_tags,
  is_active = EXCLUDED.is_active,
  is_premium = EXCLUDED.is_premium,
  default_speed = EXCLUDED.default_speed,
  provider_preview_url = EXCLUDED.provider_preview_url,
  updated_at = NOW();

INSERT INTO tts_voices (
  provider,
  provider_voice_id,
  name,
  display_name,
  language,
  supported_languages,
  gender,
  age_category,
  description,
  role_type,
  voice_tags,
  tags,
  accent,
  is_active,
  is_premium,
  default_speed,
  sample_audio_url,
  provider_preview_url,
  updated_at
)
VALUES (
  'elevenlabs',
  'kqVT88a5QfII1HNAEPTJ',
  'perseus',
  'Perseus',
  'en',
  ARRAY['en']::varchar[],
  'male',
  'adult',
  'Premium energetic male voice for storytelling (ElevenLabs v3)',
  'both',
  ARRAY['narrator', 'storyteller', 'energetic', 'premium']::varchar[],
  NULL,
  NULL,
  TRUE,
  TRUE,
  1.0,
  NULL,
  '',
  NOW()
)
ON CONFLICT (provider, provider_voice_id) DO UPDATE
SET
  name = EXCLUDED.name,
  display_name = EXCLUDED.display_name,
  language = EXCLUDED.language,
  supported_languages = EXCLUDED.supported_languages,
  gender = EXCLUDED.gender,
  age_category = EXCLUDED.age_category,
  description = EXCLUDED.description,
  role_type = EXCLUDED.role_type,
  voice_tags = EXCLUDED.voice_tags,
  is_active = EXCLUDED.is_active,
  is_premium = EXCLUDED.is_premium,
  default_speed = EXCLUDED.default_speed,
  provider_preview_url = EXCLUDED.provider_preview_url,
  updated_at = NOW();

INSERT INTO tts_voices (
  provider,
  provider_voice_id,
  name,
  display_name,
  language,
  supported_languages,
  gender,
  age_category,
  description,
  role_type,
  voice_tags,
  tags,
  accent,
  is_active,
  is_premium,
  default_speed,
  sample_audio_url,
  provider_preview_url,
  updated_at
)
VALUES (
  'elevenlabs',
  'eUdJpUEN3EslrgE24PKx',
  'andromeda',
  'Andromeda',
  'en',
  ARRAY['en']::varchar[],
  'female',
  'young_adult',
  'Premium female voice for storytelling (ElevenLabs v3)',
  'both',
  ARRAY['narrator', 'storyteller', 'gentle', 'premium']::varchar[],
  NULL,
  NULL,
  TRUE,
  TRUE,
  1.0,
  NULL,
  '',
  NOW()
)
ON CONFLICT (provider, provider_voice_id) DO UPDATE
SET
  name = EXCLUDED.name,
  display_name = EXCLUDED.display_name,
  language = EXCLUDED.language,
  supported_languages = EXCLUDED.supported_languages,
  gender = EXCLUDED.gender,
  age_category = EXCLUDED.age_category,
  description = EXCLUDED.description,
  role_type = EXCLUDED.role_type,
  voice_tags = EXCLUDED.voice_tags,
  is_active = EXCLUDED.is_active,
  is_premium = EXCLUDED.is_premium,
  default_speed = EXCLUDED.default_speed,
  provider_preview_url = EXCLUDED.provider_preview_url,
  updated_at = NOW();

WITH english_premium_voices AS (
  SELECT id
  FROM tts_voices
  WHERE provider = 'elevenlabs'
    AND provider_voice_id IN (
      'cCYjmrGZaI86GUJ7F2Nn',
      'kqVT88a5QfII1HNAEPTJ',
      'eUdJpUEN3EslrgE24PKx'
    )
)
INSERT INTO voice_age_groups (voice_id, age_group_id)
SELECT english_premium_voices.id, age_groups.id
FROM english_premium_voices
CROSS JOIN age_groups
WHERE age_groups.slug IN ('2-3', '4-5', '6-8', '9-12')
ON CONFLICT DO NOTHING;
