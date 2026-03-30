CREATE TABLE IF NOT EXISTS "story_director_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"scene_index" integer NOT NULL,
	"environment_id" text,
	"character_outfit_ids" jsonb,
	"scene_visual" jsonb,
	"illustration_block_index" integer NOT NULL,
	"is_block_anchor" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "story_director_scenes"
 ADD CONSTRAINT "story_director_scenes_story_id_stories_id_fk"
 FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id")
 ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "idx_story_director_scenes_story"
  ON "story_director_scenes" USING btree ("story_id");
CREATE INDEX IF NOT EXISTS "idx_story_director_scenes_story_scene"
  ON "story_director_scenes" USING btree ("story_id", "scene_index");
