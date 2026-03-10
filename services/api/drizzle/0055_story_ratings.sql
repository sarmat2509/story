-- Migration: Story ratings (5-point emoji scale, voter_id + IP deduplication)
-- Created: 2026-03-10

-- 1. Add aggregate columns to stories
ALTER TABLE stories ADD COLUMN IF NOT EXISTS rating_sum INTEGER DEFAULT 0;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;

-- 2. Create story_ratings table
CREATE TABLE IF NOT EXISTS story_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  voter_id VARCHAR(64) NOT NULL,
  ip_address INET NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(story_id, voter_id),
  UNIQUE(story_id, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_story_ratings_story ON story_ratings(story_id);
