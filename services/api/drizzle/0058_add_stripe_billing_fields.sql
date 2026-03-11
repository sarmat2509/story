-- Migration: Add Stripe billing fields for M1 Payment Integration
-- Created: 2026-03-11
-- Description: stripe_customer_id, stripe_subscription_id, payment_provider for real payments

-- 1. Add stripe_customer_id to users (Stripe Customer is per-user)
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- 2. Add Stripe fields to user_subscriptions
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT NULL; -- 'stripe' | 'revenuecat' | null

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_sub ON user_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
