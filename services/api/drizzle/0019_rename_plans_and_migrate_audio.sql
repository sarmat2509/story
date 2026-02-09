-- Migration: Rename plans to literary names + change audio limits from minutes to story count
-- Created: 2026-02-01

-- Step 1: Rename plan slugs and update names
-- Premium → Silver Dreams
UPDATE plans 
SET 
  slug = 'silver',
  name = 'Срібні сни',
  description = 'Ідеально для регулярного читання'
WHERE slug = 'premium';

-- Professional → Golden Stars
UPDATE plans 
SET 
  slug = 'golden',
  name = 'Золоті зорі',
  description = 'Для відданих любителів казок'
WHERE slug = 'professional';

-- Family → Fairy World
UPDATE plans 
SET 
  slug = 'fairyworld',
  name = 'Казковий світ',
  description = 'Безмежний світ казок для всієї родини'
WHERE slug = 'family';

-- Step 2: Update feature metadata
UPDATE features 
SET 
  slug = 'audio_stories_per_month',
  name = 'Audio Stories Per Month',
  description = 'Number of audio stories that can be generated per month',
  default_value = '{"value": 1, "unit": "stories"}'
WHERE slug = 'audio_minutes_per_month';

-- Step 3: Update plan_features values (new story-based limits)
-- Free plan: 1 audio story
UPDATE plan_features pf
SET value = '{"limit": 1}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'free' 
  AND f.slug = 'audio_stories_per_month';

-- Silver Dreams plan (was premium): 5 audio stories
UPDATE plan_features pf
SET value = '{"limit": 5}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'silver' 
  AND f.slug = 'audio_stories_per_month';

-- Golden Stars plan (was professional): 10 audio stories
UPDATE plan_features pf
SET value = '{"limit": 10}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'golden' 
  AND f.slug = 'audio_stories_per_month';

-- Fairy World plan (was family): 20 audio stories
UPDATE plan_features pf
SET value = '{"limit": 20}'::jsonb
FROM plans p, features f
WHERE pf.plan_id = p.id 
  AND pf.feature_id = f.id
  AND p.slug = 'fairyworld' 
  AND f.slug = 'audio_stories_per_month';

-- Step 4: Update existing user subscriptions to use new slugs (if subscriptions table exists)
-- Note: The actual table name might be 'user_subscriptions', adjust if needed
UPDATE user_subscriptions s
SET plan_id = (SELECT id FROM plans WHERE slug = 'silver')
WHERE plan_id IN (SELECT id FROM plans WHERE slug = 'premium');

UPDATE user_subscriptions s
SET plan_id = (SELECT id FROM plans WHERE slug = 'golden')
WHERE plan_id IN (SELECT id FROM plans WHERE slug = 'professional');

UPDATE user_subscriptions s
SET plan_id = (SELECT id FROM plans WHERE slug = 'fairyworld')
WHERE plan_id IN (SELECT id FROM plans WHERE slug = 'family');
