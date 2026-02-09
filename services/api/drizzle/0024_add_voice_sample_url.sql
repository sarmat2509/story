-- Migration: Add sample_audio_url column to tts_voices table
-- Created: 2026-02-03

ALTER TABLE tts_voices 
ADD COLUMN sample_audio_url TEXT;

COMMENT ON COLUMN tts_voices.sample_audio_url IS 'URL to generated voice sample in asset storage (format: voice-samples/{language}/{voiceId}.mp3)';
