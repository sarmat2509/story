# Parent Session Plan And Bundle Guards

Date: 2026-05-01

## Scope

- Added `requireParentSession` to authenticated plan feature listing.
- Added `requireParentSession` to the stub/test-mode plan upgrade endpoint.
- Added `requireParentSession` to the user-specific bundle catalog endpoint.

## Behavior

- Child sessions can no longer call:
  - `GET /api/v1/plans/with-features`
  - `PUT /api/v1/plans/upgrade`
  - `GET /api/v1/bundles`
- These endpoints now return `403 PARENT_SESSION_REQUIRED` for child-mode JWT sessions.
- Public plan listing remains public because it is used for unauthenticated pricing pages.

## Verification

- `pnpm --filter wondertales-api exec tsx src/middleware/__tests__/authMiddlewareParentSession.test.ts`
- `pnpm --filter wondertales-api build`
- Live smoke through `http://localhost:8081/api/v1` and dev Postgres:
  - registered a temporary parent account
  - inserted a minimal child profile
  - inserted a valid child-mode session
  - signed a JWT for that child session
  - verified `GET /plans/with-features`, `GET /bundles`, and `PUT /plans/upgrade` all returned `403 PARENT_SESSION_REQUIRED`
  - deleted the temporary account
  - verified no `codex-child-guard-*` users remained
