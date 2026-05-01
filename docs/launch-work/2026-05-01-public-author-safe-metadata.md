# Public Author Safe Metadata

Date: 2026-05-01

## Scope

- Added a dedicated public author view helper that only returns public id, display name, avatar URL, and about text.
- Kept pseudonym-first display-name behavior while trimming blank pseudonyms/display names to avoid blank public author labels.
- Reused the helper from public story catalog/story author metadata and public author profile API.
- Added regression coverage against leaking email, role, Stripe customer id, private/unlisted story counts, or child profile data.
- Added the regression test to `pnpm launch:gate`.

## Files changed

- `services/api/src/utils/publicAuthorView.ts`
- `services/api/src/utils/__tests__/publicAuthorView.test.ts`
- `services/api/src/services/publicStoryService.ts`
- `scripts/launch-gate.sh`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --dir services/api exec tsx src/utils/__tests__/publicAuthorView.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm launch:gate`
- DevTools live API response check confirmed the public catalog exposes only `authorId`, `authorDisplayName`, and `authorAvatarUrl`, while `/api/v1/public/authors/:authorId` exposes only `id`, `displayName`, `avatarUrl`, and `aboutMe`.
- Docker log review covered API, nginx, Postgres, and Redis. API showed expected dev restarts after watched file/shared build changes and normal startup/DB health; nginx showed the catalog and author API checks as `200`; Postgres and Redis had no messages in the checked window.
