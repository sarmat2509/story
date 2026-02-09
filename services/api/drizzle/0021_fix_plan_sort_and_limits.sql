-- Migration: Fix plan sort_order and update audio story limits
-- Created: 2026-02-02

-- Fix sort_order to ensure correct ordering
UPDATE plans SET sort_order = 1 WHERE slug = 'free';
UPDATE plans SET sort_order = 2 WHERE slug = 'silver';
UPDATE plans SET sort_order = 3 WHERE slug = 'golden';
UPDATE plans SET sort_order = 4 WHERE slug = 'fairyworld';

-- Update audio story limits to match new plan structure
-- Free: 1 audio story
UPDATE plan_features pf
SET value = '{"limit": 1}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'free' 
  AND f.slug = 'audio_stories_per_month';

-- Silver Dreams: 5 audio stories
UPDATE plan_features pf
SET value = '{"limit": 5}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'silver' 
  AND f.slug = 'audio_stories_per_month';

-- Golden Stars: 10 audio stories (already set in 0020)
-- No change needed

-- Fairy World: 20 audio stories
UPDATE plan_features pf
SET value = '{"limit": 20}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'fairyworld' 
  AND f.slug = 'audio_stories_per_month';
