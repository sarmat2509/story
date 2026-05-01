# Parent session guardrails

Date: 2026-05-01

## What changed

- Added non-destructive migration `0085_child_session_context.sql`.
- Added session context columns: `mode`, `parent_user_id`, `child_profile_id`, `scopes`, and `revoked_at`.
- Backfilled existing sessions as parent-owned sessions with `parent_user_id = user_id`.
- Added request session context in auth middleware: `sessionMode`, `parentUserId`, `childProfileId`, and `sessionScopes`.
- Added `requireParentSession` for parent-only account operations.
- Applied parent-only guards to billing checkout/portal, user profile/settings reads and writes, subscription usage and entitlements, session management, OAuth provider management, child profile reads/writes/photo analysis, character profile reads/writes/photo analysis, photo upload/deletion, and story publish/unpublish.
- Hardened session lookup to ignore revoked sessions.
- Made session deletion accept either the internal session UUID or legacy session token, fixing current-session logout paths that pass `sessionId`.

## Verification

- `docker compose -f docker-compose.dev.yml exec -T api pnpm exec tsx src/scripts/runAllMigrations.ts 0085_child_session_context.sql`
- `pnpm --filter wondertales-api exec tsx src/middleware/__tests__/authMiddlewareParentSession.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-universal-app build:web`
- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -t`
- Live API smoke: parent session can read `/api/v1/me`; the same session switched to `mode = 'child'` receives `PARENT_SESSION_REQUIRED` on `/api/v1/me`, `/api/v1/children`, `/api/v1/characters`, `/api/v1/entitlements`, and story publish.
- Browser Use smoke: `http://localhost:8081/pricing` renders `Pricing Plans` with no console errors.

## Follow-ups

- Add explicit child-session creation and switching UX/API once the product flow is ready.
- Add route-level scope checks for future child-session capabilities.
- Add frontend hiding for parent-only surfaces when child mode is introduced.
