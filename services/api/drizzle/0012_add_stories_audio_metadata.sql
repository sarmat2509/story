-- Add audio_metadata column to stories table
ALTER TABLE stories ADD COLUMN IF NOT EXISTS audio_metadata jsonb;
