-- Migration: Add share_card_scene_id for og:image cover selection (Phase 2)
-- Created: 2026-03-03
-- Run: pnpm run db:migrate -- 0050_add_share_card_scene_id.sql
--
-- scene_id (0-based index) of which scene image to use as share-card/og:image.
-- NULL = first scene (default).

ALTER TABLE stories ADD COLUMN IF NOT EXISTS share_card_scene_id integer DEFAULT NULL;

COMMENT ON COLUMN stories.share_card_scene_id IS '0-based scene index for og:image. NULL = first scene';
