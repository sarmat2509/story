-- Mixed stories are a plan gate on top of the normal monthly story quota.
-- When enabled, every monthly story credit can be used as Story + comic.

INSERT INTO features (slug, name, description, feature_type, default_value, category)
VALUES (
  'mixed_stories_per_month',
  'Story + comic per month',
  'Number of Story + comic stories available inside the monthly story limit.',
  'numeric',
  '{"limit": 0}'::jsonb,
  'limits'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_type = EXCLUDED.feature_type,
  default_value = EXCLUDED.default_value,
  category = EXCLUDED.category,
  updated_at = NOW();

WITH stories_feature AS (
  SELECT id FROM features WHERE slug = 'stories_per_month'
),
mixed_feature AS (
  SELECT id FROM features WHERE slug = 'mixed_stories_per_month'
)
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT
  p.id,
  mf.id,
  jsonb_build_object(
    'limit',
    CASE
      WHEN p.slug IN ('golden', 'fairyworld')
        THEN COALESCE((stories_pf.value->>'limit')::integer, 0)
      ELSE 0
    END
  )
FROM plans p
CROSS JOIN mixed_feature mf
LEFT JOIN stories_feature sf ON TRUE
LEFT JOIN plan_features stories_pf
  ON stories_pf.plan_id = p.id
  AND stories_pf.feature_id = sf.id
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
