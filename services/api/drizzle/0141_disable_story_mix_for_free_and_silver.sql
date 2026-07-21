-- Free and Silver contain only ordinary stories, so they do not expose the
-- configurable shared story-mix budget.
UPDATE plan_features pf
SET value = '{"limit": 0}'::jsonb,
    updated_at = NOW()
FROM plans p
JOIN features f ON f.slug = 'story_mix_budget_points'
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug IN ('free', 'silver');
