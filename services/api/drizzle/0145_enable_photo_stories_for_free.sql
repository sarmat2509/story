-- Instant mode is a core story-creation path and always begins with a photo.
-- `story_from_drawing` was historically (and misleadingly) also used to gate
-- those photo inputs, which made the Free tier unable to create an Instant
-- story at all. Keep the feature enabled for Free; ordinary story quotas still
-- apply independently.
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT p.id, f.id, '{"enabled": true}'::jsonb
FROM plans p
JOIN features f ON f.slug = 'story_from_drawing'
WHERE p.slug = 'free'
ON CONFLICT (plan_id, feature_id) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();
