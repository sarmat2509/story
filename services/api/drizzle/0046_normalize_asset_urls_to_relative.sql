-- Migration: Normalize asset URLs - replace localhost with relative paths
-- Created: 2026-03-04
-- Run on droplet: ./scripts/run-all-migrations.sh --host 0046_normalize_asset_urls_to_relative.sql
-- Run locally: cd services/api && npx tsx src/scripts/runMigration.ts 0046_normalize_asset_urls_to_relative.sql

-- Characters: strip localhost host from URLs in reference_photos (keep path only)
UPDATE characters
SET reference_photos = (
  SELECT jsonb_agg(
    jsonb_set(elem, '{url}', to_jsonb(regexp_replace(elem->>'url', '^https?://[^/]+', '')))
  )
  FROM jsonb_array_elements(reference_photos) AS elem
)
WHERE reference_photos IS NOT NULL
  AND reference_photos::text LIKE '%localhost%';

-- Child profiles: same
UPDATE child_profiles
SET reference_photos = (
  SELECT jsonb_agg(
    jsonb_set(elem, '{url}', to_jsonb(regexp_replace(elem->>'url', '^https?://[^/]+', '')))
  )
  FROM jsonb_array_elements(reference_photos) AS elem
)
WHERE reference_photos IS NOT NULL
  AND reference_photos::text LIKE '%localhost%';

