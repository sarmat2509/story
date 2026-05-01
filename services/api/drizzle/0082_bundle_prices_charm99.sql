-- Charm prices: each total ends in …99 (USD cents) and avg ¢/story strictly decreases by tier per plan.
-- Replaces smooth-only amounts from 0081. Fresh installs: see seed in 0078.
-- Created: 2026-04-26

UPDATE plan_bundle_prices AS pbp
SET price_minor = sub.price_minor, updated_at = NOW()
FROM (
  SELECT p.id AS plan_id, b.id AS bundle_id, x.price_minor
  FROM (VALUES
    ('free', 'bundle_small', 499),
    ('free', 'bundle_boost_10', 899),
    ('free', 'bundle_medium', 1299),
    ('free', 'bundle_boost_20', 1699),
    ('free', 'bundle_large', 2499),
    ('silver', 'bundle_small', 499),
    ('silver', 'bundle_boost_10', 899),
    ('silver', 'bundle_medium', 1299),
    ('silver', 'bundle_boost_20', 1699),
    ('silver', 'bundle_large', 2499),
    ('golden', 'bundle_small', 699),
    ('golden', 'bundle_boost_10', 1299),
    ('golden', 'bundle_medium', 1799),
    ('golden', 'bundle_boost_20', 2299),
    ('golden', 'bundle_large', 3399),
    ('fairyworld', 'bundle_small', 999),
    ('fairyworld', 'bundle_boost_10', 1799),
    ('fairyworld', 'bundle_medium', 2599),
    ('fairyworld', 'bundle_boost_20', 3399),
    ('fairyworld', 'bundle_large', 4999)
  ) AS x(plan_slug, bundle_slug, price_minor)
  INNER JOIN plans p ON p.slug = x.plan_slug
  INNER JOIN story_bundles b ON b.slug = x.bundle_slug
) AS sub
WHERE pbp.plan_id = sub.plan_id AND pbp.bundle_id = sub.bundle_id;
