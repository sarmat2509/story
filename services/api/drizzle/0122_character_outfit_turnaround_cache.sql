CREATE TABLE IF NOT EXISTS "character_outfit_turnaround_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "outfit_id" varchar(200),
  "outfit_hash" varchar(64) NOT NULL,
  "outfit_text" text NOT NULL,
  "outfit_plate_storage_path" text,
  "image_style" varchar(100) NOT NULL,
  "age_group" varchar(20) NOT NULL,
  "storage_path" text NOT NULL,
  "storage_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "character_outfit_turnaround_character_outfit_uidx"
  ON "character_outfit_turnaround_cache" (
    "character_id",
    "outfit_hash",
    "image_style",
    "age_group"
  );

CREATE INDEX IF NOT EXISTS "character_outfit_turnaround_character_idx"
  ON "character_outfit_turnaround_cache" ("character_id");
