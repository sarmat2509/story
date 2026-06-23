CREATE TABLE IF NOT EXISTS story_quiz_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_quiz_id uuid NOT NULL REFERENCES story_quizzes(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_profile_id uuid REFERENCES child_profiles(id) ON DELETE SET NULL,
  owner_type varchar(20) NOT NULL,
  owner_id uuid NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_check_reward_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS story_quiz_progress_story_quiz_id_idx
  ON story_quiz_progress(story_quiz_id);

CREATE INDEX IF NOT EXISTS story_quiz_progress_story_id_idx
  ON story_quiz_progress(story_id);

CREATE INDEX IF NOT EXISTS story_quiz_progress_user_id_idx
  ON story_quiz_progress(user_id);

CREATE INDEX IF NOT EXISTS story_quiz_progress_child_profile_id_idx
  ON story_quiz_progress(child_profile_id);

CREATE UNIQUE INDEX IF NOT EXISTS story_quiz_progress_owner_uidx
  ON story_quiz_progress(story_quiz_id, owner_type, owner_id);
