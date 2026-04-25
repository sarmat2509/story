-- Grok catalog primary locale is `en` (Ukrainian stories must not use Grok TTS).
-- Run once if you seeded Grok before this change (rows had language = 'uk').
UPDATE tts_voices SET language = 'en' WHERE provider = 'grok';
