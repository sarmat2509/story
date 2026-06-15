-- Update monthly usage limits after AI image/audio unit economics review.
-- Audio limits intentionally stay at the current 5/10/15 monthly narrated stories.

UPDATE plan_features pf
SET value = '{"limit": 10}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug = 'silver'
  AND f.slug = 'stories_per_month';

UPDATE plan_features pf
SET value = '{"limit": 1}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug = 'silver'
  AND f.slug = 'images_per_story';

UPDATE plan_features pf
SET value = '{"limit": 20}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug = 'golden'
  AND f.slug = 'stories_per_month';

UPDATE plan_features pf
SET value = '{"limit": 3}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug = 'golden'
  AND f.slug = 'images_per_story';

UPDATE plan_features pf
SET value = '{"limit": 30}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug = 'fairyworld'
  AND f.slug = 'stories_per_month';

UPDATE plan_features pf
SET value = '{"limit": 5}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug = 'fairyworld'
  AND f.slug = 'images_per_story';
