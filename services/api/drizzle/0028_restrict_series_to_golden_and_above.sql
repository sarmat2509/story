-- Migration: Restrict Story Series to Golden Stars plan and above
-- Created: 2026-02-04
-- Description: Disable series_enabled for Free and Silver plans, enable for Golden and Fairyworld only

-- Disable series for Free plan
UPDATE plan_features pf
SET value = '{"enabled": false}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'free' 
  AND f.slug = 'series_enabled';

-- Disable series for Silver plan
UPDATE plan_features pf
SET value = '{"enabled": false}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'silver' 
  AND f.slug = 'series_enabled';

-- Ensure series is enabled for Golden plan (should already be)
UPDATE plan_features pf
SET value = '{"enabled": true}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'golden' 
  AND f.slug = 'series_enabled';

-- Ensure series is enabled for Fairyworld plan (should already be)
UPDATE plan_features pf
SET value = '{"enabled": true}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'fairyworld' 
  AND f.slug = 'series_enabled';
