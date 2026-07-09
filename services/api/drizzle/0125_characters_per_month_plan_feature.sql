-- Add monthly manual character generation limits.
-- Hidden LLM characters created during story generation are not counted.

INSERT INTO features (slug, name, description, feature_type, default_value, category)
VALUES (
  'characters_per_month',
  'Character generations per month',
  'Number of manual character model generations available per month, including redraws after visual edits.',
  'numeric',
  '{"limit": 3}'::jsonb,
  'limits'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_type = EXCLUDED.feature_type,
  default_value = EXCLUDED.default_value,
  category = EXCLUDED.category,
  updated_at = NOW();

WITH character_feature AS (
  SELECT id FROM features WHERE slug = 'characters_per_month'
)
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT
  p.id,
  cf.id,
  jsonb_build_object(
    'limit',
    CASE p.slug
      WHEN 'free' THEN 3
      WHEN 'silver' THEN 10
      WHEN 'golden' THEN 15
      WHEN 'fairyworld' THEN 20
      ELSE 0
    END
  )
FROM plans p
CROSS JOIN character_feature cf
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
