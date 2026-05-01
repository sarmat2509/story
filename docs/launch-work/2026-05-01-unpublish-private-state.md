# Unpublish Private State

Date: 2026-05-01

## Scope

- Updated story unpublish behavior so unpublished stories return to the private visibility state.
- `unpublishStory` now clears `visibility` to `null` along with published date, published slug, author display name, and share token.
- Preserved the existing home-page feature cleanup when a public story is unpublished.
- Added launch-gate regression coverage for the unpublish update payload.

## Files changed

- `services/api/src/services/publishStoryService.ts`
- `services/api/src/services/__tests__/publishStoryService.test.ts`
- `scripts/launch-gate.sh`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --dir services/api exec tsx src/services/__tests__/publishStoryService.test.ts`
- `pnpm --dir services/api exec tsx src/utils/__tests__/storyVisibilityPolicy.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- DevTools live check:
  - `/stories` responds through the public catalog surface after the shared/API rebuild.
  - Browser console is clean and loaded app/static/story assets return 200 or expected cached 304.
- Docker log review:
  - `wondertales-api-dev`: expected dev restarts from service/shared build changes, normal startup, health, DB pool, and public catalog enrichment logs, no new errors.
  - `wondertales-nginx-dev`: expected public route responses and known dev `/message` 404 noise.
  - `wondertales-postgres-dev` and `wondertales-redis-dev`: no new messages in the checked window.
