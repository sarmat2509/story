-- Migration: Update plan limits for images and replace stories_per_day with stories_per_month
-- Created: 2026-02-02

-- ==========================================
-- 1. Delete old stories_per_day feature
-- ==========================================

-- Delete plan_features entries first (foreign key constraint)
DELETE FROM plan_features
WHERE feature_id IN (SELECT id FROM features WHERE slug = 'stories_per_day');

-- Delete the feature itself
DELETE FROM features WHERE slug = 'stories_per_day';

-- ==========================================
-- 2. Add stories_per_month feature
-- ==========================================

INSERT INTO features (slug, name, description, feature_type, default_value, category, is_internal) 
VALUES (
  'stories_per_month', 
  'Stories Per Month', 
  'Maximum stories that can be created per month', 
  'numeric', 
  '{"value": 5, "unit": "stories"}'::jsonb, 
  'stories', 
  false
);

-- ==========================================
-- 3. Update images_per_story limits
-- ==========================================

-- Free: 1 image
UPDATE plan_features
SET value = '{"limit": 1}'::jsonb
WHERE feature_id = (SELECT id FROM features WHERE slug = 'images_per_story')
  AND plan_id = (SELECT id FROM plans WHERE slug = 'free');

-- Silver: 3 images
UPDATE plan_features
SET value = '{"limit": 3}'::jsonb
WHERE feature_id = (SELECT id FROM features WHERE slug = 'images_per_story')
  AND plan_id = (SELECT id FROM plans WHERE slug = 'silver');

-- Golden: 5 images
UPDATE plan_features
SET value = '{"limit": 5}'::jsonb
WHERE feature_id = (SELECT id FROM features WHERE slug = 'images_per_story')
  AND plan_id = (SELECT id FROM plans WHERE slug = 'golden');

-- Fairy World: 8 images
UPDATE plan_features
SET value = '{"limit": 8}'::jsonb
WHERE feature_id = (SELECT id FROM features WHERE slug = 'images_per_story')
  AND plan_id = (SELECT id FROM plans WHERE slug = 'fairyworld');

-- ==========================================
-- 4. Add stories_per_month to all plans
-- ==========================================

-- Free: 5 stories/month
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT p.id, f.id, '{"limit": 5}'::jsonb
FROM plans p, features f
WHERE p.slug = 'free' AND f.slug = 'stories_per_month';

-- Silver: 15 stories/month
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT p.id, f.id, '{"limit": 15}'::jsonb
FROM plans p, features f
WHERE p.slug = 'silver' AND f.slug = 'stories_per_month';

-- Golden: 30 stories/month
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT p.id, f.id, '{"limit": 30}'::jsonb
FROM plans p, features f
WHERE p.slug = 'golden' AND f.slug = 'stories_per_month';

-- Fairy World: 50 stories/month
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT p.id, f.id, '{"limit": 50}'::jsonb
FROM plans p, features f
WHERE p.slug = 'fairyworld' AND f.slug = 'stories_per_month';
