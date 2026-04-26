-- Grok TTS voices are not offered in the app catalog; keep rows for FK/history.
UPDATE tts_voices
SET is_active = false, updated_at = NOW()
WHERE provider = 'grok';
