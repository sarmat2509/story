CREATE TABLE IF NOT EXISTS collected_map_tiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_profile_id uuid REFERENCES child_profiles(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  acquired_label varchar(500),
  mask_id varchar(160) NOT NULL,
  connectors jsonb NOT NULL DEFAULT '{}'::jsonb,
  location varchar(20) NOT NULL DEFAULT 'inventory',
  board_x integer,
  board_y integer,
  inventory_order integer NOT NULL DEFAULT 0,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS collected_map_tiles_parent_story_uidx
  ON collected_map_tiles(user_id, story_id)
  WHERE child_profile_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS collected_map_tiles_child_story_uidx
  ON collected_map_tiles(user_id, child_profile_id, story_id)
  WHERE child_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS collected_map_tiles_user_child_location_idx
  ON collected_map_tiles(user_id, child_profile_id, location, inventory_order);

CREATE INDEX IF NOT EXISTS collected_map_tiles_board_idx
  ON collected_map_tiles(user_id, child_profile_id, board_x, board_y);

CREATE INDEX IF NOT EXISTS collected_map_tiles_story_id_idx
  ON collected_map_tiles(story_id);

CREATE INDEX IF NOT EXISTS collected_map_tiles_asset_id_idx
  ON collected_map_tiles(asset_id);
