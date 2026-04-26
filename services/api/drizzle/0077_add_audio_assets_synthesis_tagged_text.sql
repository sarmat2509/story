-- Exact TTS input after deferred prosody / vendor markup (per audio_assets row).
ALTER TABLE audio_assets ADD COLUMN IF NOT EXISTS synthesis_tagged_text text;

COMMENT ON COLUMN audio_assets.synthesis_tagged_text IS 'Text sent to TTS for this row (includes vendor tags when deferred prosody ran). For final story audio, matches the string hashed in text_hash.';
