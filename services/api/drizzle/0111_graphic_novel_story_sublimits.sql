-- Graphic novels are a sublimit of the monthly story quota.
-- Keep the generated page count as server behavior, not a visible plan feature.

DELETE FROM plan_features
WHERE feature_id IN (
  SELECT id FROM features WHERE slug = 'graphic_novel_pages_per_story'
);

DELETE FROM features
WHERE slug = 'graphic_novel_pages_per_story';

UPDATE features
SET
  name = 'Graphic novels per month',
  description = 'Number of graphic novels available inside the monthly story limit.',
  feature_type = 'numeric',
  default_value = '{"limit": 0}'::jsonb,
  category = 'limits',
  updated_at = NOW()
WHERE slug = 'graphic_novels_per_month';

INSERT INTO plan_features (plan_id, feature_id, value)
SELECT
  plans.id,
  features.id,
  jsonb_build_object(
    'limit',
    CASE plans.slug
      WHEN 'golden' THEN 5
      WHEN 'fairyworld' THEN 15
      ELSE 0
    END
  )
FROM plans
JOIN features ON features.slug = 'graphic_novels_per_month'
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
