# Legacy Public Story Endpoint Deprecation

Date: 2026-05-01

## Scope

- Kept old `/api/v1/stories/published` and `/api/v1/stories/published/:slug` routes available for compatibility.
- Added `Deprecation`, `Sunset`, `Link`, and `X-Deprecated-Endpoint` headers so clients can migrate to `/api/v1/public/stories` and `/api/v1/public/stories/:slug`.
- Added a small shared header helper and focused test coverage.
- Added the regression test to `pnpm launch:gate`.

## Files changed

- `services/api/src/routes/stories.ts`
- `services/api/src/utils/deprecatedPublicStoryRoutes.ts`
- `services/api/src/utils/__tests__/deprecatedPublicStoryRoutes.test.ts`
- `scripts/launch-gate.sh`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --dir services/api exec tsx src/utils/__tests__/deprecatedPublicStoryRoutes.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm launch:gate`
- DevTools live header check confirmed `/api/v1/stories/published?limit=1` and `/api/v1/stories/published/:slug` return `Deprecation`, `Sunset`, `Link`, and `X-Deprecated-Endpoint` headers pointing to `/api/v1/public/stories` successors.
- Docker log review covered API, nginx, Postgres, and Redis. API showed expected dev restarts after watched file changes and normal startup/DB health; nginx showed the legacy API checks as `200`; Postgres and Redis had no messages in the checked window.
