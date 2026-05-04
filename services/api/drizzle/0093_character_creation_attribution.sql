ALTER TABLE "characters"
  ADD COLUMN IF NOT EXISTS "created_by_mode" varchar(20) NOT NULL DEFAULT 'parent',
  ADD COLUMN IF NOT EXISTS "created_by_child_profile_id" uuid REFERENCES "child_profiles"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "characters_created_by_mode_idx" ON "characters" ("created_by_mode");
CREATE INDEX IF NOT EXISTS "characters_created_by_child_profile_id_idx" ON "characters" ("created_by_child_profile_id");
