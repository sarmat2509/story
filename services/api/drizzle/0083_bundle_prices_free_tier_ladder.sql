-- Free-plan bundle display prices: same charm ladder as silver ($4.99 … $24.99).
-- Created: 2026-04-26

UPDATE plan_bundle_prices AS pbp
SET price_minor = sub.price_minor, updated_at = NOW()
FROM (
  SELECT p.id AS plan_id, b.id AS bundle_id, v.price_minor
  FROM (VALUES
    ('free', 'bundle_small', 499),
    ('free', 'bundle_boost_10', 899),
    ('free', 'bundle_medium', 1299),
    ('free', 'bundle_boost_20', 1699),
    ('free', 'bundle_large', 2499)
  ) AS v(plan_slug, bundle_slug, price_minor)
  INNER JOIN plans p ON p.slug = v.plan_slug
  INNER JOIN story_bundles b ON b.slug = v.bundle_slug
) AS sub
WHERE pbp.plan_id = sub.plan_id AND pbp.bundle_id = sub.bundle_id;
