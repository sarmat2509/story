-- Migration: Add character tracking columns to scenes table for reference image selection
-- Created: 2026-02-03

-- Add columns to scenes table
ALTER TABLE scenes 
ADD COLUMN characters_present jsonb, -- Array of normalized character names in this scene
ADD COLUMN is_reference_image boolean DEFAULT false, -- Flag: image introduces new character(s)
ADD COLUMN image_url text; -- Denormalized from assets table for quick access

-- Create index for reference image queries
CREATE INDEX scenes_is_reference_idx ON scenes(story_id, is_reference_image) WHERE is_reference_image = true;

-- Create GIN index for character queries
CREATE INDEX scenes_characters_gin_idx ON scenes USING gin(characters_present jsonb_path_ops);

-- Add comment explaining the purpose
COMMENT ON COLUMN scenes.characters_present IS 'Array of normalized character names appearing in this scene (used for reference image selection)';
COMMENT ON COLUMN scenes.is_reference_image IS 'True if this scene image introduces new characters and should be used as reference';
COMMENT ON COLUMN scenes.image_url IS 'Denormalized image URL from assets table for quick reference loading';
