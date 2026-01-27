-- ==========================================
-- MILESTONE 5: TTS AUDIO GENERATION
-- ==========================================
-- This migration adds:
-- 1. tts_voices table (catalog of available TTS voices)
-- 2. audio_assets table (generated audio metadata and caching)
-- 3. stories.audio_metadata column (audio generation metadata)

-- ==========================================
-- 1. TTS VOICES TABLE
-- ==========================================
-- Catalog of available voices from TTS providers

CREATE TABLE IF NOT EXISTS tts_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Voice identity
  provider VARCHAR(50) NOT NULL, -- 'elevenlabs', 'google', 'azure'
  provider_voice_id VARCHAR(100) NOT NULL,
  
  -- Voice metadata
  name VARCHAR(100) NOT NULL,
  language VARCHAR(10) NOT NULL,
  gender VARCHAR(20), -- 'male', 'female', 'neutral'
  age_category VARCHAR(20), -- 'child', 'young_adult', 'adult', 'senior'
  description TEXT,
  
  -- Voice characteristics
  tags JSONB, -- ['calm', 'energetic', 'storyteller', 'parent']
  accent VARCHAR(50),
  
  -- Configuration
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  default_speed DECIMAL(3, 2) NOT NULL DEFAULT 1.0,
  
  -- Sample
  sample_audio_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(provider, provider_voice_id)
);

CREATE UNIQUE INDEX tts_voices_provider_voice_idx ON tts_voices(provider, provider_voice_id);
CREATE INDEX tts_voices_language_idx ON tts_voices(language);
CREATE INDEX tts_voices_active_idx ON tts_voices(is_active);

-- ==========================================
-- 2. AUDIO ASSETS TABLE
-- ==========================================
-- Generated audio metadata with caching support

CREATE TABLE IF NOT EXISTS audio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relations
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  
  -- Voice info
  voice_id UUID REFERENCES tts_voices(id) ON DELETE RESTRICT,
  voice_name VARCHAR(100) NOT NULL,
  language VARCHAR(10) NOT NULL,
  
  -- Prosody settings
  speed DECIMAL(3, 2) NOT NULL DEFAULT 1.0,
  pitch_shift INTEGER NOT NULL DEFAULT 0,
  night_mode BOOLEAN NOT NULL DEFAULT false,
  
  -- Content hash for caching
  text_hash VARCHAR(64) NOT NULL, -- SHA256 of normalized text
  
  -- Asset info
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  duration_seconds DECIMAL(8, 2),
  
  -- Provider info
  provider VARCHAR(50) NOT NULL DEFAULT 'elevenlabs',
  provider_request_id VARCHAR(255),
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX audio_assets_story_idx ON audio_assets(story_id);
CREATE INDEX audio_assets_status_idx ON audio_assets(status);
CREATE INDEX audio_assets_cache_idx ON audio_assets(text_hash, voice_id, speed);
CREATE INDEX audio_assets_created_idx ON audio_assets(created_at);

-- ==========================================
-- 3. STORIES AUDIO METADATA
-- ==========================================
-- Add audio_metadata column to stories table

ALTER TABLE stories 
  ADD COLUMN IF NOT EXISTS audio_metadata JSONB;

-- Audio metadata structure:
-- {
--   "voiceId": "uuid",
--   "voiceName": "Оленка",
--   "totalDuration": 360.5,
--   "generatedAt": "2026-01-26T12:00:00Z",
--   "nightMode": false
-- }

-- ==========================================
-- 4. COMMENTS
-- ==========================================

COMMENT ON TABLE tts_voices IS 'Catalog of available TTS voices from various providers';
COMMENT ON TABLE audio_assets IS 'Generated audio metadata with caching support (text_hash + voice_id + speed)';
COMMENT ON COLUMN stories.audio_metadata IS 'Audio generation metadata (voice, duration, settings)';
COMMENT ON COLUMN audio_assets.text_hash IS 'SHA256 hash of normalized text for cache hit detection';
COMMENT ON COLUMN audio_assets.night_mode IS 'Night mode flag (softer, slower for bedtime)';
