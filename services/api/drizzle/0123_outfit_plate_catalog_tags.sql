-- Migration: Add pregenerated outfit catalog tags and search indexes
-- Created: 2026-07-04

ALTER TABLE outfit_plate_cache
  ADD COLUMN IF NOT EXISTS catalog_source VARCHAR(120),
  ADD COLUMN IF NOT EXISTS formality VARCHAR(40),
  ADD COLUMN IF NOT EXISTS presentation_groups TEXT[],
  ADD COLUMN IF NOT EXISTS purpose_tags TEXT[],
  ADD COLUMN IF NOT EXISTS season_tags TEXT[],
  ADD COLUMN IF NOT EXISTS climate_tags TEXT[],
  ADD COLUMN IF NOT EXISTS era_tags TEXT[],
  ADD COLUMN IF NOT EXISTS setting_tags TEXT[],
  ADD COLUMN IF NOT EXISTS activity_tags TEXT[],
  ADD COLUMN IF NOT EXISTS silhouette_tags TEXT[],
  ADD COLUMN IF NOT EXISTS footwear_tags TEXT[],
  ADD COLUMN IF NOT EXISTS component_tags TEXT[],
  ADD COLUMN IF NOT EXISTS color_palette TEXT[],
  ADD COLUMN IF NOT EXISTS materials TEXT[],
  ADD COLUMN IF NOT EXISTS patterns TEXT[],
  ADD COLUMN IF NOT EXISTS detail_tags TEXT[],
  ADD COLUMN IF NOT EXISTS coverage_tags TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS outfit_plate_cache_storage_path_uidx
  ON outfit_plate_cache(storage_path);

CREATE INDEX IF NOT EXISTS outfit_plate_cache_catalog_source_idx
  ON outfit_plate_cache(catalog_source);

CREATE INDEX IF NOT EXISTS outfit_plate_cache_presentation_groups_gin_idx
  ON outfit_plate_cache USING GIN (presentation_groups);

CREATE INDEX IF NOT EXISTS outfit_plate_cache_purpose_tags_gin_idx
  ON outfit_plate_cache USING GIN (purpose_tags);

CREATE INDEX IF NOT EXISTS outfit_plate_cache_season_tags_gin_idx
  ON outfit_plate_cache USING GIN (season_tags);

CREATE INDEX IF NOT EXISTS outfit_plate_cache_era_tags_gin_idx
  ON outfit_plate_cache USING GIN (era_tags);

CREATE INDEX IF NOT EXISTS outfit_plate_cache_setting_tags_gin_idx
  ON outfit_plate_cache USING GIN (setting_tags);

CREATE INDEX IF NOT EXISTS outfit_plate_cache_activity_tags_gin_idx
  ON outfit_plate_cache USING GIN (activity_tags);

CREATE INDEX IF NOT EXISTS outfit_plate_cache_footwear_tags_gin_idx
  ON outfit_plate_cache USING GIN (footwear_tags);

CREATE INDEX IF NOT EXISTS outfit_plate_cache_component_tags_gin_idx
  ON outfit_plate_cache USING GIN (component_tags);
