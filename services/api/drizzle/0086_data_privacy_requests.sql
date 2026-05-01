-- Data privacy requests for export/deletion support workflows.
-- Created: 2026-05-01

CREATE TABLE IF NOT EXISTS data_privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  requester_email VARCHAR(255),
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('export', 'deletion')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'fulfilled', 'rejected', 'canceled')),
  message TEXT,
  admin_notes TEXT,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS data_privacy_requests_user_id_idx
  ON data_privacy_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS data_privacy_requests_status_idx
  ON data_privacy_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS data_privacy_requests_request_type_idx
  ON data_privacy_requests (request_type, created_at DESC);
