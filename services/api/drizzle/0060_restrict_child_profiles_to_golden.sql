-- Migration: Restrict child profiles to 1 for free/silver; unlimited for golden/fairyworld
-- Created: 2026-03-16

-- Silver: limit = 1
UPDATE plan_features pf
SET value = '{"limit": 1}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug = 'silver'
  AND f.slug = 'child_profiles_limit';

-- Golden and fairyworld: set limit to null (unlimited)
UPDATE plan_features pf
SET value = '{"limit": null}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug IN ('golden', 'fairyworld')
  AND f.slug = 'child_profiles_limit';
