-- Complete Migration: Create all tables from scratch
-- Run this on a fresh database

-- ==========================================
-- Function for updated_at trigger
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- ==========================================
-- Base tables (from Milestone 0-1)
-- ==========================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  avatar_url TEXT,
  preferred_locale VARCHAR(5) NOT NULL DEFAULT 'uk',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- OAuth identities table
CREATE TABLE IF NOT EXISTS oauth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email VARCHAR(255),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  raw_user_info JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS oauth_identities_provider_user_idx ON oauth_identities(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS oauth_identities_user_id_idx ON oauth_identities(user_id);

CREATE TRIGGER update_oauth_identities_updated_at
  BEFORE UPDATE ON oauth_identities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  device_name VARCHAR(255),
  device_type VARCHAR(50),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

-- ==========================================
-- Milestone 2: Plans & Features System
-- ==========================================

-- Plans table
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price_monthly INTEGER NOT NULL DEFAULT 0,
  pricing_currency VARCHAR(3) NOT NULL DEFAULT 'UAH',
  billing_period VARCHAR(20) NOT NULL DEFAULT 'monthly',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS plans_slug_idx ON plans(slug);
CREATE INDEX IF NOT EXISTS plans_is_active_idx ON plans(is_active);

CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Features table
CREATE TABLE IF NOT EXISTS features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  feature_type VARCHAR(20) NOT NULL,
  default_value JSONB NOT NULL,
  category VARCHAR(50) NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS features_slug_idx ON features(slug);
CREATE INDEX IF NOT EXISTS features_category_idx ON features(category);

CREATE TRIGGER update_features_updated_at
  BEFORE UPDATE ON features
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Plan features mapping table
CREATE TABLE IF NOT EXISTS plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  value JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plan_features_plan_id_idx ON plan_features(plan_id);
CREATE INDEX IF NOT EXISTS plan_features_feature_id_idx ON plan_features(feature_id);
CREATE UNIQUE INDEX IF NOT EXISTS plan_features_unique_idx ON plan_features(plan_id, feature_id);

CREATE TRIGGER update_plan_features_updated_at
  BEFORE UPDATE ON plan_features
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- User subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  trial_ends_at TIMESTAMP,
  stories_used INTEGER NOT NULL DEFAULT 0,
  audio_minutes_used INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMP NOT NULL,
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_user_id_idx ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS user_subscriptions_plan_id_idx ON user_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS user_subscriptions_status_idx ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS user_subscriptions_reset_at_idx ON user_subscriptions(reset_at);

CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Child profiles table
CREATE TABLE IF NOT EXISTS child_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  birth_date DATE NOT NULL,
  gender VARCHAR(20),
  languages JSONB NOT NULL,
  reference_photos JSONB,
  appearance_traits JSONB,
  personality JSONB,
  interests JSONB,
  sensitivities JSONB,
  family_cast JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS child_profiles_user_id_idx ON child_profiles(user_id);
CREATE INDEX IF NOT EXISTS child_profiles_birth_date_idx ON child_profiles(birth_date);
CREATE INDEX IF NOT EXISTS child_profiles_is_active_idx ON child_profiles(is_active);

CREATE TRIGGER update_child_profiles_updated_at
  BEFORE UPDATE ON child_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Characters table
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  reference_photos JSONB,
  appearance_traits JSONB,
  personality JSONB,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS characters_user_id_idx ON characters(user_id);
CREATE INDEX IF NOT EXISTS characters_type_idx ON characters(type);
CREATE INDEX IF NOT EXISTS characters_is_active_idx ON characters(is_active);

CREATE TRIGGER update_characters_updated_at
  BEFORE UPDATE ON characters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Usage events table
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_profile_id UUID REFERENCES child_profiles(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_events_user_id_idx ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS usage_events_created_at_idx ON usage_events(created_at);
CREATE INDEX IF NOT EXISTS usage_events_type_idx ON usage_events(event_type);

-- ==========================================
-- SEED DATA: Plans (3 tiers)
-- ==========================================

INSERT INTO plans (slug, name, description, price_monthly, pricing_currency, billing_period, is_active, sort_order)
VALUES
  ('free', 'Безкоштовний', 'Базовий план для знайомства з платформою', 0, 'UAH', 'monthly', true, 1),
  ('premium', 'Преміум', '1-2 історії на день, 8-12 ілюстрацій, преміум голоси', 10000, 'UAH', 'monthly', true, 2),
  ('family', 'Сімейний', 'До 4 дітей, необмежені серії, експорт PDF', 17900, 'UAH', 'monthly', true, 3)
ON CONFLICT (slug) DO NOTHING;

-- ==========================================
-- SEED DATA: Features (~11 features)
-- ==========================================

INSERT INTO features (slug, name, description, feature_type, default_value, category, is_internal)
VALUES
  -- Story limits
  ('stories_per_day', 'Stories Per Day', 'Maximum stories that can be created per day', 'numeric', '{"value": 1, "unit": "stories"}', 'stories', false),
  ('series_enabled', 'Story Series', 'Enable multi-episode story series (5-7 episodes)', 'boolean', '{"value": false}', 'stories', false),
  
  -- Media limits
  ('images_per_story', 'Images Per Story', 'Maximum images per story', 'numeric', '{"value": 3, "unit": "images"}', 'media', false),
  ('image_quality', 'Image Quality', 'Quality level for image generation', 'enum', '{"value": "low", "options": ["low", "medium", "high"]}', 'media', false),
  ('audio_minutes_per_month', 'Audio Minutes Per Month', 'Total audio synthesis minutes per month', 'numeric', '{"value": 10, "unit": "minutes"}', 'media', false),
  ('premium_voices', 'Premium Voice Selection', 'Access to premium voice actors', 'boolean', '{"value": false}', 'media', false),
  
  -- Export & Sharing
  ('export_pdf', 'Export as PDF', 'Export stories as PDF documents', 'boolean', '{"value": false}', 'export', false),
  ('export_video', 'Export as Video', 'Export stories as video files', 'boolean', '{"value": false}', 'export', false),
  ('share_enabled', 'Share Story Links', 'Create shareable links for stories', 'boolean', '{"value": true}', 'export', false),
  
  -- Premium features
  ('story_from_drawing', 'Story From Child Drawing', 'Generate stories from child drawings', 'boolean', '{"value": false}', 'premium', false),
  ('child_profiles_limit', 'Child Profiles Limit', 'Maximum number of child profiles', 'numeric', '{"value": 1, "unit": "profiles"}', 'premium', false)
ON CONFLICT (slug) DO NOTHING;

-- ==========================================
-- SEED DATA: Plan Features (mappings)
-- ==========================================

-- Free plan features
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT 
  p.id as plan_id,
  f.id as feature_id,
  CASE f.slug
    WHEN 'stories_per_day' THEN '{"limit": 1}'::jsonb
    WHEN 'images_per_story' THEN '{"limit": 3}'::jsonb
    WHEN 'image_quality' THEN '{"selected": "low"}'::jsonb
    WHEN 'audio_minutes_per_month' THEN '{"limit": 10}'::jsonb
    WHEN 'series_enabled' THEN '{"enabled": false}'::jsonb
    WHEN 'premium_voices' THEN '{"enabled": false}'::jsonb
    WHEN 'export_pdf' THEN '{"enabled": false}'::jsonb
    WHEN 'export_video' THEN '{"enabled": false}'::jsonb
    WHEN 'share_enabled' THEN '{"enabled": true}'::jsonb
    WHEN 'story_from_drawing' THEN '{"enabled": false}'::jsonb
    WHEN 'child_profiles_limit' THEN '{"limit": 1}'::jsonb
  END as value
FROM plans p, features f
WHERE p.slug = 'free'
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- Premium plan features
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT 
  p.id as plan_id,
  f.id as feature_id,
  CASE f.slug
    WHEN 'stories_per_day' THEN '{"limit": 2}'::jsonb
    WHEN 'images_per_story' THEN '{"limit": 12}'::jsonb
    WHEN 'image_quality' THEN '{"selected": "medium"}'::jsonb
    WHEN 'audio_minutes_per_month' THEN '{"limit": 120}'::jsonb
    WHEN 'series_enabled' THEN '{"enabled": true}'::jsonb
    WHEN 'premium_voices' THEN '{"enabled": true}'::jsonb
    WHEN 'export_pdf' THEN '{"enabled": true}'::jsonb
    WHEN 'export_video' THEN '{"enabled": false}'::jsonb
    WHEN 'share_enabled' THEN '{"enabled": true}'::jsonb
    WHEN 'story_from_drawing' THEN '{"enabled": true}'::jsonb
    WHEN 'child_profiles_limit' THEN '{"limit": 2}'::jsonb
  END as value
FROM plans p, features f
WHERE p.slug = 'premium'
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- Family plan features
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT 
  p.id as plan_id,
  f.id as feature_id,
  CASE f.slug
    WHEN 'stories_per_day' THEN '{"limit": 5}'::jsonb
    WHEN 'images_per_story' THEN '{"limit": 12}'::jsonb
    WHEN 'image_quality' THEN '{"selected": "high"}'::jsonb
    WHEN 'audio_minutes_per_month' THEN '{"limit": 300}'::jsonb
    WHEN 'series_enabled' THEN '{"enabled": true}'::jsonb
    WHEN 'premium_voices' THEN '{"enabled": true}'::jsonb
    WHEN 'export_pdf' THEN '{"enabled": true}'::jsonb
    WHEN 'export_video' THEN '{"enabled": true}'::jsonb
    WHEN 'share_enabled' THEN '{"enabled": true}'::jsonb
    WHEN 'story_from_drawing' THEN '{"enabled": true}'::jsonb
    WHEN 'child_profiles_limit' THEN '{"limit": 4}'::jsonb
  END as value
FROM plans p, features f
WHERE p.slug = 'family'
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- ==========================================
-- MIGRATE EXISTING USERS: Initialize subscriptions
-- ==========================================

-- Initialize free plan for all existing users
INSERT INTO user_subscriptions (
  user_id,
  plan_id,
  status,
  reset_at,
  current_period_start,
  current_period_end
)
SELECT 
  u.id as user_id,
  (SELECT id FROM plans WHERE slug = 'free') as plan_id,
  'active' as status,
  (NOW() + INTERVAL '1 month') as reset_at,
  NOW() as current_period_start,
  (NOW() + INTERVAL '1 month') as current_period_end
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_subscriptions us WHERE us.user_id = u.id
);
