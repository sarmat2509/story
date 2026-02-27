-- Migration: Add thumbnail columns to assets table for optimized library preview images
-- Created: 2026-02-27

-- Add thumbnail_path and thumbnail_url columns to assets table
ALTER TABLE assets ADD COLUMN thumbnail_path text;
ALTER TABLE assets ADD COLUMN thumbnail_url text;

-- Add index for thumbnail lookups (partial index for non-null values)
CREATE INDEX assets_thumbnail_path_idx ON assets(thumbnail_path) WHERE thumbnail_path IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN assets.thumbnail_path IS 'Storage path to 672×384px JPEG thumbnail (2× smaller than original)';
COMMENT ON COLUMN assets.thumbnail_url IS 'Accessible URL for thumbnail image';
