-- Migration: Add publish fields for story publication and user pseudonym
-- Created: 2026-03-03
--
-- Adds published_at, published_slug, author_display_name to stories.
-- Adds pseudonym to users for publishing under a pen name.
-- Adds unique index on published_slug for published stories.

-- Stories: publish metadata
ALTER TABLE stories ADD COLUMN IF NOT EXISTS published_at TIMESTAMP DEFAULT NULL;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS published_slug VARCHAR(100) DEFAULT NULL;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS author_display_name VARCHAR(100) DEFAULT NULL;

-- Unique index for published slugs (only one story per slug)
CREATE UNIQUE INDEX IF NOT EXISTS stories_published_slug_idx ON stories (published_slug) WHERE published_slug IS NOT NULL;

-- Index for listing published stories
CREATE INDEX IF NOT EXISTS stories_published_idx ON stories (published_at DESC) WHERE is_published = true AND published_slug IS NOT NULL;

-- Users: pseudonym for publishing
ALTER TABLE users ADD COLUMN IF NOT EXISTS pseudonym VARCHAR(100) DEFAULT NULL;
