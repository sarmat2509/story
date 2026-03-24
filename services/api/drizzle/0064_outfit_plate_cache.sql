-- Migration: Outfit plate image cache + per-story mapping (Imagen 4 Fast garment refs)
-- Created: 2026-03-21

CREATE TABLE IF NOT EXISTS outfit_plate_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outfit_text TEXT NOT NULL,
  description_embedding JSONB NOT NULL,
  image_style VARCHAR(100) NOT NULL,
  age_group VARCHAR(20) NOT NULL,
  storage_path TEXT NOT NULL,
  storage_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outfit_plate_cache_created_at_idx ON outfit_plate_cache(created_at);

CREATE TABLE IF NOT EXISTS story_outfit_plate_cache (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  character_key VARCHAR(200) NOT NULL,
  story_environment_id VARCHAR(100) NOT NULL,
  cache_id UUID NOT NULL REFERENCES outfit_plate_cache(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, character_key, story_environment_id)
);

CREATE INDEX IF NOT EXISTS story_outfit_plate_cache_story_idx ON story_outfit_plate_cache(story_id);
CREATE INDEX IF NOT EXISTS story_outfit_plate_cache_cache_idx ON story_outfit_plate_cache(cache_id);
