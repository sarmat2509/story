-- ==========================================
-- MILESTONE 4: IMAGE GENERATION
-- ==========================================
-- This migration adds:
-- 1. scenes table (moving scenes from jsonb to dedicated table)
-- 2. assets table (images, audio, video storage metadata)
-- 3. generated_references table (AI-generated character portraits for consistency)
-- 4. story_requests progress_data column (task-based progress tracking)

-- ==========================================
-- 1. SCENES TABLE
-- ==========================================
-- Extract scenes from stories.scenes jsonb into dedicated table for better control

CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  scene_id INTEGER NOT NULL, -- sequential number 1, 2, 3...
  
  -- Scene content
  text TEXT NOT NULL,
  visual_prompt TEXT NOT NULL,
  
  -- Generation metadata
  generation_params JSONB,
  generation_time_ms INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(story_id, scene_id)
);

CREATE INDEX scenes_story_id_idx ON scenes(story_id);
CREATE INDEX scenes_story_scene_idx ON scenes(story_id, scene_id);

-- ==========================================
-- 2. ASSETS TABLE
-- ==========================================
-- Store metadata for all generated assets (images, audio, video)

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  
  asset_type VARCHAR(20) NOT NULL, -- 'image', 'audio', 'video'
  
  -- Storage
  storage_path TEXT NOT NULL, -- S3 key or file path
  storage_url TEXT, -- CDN/S3 URL
  signed_url TEXT, -- temporary signed URL
  signed_url_expires_at TIMESTAMP,
  
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes INTEGER,
  
  -- Generation params (includes reference photo ids, mode, etc)
  generation_params JSONB,
  generation_time_ms INTEGER,
  
  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, generating, completed, failed
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX assets_story_id_idx ON assets(story_id);
CREATE INDEX assets_scene_id_idx ON assets(scene_id);
CREATE INDEX assets_status_idx ON assets(status);
CREATE INDEX assets_type_idx ON assets(asset_type);

-- ==========================================
-- 3. GENERATED REFERENCES TABLE
-- ==========================================
-- Store AI-generated character portraits for consistency across scenes

CREATE TABLE IF NOT EXISTS generated_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  child_profile_id UUID REFERENCES child_profiles(id) ON DELETE SET NULL,
  
  -- Character info (for LLM-generated characters without DB record)
  character_name VARCHAR(255), -- from outline.characters[].name
  
  -- Generated reference image
  asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
  
  -- Character description used for generation
  character_description TEXT NOT NULL,
  
  -- Metadata
  generation_params JSONB, -- style, prompt, model, characterType
  reference_type VARCHAR(50) NOT NULL, -- 'generated_portrait', 'scene_extract'
  source VARCHAR(50), -- 'llm_generated', 'user_enriched_by_llm'
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX generated_refs_story_idx ON generated_references(story_id);
CREATE INDEX generated_refs_character_idx ON generated_references(character_id);
CREATE INDEX generated_refs_char_name_idx ON generated_references(story_id, character_name);

-- ==========================================
-- 4. STORY REQUESTS PROGRESS DATA
-- ==========================================
-- Add progress_data column for task-based progress tracking

ALTER TABLE story_requests 
  ADD COLUMN IF NOT EXISTS progress_data JSONB;

-- Progress data structure:
-- {
--   "overallProgress": 65,
--   "activeTasks": [
--     { "task": "generating_images", "progress": 50, "details": { "current": 4, "total": 8 } }
--   ],
--   "completedTasks": ["generating_outline", "generating_text", "validating"]
-- }

-- ==========================================
-- 5. ADD METADATA TO STORIES TABLE
-- ==========================================
-- Add metadata column if it doesn't exist (for storing llmGeneratedCharacters)

ALTER TABLE stories 
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Metadata structure includes:
-- {
--   "llmGeneratedCharacters": [array of characters from outline],
--   "imageStyle": "soft_watercolor",
--   ...
-- }

COMMENT ON TABLE scenes IS 'Individual story scenes with text and visual prompts';
COMMENT ON TABLE assets IS 'Generated assets (images, audio, video) with storage metadata';
COMMENT ON TABLE generated_references IS 'AI-generated character portraits for consistency';
COMMENT ON COLUMN story_requests.progress_data IS 'Task-based progress tracking with parallel task support';
