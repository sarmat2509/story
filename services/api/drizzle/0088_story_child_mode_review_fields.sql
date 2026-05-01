ALTER TABLE story_requests
  ADD COLUMN IF NOT EXISTS created_by_mode VARCHAR(20) NOT NULL DEFAULT 'parent',
  ADD COLUMN IF NOT EXISTS created_by_child_profile_id UUID REFERENCES child_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_review_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS created_by_mode VARCHAR(20) NOT NULL DEFAULT 'parent',
  ADD COLUMN IF NOT EXISTS created_by_child_profile_id UUID REFERENCES child_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_review_status VARCHAR(20) NOT NULL DEFAULT 'not_required';

CREATE INDEX IF NOT EXISTS story_requests_created_by_mode_idx
  ON story_requests(created_by_mode);

CREATE INDEX IF NOT EXISTS story_requests_created_by_child_profile_id_idx
  ON story_requests(created_by_child_profile_id);

CREATE INDEX IF NOT EXISTS stories_created_by_mode_idx
  ON stories(created_by_mode);

CREATE INDEX IF NOT EXISTS stories_created_by_child_profile_id_idx
  ON stories(created_by_child_profile_id);

CREATE INDEX IF NOT EXISTS stories_parent_review_status_idx
  ON stories(parent_review_status);
