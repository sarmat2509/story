-- Migration: Create ai_usage_events table for AI cost tracking
-- Created: 2026-03-09
-- Tracks per-call usage for text, image, and audio providers

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  child_profile_id UUID REFERENCES child_profiles(id) ON DELETE SET NULL,

  provider VARCHAR(50) NOT NULL,
  operation VARCHAR(80) NOT NULL,
  model VARCHAR(100),

  input_units INTEGER,
  output_units INTEGER,
  cost_usd NUMERIC(12, 8),
  duration_ms INTEGER,

  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_story ON ai_usage_events(story_id) WHERE story_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_op ON ai_usage_events(provider, operation);
