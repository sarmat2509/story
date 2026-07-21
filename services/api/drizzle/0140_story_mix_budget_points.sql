-- One monthly story budget can be spent on ordinary stories, mixed stories,
-- or graphic novels. Values are integer points: story=1000, mixed=5030,
-- graphic novel=8370.
INSERT INTO features (slug, name, description, feature_type, default_value, category)
VALUES (
  'story_mix_budget_points',
  'Flexible story mix budget',
  'Monthly budget shared by ordinary stories, Story + comic, and graphic novels.',
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

WITH values_by_plan(slug, points, stories, graphic_novels, mixed_stories) AS (
  VALUES
    ('free',       3000,   3,   0,  0),
    ('silver',    15000,  15,   0,  0),
    ('golden',    50000,  50,   5,  9),
    ('fairyworld',100000,100,  11, 19)
), feature_rows AS (
  SELECT slug, id FROM features
  WHERE slug IN (
    'story_mix_budget_points',
    'stories_per_month',
    'graphic_novels_per_month',
    'mixed_stories_per_month'
  )
)
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT
  p.id,
  f.id,
  jsonb_build_object(
    'limit',
    CASE f.slug
      WHEN 'story_mix_budget_points' THEN v.points
      WHEN 'stories_per_month' THEN v.stories
      WHEN 'graphic_novels_per_month' THEN v.graphic_novels
      WHEN 'mixed_stories_per_month' THEN v.mixed_stories
    END
  )
FROM plans p
JOIN values_by_plan v ON v.slug = p.slug
CROSS JOIN feature_rows f
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
