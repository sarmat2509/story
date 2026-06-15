-- Multi-currency bundle prices, remove coming-soon exports, add narrator-follow feature.

DELETE FROM plan_features
WHERE feature_id IN (SELECT id FROM features WHERE slug IN ('export_pdf', 'export_video'));

DELETE FROM features WHERE slug IN ('export_pdf', 'export_video');

INSERT INTO features (slug, name, description, feature_type, default_value, category)
VALUES (
  'follow_narrator',
  'Child can follow the narrator',
  'Highlight or guide story text while audio narration plays',
  'boolean',
  '{"value": false}'::jsonb,
  'media'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_type = EXCLUDED.feature_type,
  default_value = EXCLUDED.default_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO plan_features (plan_id, feature_id, value)
SELECT p.id, f.id, CASE WHEN p.slug = 'free' THEN '{"enabled": false}'::jsonb ELSE '{"enabled": true}'::jsonb END
FROM plans p
CROSS JOIN features f
WHERE f.slug = 'follow_narrator'
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

ALTER TABLE plan_bundle_prices
  DROP CONSTRAINT IF EXISTS plan_bundle_prices_plan_id_bundle_id_key;

DROP INDEX IF EXISTS plan_bundle_prices_plan_bundle_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS plan_bundle_prices_plan_bundle_currency_uidx
  ON plan_bundle_prices(plan_id, bundle_id, pricing_currency);

INSERT INTO plan_bundle_prices (plan_id, bundle_id, pricing_currency, price_minor, stripe_price_id)
SELECT p.id, b.id, v.pricing_currency, v.price_minor, v.stripe_price_id
FROM (VALUES
    ('free', 'bundle_small', 'USD', 499, 'price_1Ticjg9RbKSeaPPuiAkWceJ5'),
    ('free', 'bundle_small', 'EUR', 399, 'price_1Ticjh9RbKSeaPPu5iR6nY0N'),
    ('silver', 'bundle_small', 'USD', 499, 'price_1Ticjh9RbKSeaPPuk3UVVLw0'),
    ('silver', 'bundle_small', 'EUR', 399, 'price_1Ticji9RbKSeaPPu7p5dpM2r'),
    ('golden', 'bundle_small', 'USD', 699, 'price_1Ticji9RbKSeaPPujeHEYJah'),
    ('golden', 'bundle_small', 'EUR', 599, 'price_1Ticjj9RbKSeaPPuRprtEqvl'),
    ('fairyworld', 'bundle_small', 'USD', 999, 'price_1Ticjj9RbKSeaPPuW8ym6c8L'),
    ('fairyworld', 'bundle_small', 'EUR', 899, 'price_1Ticjk9RbKSeaPPuasXdZMRU'),
    ('free', 'bundle_boost_10', 'USD', 899, 'price_1Ticjl9RbKSeaPPumIT5E2Ma'),
    ('free', 'bundle_boost_10', 'EUR', 799, 'price_1Ticjl9RbKSeaPPuapEmO3MD'),
    ('silver', 'bundle_boost_10', 'USD', 899, 'price_1Ticjm9RbKSeaPPuqybv9r8H'),
    ('silver', 'bundle_boost_10', 'EUR', 799, 'price_1Ticjm9RbKSeaPPutmjRlYpJ'),
    ('golden', 'bundle_boost_10', 'USD', 1299, 'price_1Ticjn9RbKSeaPPuhRNaH4ZJ'),
    ('golden', 'bundle_boost_10', 'EUR', 1099, 'price_1Ticjn9RbKSeaPPuVTnXPFgC'),
    ('fairyworld', 'bundle_boost_10', 'USD', 1799, 'price_1Ticjo9RbKSeaPPu4buQdFhk'),
    ('fairyworld', 'bundle_boost_10', 'EUR', 1599, 'price_1Ticjo9RbKSeaPPuiKlztYT4'),
    ('free', 'bundle_medium', 'USD', 1299, 'price_1Ticjp9RbKSeaPPuBQ9uu7S8'),
    ('free', 'bundle_medium', 'EUR', 1099, 'price_1Ticjq9RbKSeaPPu8njeVDiq'),
    ('silver', 'bundle_medium', 'USD', 1299, 'price_1Ticjq9RbKSeaPPu0PbTkZfu'),
    ('silver', 'bundle_medium', 'EUR', 1099, 'price_1Ticjr9RbKSeaPPuVnMOFPcp'),
    ('golden', 'bundle_medium', 'USD', 1799, 'price_1Ticjr9RbKSeaPPuzN0FvQJu'),
    ('golden', 'bundle_medium', 'EUR', 1599, 'price_1Ticjs9RbKSeaPPucSl687wv'),
    ('fairyworld', 'bundle_medium', 'USD', 2599, 'price_1Ticjs9RbKSeaPPuZ40SIa7S'),
    ('fairyworld', 'bundle_medium', 'EUR', 2299, 'price_1Ticjt9RbKSeaPPuhWeWeaeg'),
    ('free', 'bundle_boost_20', 'USD', 1699, 'price_1Ticju9RbKSeaPPuaGhzzLK7'),
    ('free', 'bundle_boost_20', 'EUR', 1499, 'price_1Ticju9RbKSeaPPuW2QEFaFi'),
    ('silver', 'bundle_boost_20', 'USD', 1699, 'price_1Ticjv9RbKSeaPPuQeJoew0h'),
    ('silver', 'bundle_boost_20', 'EUR', 1499, 'price_1Ticjv9RbKSeaPPuhtNMrVTt'),
    ('golden', 'bundle_boost_20', 'USD', 2299, 'price_1Ticjw9RbKSeaPPuUN2lrGG3'),
    ('golden', 'bundle_boost_20', 'EUR', 1999, 'price_1Ticjw9RbKSeaPPuhcLlURuD'),
    ('fairyworld', 'bundle_boost_20', 'USD', 3399, 'price_1Ticjx9RbKSeaPPuyZgBzwX6'),
    ('fairyworld', 'bundle_boost_20', 'EUR', 2999, 'price_1Ticjx9RbKSeaPPugXRkn5m9'),
    ('free', 'bundle_large', 'USD', 2499, 'price_1Ticjz9RbKSeaPPuY6zO8JLg'),
    ('free', 'bundle_large', 'EUR', 2199, 'price_1Ticjz9RbKSeaPPueXEfIwIa'),
    ('silver', 'bundle_large', 'USD', 2499, 'price_1Tick09RbKSeaPPuw8D5CX7d'),
    ('silver', 'bundle_large', 'EUR', 2199, 'price_1Tick09RbKSeaPPupACrbH2Y'),
    ('golden', 'bundle_large', 'USD', 3399, 'price_1Tick19RbKSeaPPu2d4QhWMq'),
    ('golden', 'bundle_large', 'EUR', 2999, 'price_1Tick19RbKSeaPPu18fJHz3t'),
    ('fairyworld', 'bundle_large', 'USD', 4999, 'price_1Tick29RbKSeaPPujz5DN9Dj'),
    ('fairyworld', 'bundle_large', 'EUR', 4299, 'price_1Tick29RbKSeaPPukKxdNsM7')
) AS v(plan_slug, bundle_slug, pricing_currency, price_minor, stripe_price_id)
INNER JOIN plans p ON p.slug = v.plan_slug
INNER JOIN story_bundles b ON b.slug = v.bundle_slug
ON CONFLICT (plan_id, bundle_id, pricing_currency) DO UPDATE SET
  price_minor = EXCLUDED.price_minor,
  stripe_price_id = EXCLUDED.stripe_price_id,
  updated_at = NOW();
