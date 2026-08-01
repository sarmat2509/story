CREATE TABLE IF NOT EXISTS story_schedule_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_profile_ids uuid[] NOT NULL,
  cadence varchar(20) NOT NULL,
  run_at_time varchar(5) NOT NULL,
  timezone varchar(100) NOT NULL,
  formats jsonb NOT NULL,
  themes jsonb NOT NULL,
  morals jsonb NOT NULL,
  languages jsonb NOT NULL,
  image_styles jsonb NOT NULL,
  user_notes text,
  target_run_at timestamptz NOT NULL,
  prepare_run_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS story_schedule_rules_user_unique ON story_schedule_rules(user_id);
CREATE INDEX IF NOT EXISTS story_schedule_rules_prepare_idx ON story_schedule_rules(prepare_run_at);
ALTER TABLE batch_image_pending ADD COLUMN IF NOT EXISTS purpose varchar(40) NOT NULL DEFAULT 'scheduled_scene';
