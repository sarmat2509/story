-- Migration 0018: Revert age_group_id to nullable
-- We decided to keep using age_group (string) instead of age_group_id (UUID)
-- This makes age_group_id optional for backward compatibility

ALTER TABLE stories ALTER COLUMN age_group_id DROP NOT NULL;
ALTER TABLE age_engine_rules ALTER COLUMN age_group_id DROP NOT NULL;

COMMENT ON COLUMN stories.age_group_id IS 'Optional UUID reference to age_groups table (not used, kept for future)';
COMMENT ON COLUMN age_engine_rules.age_group_id IS 'Optional UUID reference to age_groups table (not used, kept for future)';
