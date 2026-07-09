ALTER TABLE image_validation_results
  ADD COLUMN IF NOT EXISTS subject_type varchar(40) NOT NULL DEFAULT 'scene_image',
  ADD COLUMN IF NOT EXISTS page_number integer,
  ADD COLUMN IF NOT EXISTS panel_index integer,
  ADD COLUMN IF NOT EXISTS panel_id varchar(80),
  ADD COLUMN IF NOT EXISTS crop_rect jsonb;

CREATE INDEX IF NOT EXISTS idx_image_validation_results_subject
  ON image_validation_results (story_id, subject_type, page_number, panel_index);
