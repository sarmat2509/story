-- Migration: Fairy World limits + switch all plans to USD pricing
-- Created: 2026-03-09

-- 1. Fairy World: stories_per_month 50 → 45
UPDATE plan_features pf SET value = '{"limit": 45}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id AND pf.feature_id = f.id
  AND p.slug = 'fairyworld' AND f.slug = 'stories_per_month';

-- 2. Fairy World: audio_stories_per_month 20 → 15
UPDATE plan_features pf SET value = '{"limit": 15}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id AND pf.feature_id = f.id
  AND p.slug = 'fairyworld' AND f.slug = 'audio_stories_per_month';

-- 3. Switch all plans to USD, set psychological prices (in cents)
UPDATE plans SET pricing_currency = 'USD', price_monthly = 0 WHERE slug = 'free';
UPDATE plans SET pricing_currency = 'USD', price_monthly = 599 WHERE slug = 'silver';   -- $5.99
UPDATE plans SET pricing_currency = 'USD', price_monthly = 1999 WHERE slug = 'golden';   -- $19.99
UPDATE plans SET pricing_currency = 'USD', price_monthly = 4999 WHERE slug = 'fairyworld'; -- $49.99
