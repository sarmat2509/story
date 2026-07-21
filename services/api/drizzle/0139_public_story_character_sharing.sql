-- Character sharing is opt-in per publication. Existing publications stay private.
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS publish_characters boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS saved_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  source_story_id uuid REFERENCES stories(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_characters_user_id_idx ON saved_characters(user_id);
CREATE INDEX IF NOT EXISTS saved_characters_character_id_idx ON saved_characters(character_id);
CREATE UNIQUE INDEX IF NOT EXISTS saved_characters_user_character_unique_idx
  ON saved_characters(user_id, character_id);
