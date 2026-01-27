-- ==========================================
-- M4 PERFORMANCE IMPROVEMENTS
-- ==========================================
-- Add additional indexes for frequently queried columns

-- Assets table indexes for better query performance
CREATE INDEX IF NOT EXISTS assets_created_at_idx ON assets(created_at DESC);

-- Scenes table indexes
CREATE INDEX IF NOT EXISTS scenes_created_at_idx ON scenes(created_at DESC);

-- Generated references compound index for efficient lookups
CREATE INDEX IF NOT EXISTS generated_refs_asset_idx ON generated_references(asset_id);

-- Comment updates
COMMENT ON INDEX assets_created_at_idx IS 'Optimize listing assets by creation date';
COMMENT ON INDEX scenes_created_at_idx IS 'Optimize scene listing queries';
