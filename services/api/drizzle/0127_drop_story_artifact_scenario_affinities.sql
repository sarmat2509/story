DROP INDEX IF EXISTS story_artifacts_scenario_affinities_idx;

ALTER TABLE story_artifacts
  DROP COLUMN IF EXISTS scenario_affinities;
