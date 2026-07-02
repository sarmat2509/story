CREATE UNIQUE INDEX IF NOT EXISTS characters_child_profile_mirror_unique_idx
  ON characters(user_id, child_profile_id)
  WHERE child_profile_id IS NOT NULL
    AND type = 'person'
    AND subtype = 'child';
