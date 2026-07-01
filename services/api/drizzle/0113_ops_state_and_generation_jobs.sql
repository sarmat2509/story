CREATE TABLE IF NOT EXISTS ops_runtime_state (
  id VARCHAR(64) PRIMARY KEY,
  mode VARCHAR(24) NOT NULL DEFAULT 'normal',
  message TEXT,
  starts_at TIMESTAMP,
  ends_at TIMESTAMP,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO ops_runtime_state (id, mode, message)
VALUES ('global', 'normal', NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS generation_jobs (
  id VARCHAR(120) PRIMARY KEY,
  queue_name VARCHAR(64) NOT NULL,
  job_type VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL,
  group_key VARCHAR(255),
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  retries INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 2,
  run_after TIMESTAMP NOT NULL DEFAULT NOW(),
  locked_by VARCHAR(120),
  locked_at TIMESTAMP,
  lock_expires_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  estimated_total_ms INTEGER,
  actual_duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS generation_jobs_queue_status_idx
  ON generation_jobs(queue_name, status, run_after, created_at);

CREATE INDEX IF NOT EXISTS generation_jobs_lock_expires_idx
  ON generation_jobs(queue_name, status, lock_expires_at);

CREATE INDEX IF NOT EXISTS generation_jobs_group_idx
  ON generation_jobs(queue_name, group_key, status);

CREATE INDEX IF NOT EXISTS generation_jobs_created_at_idx
  ON generation_jobs(created_at);
