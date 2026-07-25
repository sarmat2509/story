-- Promo accounts are time-limited application accounts, not renewable subscriptions.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "account_type" varchar(20) NOT NULL DEFAULT 'standard';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "promo_started_at" timestamptz;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "promo_expires_at" timestamptz;

CREATE INDEX IF NOT EXISTS "users_active_promo_expiry_idx"
  ON "users" ("promo_expires_at")
  WHERE "account_type" = 'promo' AND "status" = 'active';
