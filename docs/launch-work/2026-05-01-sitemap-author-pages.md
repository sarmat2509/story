# Sitemap Author Pages

## What Changed

- Added eligible `/authors/:authorId` entries to `sitemap.xml`.
- Derived author sitemap eligibility from `StoryRepository.listPublished`, the same public catalog predicate used for story sitemap entries.
- Deduplicated authors and set author `lastmod` to the newest public story publication date for that author.
- Kept exact `/stories`, unlisted links, app-only routes, API paths, and authors without public story URLs out of the sitemap.
- Bumped the sitemap Redis cache key to `sitemap:xml:v2` so the new author URL shape appears immediately after deploy.
- Added `sitemapService` launch-gate coverage.

## Verification

- `pnpm --dir services/api exec tsx src/services/__tests__/sitemapService.test.ts`
- `pnpm --filter wondertales-api build`
- `curl http://localhost:8081/sitemap.xml` confirmed one eligible local author URL and no exact `/stories`, `/u/`, `/billing`, `/dashboard`, or `/api/` entries.

## Remaining Follow-Up

- Add localized `/en/authors/:authorId` sitemap URLs only after localized author SSR route ownership exists.
- Re-check production `https://wondertales.art/sitemap.xml` after deploy and cache warm-up.
