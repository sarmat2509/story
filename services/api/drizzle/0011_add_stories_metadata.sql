-- Add metadata column to stories table
ALTER TABLE stories ADD COLUMN IF NOT EXISTS metadata jsonb;
