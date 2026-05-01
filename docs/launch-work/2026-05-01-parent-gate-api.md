# Parent gate API

Date: 2026-05-01

## What changed

- Added `POST /api/v1/auth/parent-gate`.
- The route requires an authenticated child session.
- Password-authenticated adults can re-enter Parent Mode by providing their password.
- On success, the API:
  - creates a fresh parent session
  - returns a new JWT
  - revokes the previous child session
  - returns `sessionMode: parent`

## Safety notes

- The endpoint does not accept parent-gate attempts from parent sessions.
- OAuth-only accounts still need a non-password parent gate path before Child Mode can be fully user-facing.
- UI wiring for the parent gate remains a follow-up.

## Verification

- `pnpm build` in `services/api`
- Dev API smoke: unauthenticated `POST /api/v1/auth/parent-gate` returns `401`
