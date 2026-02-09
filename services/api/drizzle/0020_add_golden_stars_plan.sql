-- Migration: Add Golden Stars (Professional) plan tier with audio stories
-- Created: 2026-02-02
-- Note: Run AFTER 0019_rename_plans_and_migrate_audio.sql

-- Add Golden Stars plan (€10 = 10000 UAH kopiykas)
INSERT INTO plans (slug, name, description, price_monthly, pricing_currency, billing_period, is_active, sort_order)
VALUES 
  ('golden', 'Золоті зорі', 'Для відданих любителів казок', 10000, 'UAH', 'monthly', true, 2)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  sort_order = EXCLUDED.sort_order;

-- Update Fairy World plan sort_order to 3 (move it to 4th position)
UPDATE plans SET sort_order = 3 WHERE slug = 'fairyworld';

-- Add Golden Stars plan features
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT 
  p.id as plan_id,
  f.id as feature_id,
  CASE f.slug
    WHEN 'stories_per_day' THEN '{"limit": 3}'::jsonb
    WHEN 'images_per_story' THEN '{"limit": 12}'::jsonb
    WHEN 'image_quality' THEN '{"selected": "high"}'::jsonb
    WHEN 'audio_stories_per_month' THEN '{"limit": 10}'::jsonb
    WHEN 'series_enabled' THEN '{"enabled": true}'::jsonb
    WHEN 'premium_voices' THEN '{"enabled": true}'::jsonb
    WHEN 'export_pdf' THEN '{"enabled": true}'::jsonb
    WHEN 'export_video' THEN '{"enabled": false}'::jsonb
    WHEN 'share_enabled' THEN '{"enabled": true}'::jsonb
    WHEN 'story_from_drawing' THEN '{"enabled": true}'::jsonb
    WHEN 'child_profiles_limit' THEN '{"limit": 3}'::jsonb
  END as value
FROM plans p, features f
WHERE p.slug = 'golden' AND f.slug IN (
  'stories_per_day', 'images_per_story', 'image_quality', 'audio_stories_per_month',
  'series_enabled', 'premium_voices', 'export_pdf', 'export_video', 
  'share_enabled', 'story_from_drawing', 'child_profiles_limit'
)
ON CONFLICT (plan_id, feature_id) DO UPDATE SET 
  value = EXCLUDED.value;
