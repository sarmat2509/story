ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS default_outfit_text text,
  ADD COLUMN IF NOT EXISTS default_outfit_embedding jsonb,
  ADD COLUMN IF NOT EXISTS default_outfit_formality varchar(40),
  ADD COLUMN IF NOT EXISTS default_outfit_presentation_groups text[],
  ADD COLUMN IF NOT EXISTS default_outfit_purpose_tags text[],
  ADD COLUMN IF NOT EXISTS default_outfit_season_tags text[],
  ADD COLUMN IF NOT EXISTS default_outfit_climate_tags text[],
  ADD COLUMN IF NOT EXISTS default_outfit_era_tags text[],
  ADD COLUMN IF NOT EXISTS default_outfit_setting_tags text[],
  ADD COLUMN IF NOT EXISTS default_outfit_activity_tags text[],
  ADD COLUMN IF NOT EXISTS default_outfit_silhouette_tags text[],
  ADD COLUMN IF NOT EXISTS default_outfit_footwear_tags text[],
  ADD COLUMN IF NOT EXISTS default_outfit_component_tags text[],
  ADD COLUMN IF NOT EXISTS default_outfit_color_palette text[],
  ADD COLUMN IF NOT EXISTS default_outfit_materials text[],
  ADD COLUMN IF NOT EXISTS default_outfit_patterns text[],
  ADD COLUMN IF NOT EXISTS default_outfit_detail_tags text[],
  ADD COLUMN IF NOT EXISTS default_outfit_coverage_tags text[],
  ADD COLUMN IF NOT EXISTS default_outfit_updated_at timestamp;

CREATE INDEX IF NOT EXISTS characters_default_outfit_presentation_groups_gin_idx
  ON characters USING GIN (default_outfit_presentation_groups);

CREATE INDEX IF NOT EXISTS characters_default_outfit_purpose_tags_gin_idx
  ON characters USING GIN (default_outfit_purpose_tags);

CREATE INDEX IF NOT EXISTS characters_default_outfit_season_tags_gin_idx
  ON characters USING GIN (default_outfit_season_tags);

