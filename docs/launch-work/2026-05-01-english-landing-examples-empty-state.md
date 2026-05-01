# English Landing Examples Empty State

Date: 2026-05-01

## Scope

- Hid the empty story examples section on the English public landing page when no English public examples are available.
- Kept the existing empty-state behavior for other landing locales.
- Localized the populated English examples CTA to `/en/stories`.
- Added launch-gate regression coverage for hidden English empty state and localized examples CTA.

## Files changed

- `services/api/src/ssr/renderLandingHtml.ts`
- `services/api/src/ssr/__tests__/renderLandingExamples.test.ts`
- `scripts/launch-gate.sh`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderLandingExamples.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderLandingStructuredData.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- DevTools live check:
  - `/en/` no longer shows the "Examples of magical stories" section or empty-state copy when no English examples are available.
  - `/en/` still shows the next parent section, public trust section, and localized footer stories link.
  - Browser console is clean and loaded assets return 200.
- Docker log review:
  - `wondertales-api-dev`: expected dev restarts from SSR/shared build changes, normal startup, health, and DB pool logs, no new errors.
  - `wondertales-nginx-dev`: expected `/en/` SSR rewrite and 200 responses for landing/static assets.
  - `wondertales-postgres-dev`: no new messages in the checked window.
  - `wondertales-redis-dev`: normal background RDB save only.
