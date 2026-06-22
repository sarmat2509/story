CREATE TABLE IF NOT EXISTS collected_story_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_profile_id uuid REFERENCES child_profiles(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES story_artifacts(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  acquired_label varchar(500),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS collected_story_artifacts_parent_story_uidx
  ON collected_story_artifacts(user_id, artifact_id, story_id)
  WHERE child_profile_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS collected_story_artifacts_child_story_uidx
  ON collected_story_artifacts(user_id, child_profile_id, artifact_id, story_id)
  WHERE child_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS collected_story_artifacts_user_child_acquired_idx
  ON collected_story_artifacts(user_id, child_profile_id, acquired_at DESC);

CREATE INDEX IF NOT EXISTS collected_story_artifacts_artifact_id_idx
  ON collected_story_artifacts(artifact_id);

CREATE INDEX IF NOT EXISTS collected_story_artifacts_story_id_idx
  ON collected_story_artifacts(story_id);
