-- Migration: Add display_name column to tts_voices table
-- Purpose: Support constellation-themed naming for voices
-- Author: Premium Voices Feature
-- Date: 2026-01-31

-- Add display_name column to tts_voices
ALTER TABLE tts_voices ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);

-- Populate display_name from name (temporary, will be overwritten by seed)
UPDATE tts_voices SET display_name = name WHERE display_name IS NULL;

-- Make display_name NOT NULL
ALTER TABLE tts_voices ALTER COLUMN display_name SET NOT NULL;

-- Update isPremium for ElevenLabs voices (if they exist)
-- Note: This is optional - seed script will handle it correctly
UPDATE tts_voices 
SET is_premium = true 
WHERE provider = 'elevenlabs';

-- Update isPremium for Google TTS voices (ensure they are free)
UPDATE tts_voices 
SET is_premium = false 
WHERE provider = 'google';
