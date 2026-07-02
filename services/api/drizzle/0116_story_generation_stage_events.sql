CREATE TABLE IF NOT EXISTS story_generation_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  story_request_id UUID REFERENCES story_requests(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  parent_event_id UUID,
  generation_kind VARCHAR(40) NOT NULL DEFAULT 'story',
  pipeline_phase VARCHAR(80) NOT NULL,
  operation VARCHAR(100) NOT NULL,
  target_type VARCHAR(80),
  target_key TEXT,
  scene_index INTEGER,
  page_number INTEGER,
  asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  attempt INTEGER NOT NULL DEFAULT 1,
  cache_status VARCHAR(20),
  provider VARCHAR(50),
  model VARCHAR(100),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS story_generation_stage_events_story_idx
  ON story_generation_stage_events(story_id);

CREATE INDEX IF NOT EXISTS story_generation_stage_events_request_idx
  ON story_generation_stage_events(story_request_id);

CREATE INDEX IF NOT EXISTS story_generation_stage_events_created_at_idx
  ON story_generation_stage_events(created_at);

CREATE INDEX IF NOT EXISTS story_generation_stage_events_kind_operation_created_idx
  ON story_generation_stage_events(generation_kind, operation, created_at);

CREATE INDEX IF NOT EXISTS story_generation_stage_events_phase_operation_created_idx
  ON story_generation_stage_events(pipeline_phase, operation, created_at);

CREATE INDEX IF NOT EXISTS story_generation_stage_events_status_created_idx
  ON story_generation_stage_events(status, created_at);
