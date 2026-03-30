-- Migration: User role (admin) + image_validation_results for vision validation analytics
-- Created: 2026-03-24
-- App values for users.role: 'user' | 'admin'. Promote admin: UPDATE users SET role = 'admin' WHERE email = '...';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS image_validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  scene_index INTEGER NOT NULL,
  attempt SMALLINT NOT NULL,
  image_storage_path TEXT NOT NULL,
  validation_score SMALLINT NOT NULL,
  vision_model VARCHAR(100),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_validation_results_story ON image_validation_results(story_id);
CREATE INDEX IF NOT EXISTS idx_image_validation_results_story_scene_created
  ON image_validation_results(story_id, scene_index, created_at DESC);

COMMENT ON TABLE image_validation_results IS 'Per-attempt vision validation output; image_storage_path matches assets.storage_path style (env/userId/storyId/...)';
