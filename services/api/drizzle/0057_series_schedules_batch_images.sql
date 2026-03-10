-- Migration: Add series_schedules, batch_image_pending, batch_image_jobs, stories.hidden
-- Created: 2026-03-10
-- Description: Scheduled continuations with batch image generation

-- Table 1: series_schedules
CREATE TABLE IF NOT EXISTS series_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES story_series(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cadence VARCHAR(20) NOT NULL,
  run_at_time VARCHAR(10) NOT NULL,  -- HH:mm in UTC
  next_run_at TIMESTAMPTZ NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(series_id)
);
CREATE INDEX IF NOT EXISTS idx_series_schedules_next_run ON series_schedules(next_run_at);

-- Table 2: batch_image_pending
CREATE TABLE IF NOT EXISTS batch_image_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES story_requests(id),
  schedule_id UUID REFERENCES series_schedules(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_batch_image_pending_created ON batch_image_pending(created_at);
CREATE INDEX IF NOT EXISTS idx_batch_image_pending_story ON batch_image_pending(story_id);
CREATE INDEX IF NOT EXISTS idx_batch_image_pending_schedule ON batch_image_pending(schedule_id);

-- Table 3: batch_image_jobs
CREATE TABLE IF NOT EXISTS batch_image_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id VARCHAR(100) NOT NULL,
  vendor VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL,
  pending_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_batch_image_jobs_status ON batch_image_jobs(status);
CREATE INDEX IF NOT EXISTS idx_batch_image_jobs_created ON batch_image_jobs(created_at);

-- Stories: add hidden column
ALTER TABLE stories ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_stories_hidden ON stories(hidden) WHERE hidden = false;
