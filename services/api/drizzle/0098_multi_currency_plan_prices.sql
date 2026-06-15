-- Add multi-currency plan prices and persist each user's billing currency.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_billing_currency VARCHAR(3) NOT NULL DEFAULT 'EUR';

CREATE TABLE IF NOT EXISTS plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  pricing_currency VARCHAR(3) NOT NULL,
  price_monthly INTEGER NOT NULL CHECK (price_monthly >= 0),
  stripe_price_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_prices_plan_currency_uidx
  ON plan_prices(plan_id, pricing_currency);
CREATE INDEX IF NOT EXISTS plan_prices_plan_id_idx ON plan_prices(plan_id);
CREATE INDEX IF NOT EXISTS plan_prices_currency_idx ON plan_prices(pricing_currency);

UPDATE plans SET pricing_currency = 'USD', price_monthly = 0 WHERE slug = 'free';
UPDATE plans SET pricing_currency = 'USD', price_monthly = 999 WHERE slug = 'silver';
UPDATE plans SET pricing_currency = 'USD', price_monthly = 2999 WHERE slug = 'golden';
UPDATE plans SET pricing_currency = 'USD', price_monthly = 6999 WHERE slug = 'fairyworld';

INSERT INTO plan_prices (plan_id, pricing_currency, price_monthly, stripe_price_id)
SELECT p.id, v.pricing_currency, v.price_monthly, v.stripe_price_id
FROM plans p
JOIN (
  VALUES
    ('free', 'USD', 0, NULL),
    ('free', 'EUR', 0, NULL),
    ('silver', 'USD', 999, 'price_1TicWk9RbKSeaPPunetboepH'),
    ('silver', 'EUR', 899, 'price_1TicWk9RbKSeaPPuYIJWQvuT'),
    ('golden', 'USD', 2999, 'price_1TicWl9RbKSeaPPuOCgucyZR'),
    ('golden', 'EUR', 2599, 'price_1TicWl9RbKSeaPPuz3DtfXrP'),
    ('fairyworld', 'USD', 6999, 'price_1TicWm9RbKSeaPPu6Dm2ZuJQ'),
    ('fairyworld', 'EUR', 5999, 'price_1TicWm9RbKSeaPPupVHuAtkP')
) AS v(plan_slug, pricing_currency, price_monthly, stripe_price_id)
  ON p.slug = v.plan_slug
ON CONFLICT (plan_id, pricing_currency) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  stripe_price_id = EXCLUDED.stripe_price_id,
  updated_at = NOW();
