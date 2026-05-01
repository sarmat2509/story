-- Five bundle SKUs: Small (5), +10, Medium (15), +20, Large (30). Adds two tiers; restores small/medium counts.
-- Created: 2026-04-26

-- Restore original small / medium; keep large at 30/10
UPDATE story_bundles
SET extra_stories = 5, extra_audio = 2, name = 'Small', sort_order = 1, updated_at = NOW()
WHERE slug = 'bundle_small';

UPDATE story_bundles
SET extra_stories = 15, extra_audio = 5, name = 'Medium', sort_order = 3, updated_at = NOW()
WHERE slug = 'bundle_medium';

UPDATE story_bundles
SET sort_order = 5, updated_at = NOW()
WHERE slug = 'bundle_large';

INSERT INTO story_bundles (slug, name, extra_stories, extra_audio, sort_order, is_active)
SELECT 'bundle_boost_10', '+10', 10, 4, 2, true
WHERE NOT EXISTS (SELECT 1 FROM story_bundles WHERE slug = 'bundle_boost_10');

INSERT INTO story_bundles (slug, name, extra_stories, extra_audio, sort_order, is_active)
SELECT 'bundle_boost_20', '+20', 20, 7, 4, true
WHERE NOT EXISTS (SELECT 1 FROM story_bundles WHERE slug = 'bundle_boost_20');

-- Per-plan prices for new bundles (USD cents; stripe_price_id NULL)
INSERT INTO plan_bundle_prices (plan_id, bundle_id, price_minor, pricing_currency, stripe_price_id)
SELECT p.id, b.id, x.price, 'USD', NULL
FROM (VALUES
  ('free', 'bundle_boost_10', 549),
  ('free', 'bundle_boost_20', 1149),
  ('silver', 'bundle_boost_10', 899),
  ('silver', 'bundle_boost_20', 1899),
  ('golden', 'bundle_boost_10', 1249),
  ('golden', 'bundle_boost_20', 2499),
  ('fairyworld', 'bundle_boost_10', 1749),
  ('fairyworld', 'bundle_boost_20', 3499)
) AS x(plan_slug, bundle_slug, price)
INNER JOIN plans p ON p.slug = x.plan_slug
INNER JOIN story_bundles b ON b.slug = x.bundle_slug
ON CONFLICT (plan_id, bundle_id) DO NOTHING;
