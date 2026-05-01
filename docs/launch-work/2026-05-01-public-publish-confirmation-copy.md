# Public Publish Confirmation Copy

Date: 2026-05-01

## Scope

- Added an explicit warning inside the publish/share dialog when `public` visibility is selected.
- The warning explains that public stories can appear in the catalog and be seen by anyone.
- Added localized copy for the app-supported UI locale files.
- Kept unlisted/link-only sharing visually separate as the private sharing alternative.
- Added launch-gate coverage that checks every app-supported UI locale has descriptive confirmation copy.

## Files changed

- `apps/universal-app/src/components/PublishShareDialog.tsx`
- `services/api/src/ssr/__tests__/publishConfirmationI18n.test.ts`
- `scripts/launch-gate.sh`
- `packages/shared/src/i18n/*.json`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --dir services/api exec tsx src/ssr/__tests__/publishConfirmationI18n.test.ts`
- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app build:web`
- `pnpm launch:gate`
- DevTools live smoke check reloaded a public story page after the bundle update and found no browser console errors. The current browser session was unauthenticated, so opening the authenticated publish dialog live was not available without creating test session data.
- Docker log review covered API, nginx, Postgres, and Redis. API showed expected dev restarts after watched shared i18n changes and normal startup/DB health; nginx showed the public story reload, bundle, manifest, and font requests, plus known dev `/message` and source-map 404 noise; Postgres and Redis had no messages in the checked window.
