-- Remove old preset-template naming from story metadata.

UPDATE stories
SET metadata =
  jsonb_set(
    metadata - 'graphicNovelTemplateCount' - 'graphicNovelTemplateFamily',
    '{graphicNovelPlannedPageCount}',
    metadata->'graphicNovelTemplateCount',
    true
  )
WHERE metadata ? 'graphicNovelTemplateCount'
  AND NOT (metadata ? 'graphicNovelPlannedPageCount');

UPDATE stories
SET metadata = metadata - 'graphicNovelTemplateCount' - 'graphicNovelTemplateFamily'
WHERE metadata ?| ARRAY['graphicNovelTemplateCount', 'graphicNovelTemplateFamily'];
