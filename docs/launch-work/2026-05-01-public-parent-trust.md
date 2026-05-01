# Public Parent Trust Copy

Date: 2026-05-01

## Scope

- Added a public landing trust section for launch SEO locales `uk` and `en`.
- Covered parent-owned accounts, private-by-default child profiles and stories, Child Mode boundaries, and support/deletion paths.
- Linked localized privacy policy URLs from the trust section.
- Linked `/support` for account, export, deletion, and privacy help.
- Added launch-gate regression coverage for the new copy and links.

## Files changed

- `services/api/src/ssr/renderLandingHtml.ts`
- `services/api/src/ssr/__tests__/renderLandingTrustLayer.test.ts`
- `scripts/launch-gate.sh`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderLandingTrustLayer.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderLandingStructuredData.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- DevTools live check:
  - `/en/` shows the English trust section with parent-owned, private-by-default, Child Mode boundary, and deletion/support copy.
  - `/en/` trust links point to `/en/privacy` and `/support`.
  - `/` shows the Ukrainian trust section with default `/privacy` and `/support` links.
  - Browser console is clean and loaded landing assets return 200.
- Docker log review:
  - `wondertales-api-dev`: expected dev restarts from SSR/shared build changes, normal startup, health, and DB pool logs, no new errors.
  - `wondertales-nginx-dev`: expected SSR rewrites for `/en/` and normal 200s for `/`, `/landing/*`, manifest, and static assets.
  - `wondertales-postgres-dev`: no new messages in the checked window.
  - `wondertales-redis-dev`: normal background RDB save only.
