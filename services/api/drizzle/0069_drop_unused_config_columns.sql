-- Migration: Drop unused config columns removed from application code
-- Created: 2026-03-27

ALTER TABLE "content_policy_rules"
  DROP COLUMN IF EXISTS "description",
  DROP COLUMN IF EXISTS "prohibited_elements",
  DROP COLUMN IF EXISTS "examples",
  DROP COLUMN IF EXISTS "severity";

ALTER TABLE "age_engine_rules"
  DROP COLUMN IF EXISTS "vocabulary",
  DROP COLUMN IF EXISTS "themes",
  DROP COLUMN IF EXISTS "fear_level";

ALTER TABLE "features"
  DROP COLUMN IF EXISTS "is_internal";
