-- Story bundles: extra stories + audio limits until subscription period end
-- Created: 2026-04-26

CREATE TABLE story_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  extra_stories INTEGER NOT NULL CHECK (extra_stories >= 0),
  extra_audio INTEGER NOT NULL CHECK (extra_audio >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX story_bundles_active_sort_idx ON story_bundles (is_active, sort_order);

CREATE TABLE plan_bundle_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  bundle_id UUID NOT NULL REFERENCES story_bundles(id) ON DELETE CASCADE,
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  pricing_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  stripe_price_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, bundle_id)
);

CREATE INDEX plan_bundle_prices_plan_id_idx ON plan_bundle_prices (plan_id);
CREATE INDEX plan_bundle_prices_bundle_id_idx ON plan_bundle_prices (bundle_id);

CREATE TABLE user_bundle_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bundle_id UUID NOT NULL REFERENCES story_bundles(id) ON DELETE RESTRICT,
  subscription_period_start TIMESTAMPTZ NOT NULL,
  subscription_period_end TIMESTAMPTZ NOT NULL,
  extra_stories INTEGER NOT NULL CHECK (extra_stories >= 0),
  extra_audio INTEGER NOT NULL CHECK (extra_audio >= 0),
  source VARCHAR(20) NOT NULL DEFAULT 'stripe',
  stripe_checkout_session_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_bundle_grants_user_period_idx
  ON user_bundle_grants (user_id, subscription_period_start, subscription_period_end);

CREATE UNIQUE INDEX user_bundle_grants_stripe_session_uidx
  ON user_bundle_grants (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Seed bundle definitions (5 tiers: 5, 10, 15, 20, 30 stories)
INSERT INTO story_bundles (slug, name, extra_stories, extra_audio, sort_order, is_active) VALUES
  ('bundle_small', 'First Spark', 5, 2, 1, true),
  ('bundle_boost_10', 'Ten Wishes', 10, 4, 2, true),
  ('bundle_medium', 'Star Path', 15, 5, 3, true),
  ('bundle_boost_20', 'Moon River', 20, 7, 4, true),
  ('bundle_large', 'Wonder Chest', 30, 10, 5, true);

-- Seed per-plan display prices (USD minor units, cents). Stripe price IDs are optional (set in DB or env).
INSERT INTO plan_bundle_prices (plan_id, bundle_id, price_minor, pricing_currency, stripe_price_id)
SELECT p.id, b.id, x.price, 'USD', NULL
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
) AS x(plan_slug, bundle_slug, price)
INNER JOIN plans p ON p.slug = x.plan_slug
INNER JOIN story_bundles b ON b.slug = x.bundle_slug;
