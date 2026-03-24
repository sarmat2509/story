-- Migration: Reduce free plan stories_per_month from 5 to 3
-- Created: 2026-03-18

UPDATE plan_features pf
SET value = '{"limit": 3}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug = 'free'
  AND f.slug = 'stories_per_month';
