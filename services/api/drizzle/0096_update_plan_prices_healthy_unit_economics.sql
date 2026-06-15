-- Update monthly plan prices after AI image/audio unit economics review.
-- Prices are stored in minor units for EUR: 999 = €9.99.

UPDATE plans SET pricing_currency = 'EUR', price_monthly = 0 WHERE slug = 'free';
UPDATE plans SET pricing_currency = 'EUR', price_monthly = 999 WHERE slug = 'silver';
UPDATE plans SET pricing_currency = 'EUR', price_monthly = 2999 WHERE slug = 'golden';
UPDATE plans SET pricing_currency = 'EUR', price_monthly = 6999 WHERE slug = 'fairyworld';
