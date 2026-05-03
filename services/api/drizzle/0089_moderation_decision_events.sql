-- Safe moderation decision audit trail for support review.
-- Stores codes/categories and hashed subject references, not raw prompts, child photos, or generated text.
-- Created: 2026-05-03

CREATE TABLE IF NOT EXISTS moderation_decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  story_request_id UUID REFERENCES story_requests(id) ON DELETE SET NULL,
  child_profile_id UUID REFERENCES child_profiles(id) ON DELETE SET NULL,
  stage VARCHAR(80) NOT NULL,
  source VARCHAR(120) NOT NULL,
  subject_type VARCHAR(40) NOT NULL,
  subject_ref_hash VARCHAR(64),
  decision VARCHAR(40) NOT NULL,
  code VARCHAR(120),
  category VARCHAR(120),
  rule_id VARCHAR(160),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moderation_decision_events_created_at_idx
  ON moderation_decision_events(created_at DESC);

CREATE INDEX IF NOT EXISTS moderation_decision_events_user_created_at_idx
  ON moderation_decision_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS moderation_decision_events_story_created_at_idx
  ON moderation_decision_events(story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS moderation_decision_events_decision_created_at_idx
  ON moderation_decision_events(decision, created_at DESC);

CREATE INDEX IF NOT EXISTS moderation_decision_events_stage_created_at_idx
  ON moderation_decision_events(stage, created_at DESC);
