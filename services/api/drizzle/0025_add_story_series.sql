-- Migration: Add Story Series Support
-- Created: 2026-02-03
-- Description: Add story_series table and update stories table to support series/continuations

-- Story series table
CREATE TABLE IF NOT EXISTS story_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_profile_id UUID REFERENCES child_profiles(id) ON DELETE SET NULL,
  
  -- Series metadata
  base_title VARCHAR(255) NOT NULL,
  language VARCHAR(5) NOT NULL,
  age_group VARCHAR(10) NOT NULL,
  image_style VARCHAR(50) NOT NULL,
  tone VARCHAR(50),
  
  -- Continuity tracking
  total_parts INTEGER NOT NULL DEFAULT 1,
  story_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- LLM context for next continuation
  continuation_context JSONB,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS story_series_user_id_idx ON story_series(user_id);
CREATE INDEX IF NOT EXISTS story_series_created_at_idx ON story_series(created_at);

-- Add series_id and part_number to stories table
ALTER TABLE stories ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES story_series(id) ON DELETE SET NULL;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS part_number INTEGER;

-- Create index for series_id
CREATE INDEX IF NOT EXISTS stories_series_id_idx ON stories(series_id);
