WITH cleaned AS (
  SELECT
    id,
    btrim(
      regexp_replace(
        regexp_replace(description, '\s*,?\s*1:1\.?', '', 'gi'),
        '\s{2,}',
        ' ',
        'g'
      )
    ) AS description
  FROM story_artifacts
  WHERE description ~* '1:1'
)
UPDATE story_artifacts AS story_artifact
SET
  description = CASE
    WHEN cleaned.description ~ '[.!?…]$' THEN cleaned.description
    ELSE cleaned.description || '.'
  END,
  updated_at = now()
FROM cleaned
WHERE story_artifact.id = cleaned.id;
