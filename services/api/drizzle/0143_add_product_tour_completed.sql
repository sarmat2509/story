ALTER TABLE users
  ADD COLUMN IF NOT EXISTS product_tour_completed boolean NOT NULL DEFAULT false;

-- Existing accounts have already passed the first-run setup and should not be
-- unexpectedly interrupted. New accounts retain the default `false` value.
UPDATE users
SET product_tour_completed = true
WHERE onboarding_completed = true;
