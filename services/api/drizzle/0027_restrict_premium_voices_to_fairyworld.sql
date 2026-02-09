-- Migration: Restrict Premium Voices to Fairyworld plan only
-- Created: 2026-02-04
-- Description: Disable premium_voices for free, silver, and golden plans

-- Disable premium_voices for Free plan
UPDATE plan_features pf
SET value = '{"enabled": false}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'free' 
  AND f.slug = 'premium_voices';

-- Disable premium_voices for Silver plan
UPDATE plan_features pf
SET value = '{"enabled": false}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'silver' 
  AND f.slug = 'premium_voices';

-- Disable premium_voices for Golden plan
UPDATE plan_features pf
SET value = '{"enabled": false}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'golden' 
  AND f.slug = 'premium_voices';

-- Ensure premium_voices is enabled for Fairyworld plan (should already be enabled)
UPDATE plan_features pf
SET value = '{"enabled": true}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'fairyworld' 
  AND f.slug = 'premium_voices';
