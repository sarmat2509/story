-- Rename Grok `sal` catalog slug polaris → atlas (male Greek / cosmic name).
UPDATE tts_voices
SET name = 'atlas', display_name = 'Atlas', gender = 'male'
WHERE provider = 'grok' AND provider_voice_id = 'sal';
