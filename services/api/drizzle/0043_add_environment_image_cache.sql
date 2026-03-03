-- Migration: Add environment_image_cache and story_environment_cache
-- Created: 2026-03-03
-- For environment image reference reuse via Imagen 4 Fast

CREATE TABLE IF NOT EXISTS environment_image_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  description_embedding JSONB NOT NULL,
  storage_path TEXT NOT NULL,
  storage_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS story_environment_cache (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  story_environment_id VARCHAR(100) NOT NULL,
  cache_id UUID NOT NULL REFERENCES environment_image_cache(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (story_id, story_environment_id)
);

CREATE INDEX IF NOT EXISTS story_env_cache_story_idx ON story_environment_cache(story_id);
CREATE INDEX IF NOT EXISTS story_env_cache_cache_idx ON story_environment_cache(cache_id);
