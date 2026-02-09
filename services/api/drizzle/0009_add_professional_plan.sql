-- Migration: Add Professional plan tier
-- Created: 2026-01-31

-- Add Professional plan (€10 = 1000 UAH kopiykas)
INSERT INTO plans (slug, name, description, price_monthly, pricing_currency, billing_period, is_active, sort_order)
VALUES 
  ('professional', 'Професійний', 'Для відданих розповідачів', 10000, 'UAH', 'monthly', true, 2);

-- Update Family plan sort_order to 3 (move it to 4th position)
UPDATE plans SET sort_order = 3 WHERE slug = 'family';

-- Add Professional plan features
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT 
  p.id as plan_id,
  f.id as feature_id,
  CASE f.slug
    WHEN 'stories_per_day' THEN '{"limit": 3}'::jsonb
    WHEN 'images_per_story' THEN '{"limit": 12}'::jsonb
    WHEN 'image_quality' THEN '{"selected": "high"}'::jsonb
    WHEN 'audio_minutes_per_month' THEN '{"limit": 200}'::jsonb
    WHEN 'series_enabled' THEN '{"enabled": true}'::jsonb
    WHEN 'premium_voices' THEN '{"enabled": true}'::jsonb
    WHEN 'export_pdf' THEN '{"enabled": true}'::jsonb
    WHEN 'export_video' THEN '{"enabled": false}'::jsonb
    WHEN 'share_enabled' THEN '{"enabled": true}'::jsonb
    WHEN 'story_from_drawing' THEN '{"enabled": true}'::jsonb
    WHEN 'child_profiles_limit' THEN '{"limit": 3}'::jsonb
  END as value
FROM plans p, features f
WHERE p.slug = 'professional';
