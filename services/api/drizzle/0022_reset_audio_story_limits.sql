-- Migration: Reset and correctly set all audio story limits
-- Created: 2026-02-02

-- Delete existing audio_stories_per_month feature values to start fresh
DELETE FROM plan_features
WHERE feature_id IN (
  SELECT id FROM features WHERE slug = 'audio_stories_per_month'
);

-- Insert correct values for each plan
-- Free: 1 audio story
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT p.id, f.id, '{"limit": 1}'::jsonb
FROM plans p, features f
WHERE p.slug = 'free' AND f.slug = 'audio_stories_per_month';

-- Silver Dreams: 5 audio stories  
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT p.id, f.id, '{"limit": 5}'::jsonb
FROM plans p, features f
WHERE p.slug = 'silver' AND f.slug = 'audio_stories_per_month';

-- Golden Stars: 10 audio stories
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT p.id, f.id, '{"limit": 10}'::jsonb
FROM plans p, features f
WHERE p.slug = 'golden' AND f.slug = 'audio_stories_per_month';

-- Fairy World: 20 audio stories
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT p.id, f.id, '{"limit": 20}'::jsonb
FROM plans p, features f
WHERE p.slug = 'fairyworld' AND f.slug = 'audio_stories_per_month';
