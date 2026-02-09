-- Add sceneGroupIndex to distinguish partial vs final audio
-- Migration: 0009_add_audio_scene_group_index
-- Created: 2026-02-02

-- Add scene_group_index column
-- NULL = final concatenated audio
-- 0, 1, 2, ... = partial scene group chunks
ALTER TABLE audio_assets 
ADD COLUMN scene_group_index INTEGER DEFAULT NULL;

-- Add is_final flag for clarity
ALTER TABLE audio_assets
ADD COLUMN is_final BOOLEAN DEFAULT FALSE NOT NULL;

-- Add retry_count for tracking retry attempts
ALTER TABLE audio_assets
ADD COLUMN retry_count INTEGER DEFAULT 0 NOT NULL;

-- Update existing records to mark as final (best guess - existing records have no group index)
UPDATE audio_assets 
SET is_final = TRUE, scene_group_index = NULL
WHERE scene_group_index IS NULL;

-- Add index for faster queries on final audio
CREATE INDEX audio_assets_scene_group_idx 
ON audio_assets(story_id, scene_group_index, status);

-- Add comments for documentation
COMMENT ON COLUMN audio_assets.scene_group_index IS 
'Scene group index (0,1,2...) for partial chunks, NULL for final concatenated audio';

COMMENT ON COLUMN audio_assets.is_final IS 
'TRUE if this is the final concatenated audio, FALSE for partial chunks';

COMMENT ON COLUMN audio_assets.retry_count IS 
'Number of retry attempts for this audio asset generation';
