# Public sharing predicate hardening

## What changed

- Added a shared backend visibility policy for public catalog and unlisted share access.
- Public catalog eligibility now requires:
  - `is_published=true`
  - `visibility='public'`
  - `published_slug IS NOT NULL`
  - `hidden=false`
  - `policy_checks->>'textValidated' = 'true'`
  - `parent_review_status IN ('not_required', 'approved')`
- Unlisted share eligibility now requires:
  - `is_published=true`
  - `visibility='unlisted'`
  - `share_token IS NOT NULL`
  - `hidden=false`
  - `policy_checks->>'textValidated' = 'true'`
  - `parent_review_status IN ('not_required', 'approved')`
- `StoryRepository` now reuses these SQL predicate helpers for public story lookup, unlisted lookup, catalog listing, catalog count, and the owner publish-count response.
- Direct story asset access now uses the same text-moderation and parent-review checks before serving assets as public catalog or unlisted public assets.

## Tests and checks

- `pnpm --dir services/api exec tsx src/utils/__tests__/storyVisibilityPolicy.test.ts`
- `pnpm --dir services/api exec tsx src/services/__tests__/assetAccessService.test.ts`
- `pnpm --filter wondertales-api build`
- Local API smoke:
  - `/api/v1/public/stories?limit=3` returned 9 total public eligible stories.
  - `/api/v1/stories/published?limit=3` returned the same total.
  - `/stories/el-pergamino-danzante-y-el-banquete-de-las-sorpresas` returned `200`.
  - `/api/v1/public/stories/el-pergamino-danzante-y-el-banquete-de-las-sorpresas` returned the story JSON.
- Local DB smoke confirmed current visible public/unlisted candidates all have `textValidated=true` and public-safe parent review status.
- DevTools smoke on the published story page:
  - SSR document returned `200`.
  - public story images and author avatar returned `200`.
  - no console messages were emitted.
- Docker logs checked after the smoke:
  - Postgres emitted no new errors.
  - API emitted only normal connection-pool/debug logs.
