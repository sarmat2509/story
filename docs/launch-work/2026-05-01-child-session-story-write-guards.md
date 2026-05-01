# Child Session Story Write Guards

Date: 2026-05-01

## Scope

- Added `requireParentSession` to mutating and expensive story routes until scoped child-mode generation controls are implemented.
- Left read-only story routes available under their existing authentication/public rules.

## Guarded Routes

- `POST /api/v1/stories`
- `POST /api/v1/stories/instant`
- `POST /api/v1/stories/requests/:id/retry-images`
- `PATCH /api/v1/stories/:id`
- `DELETE /api/v1/stories/:id`
- `POST /api/v1/stories/:id/continue`
- `POST /api/v1/stories/:id/schedule-continuation`
- `DELETE /api/v1/stories/:id/schedule-continuation`
- `POST /api/v1/stories/:id/audio`
- `POST /api/v1/stories/:id/alignment`
- `POST /api/v1/stories/:id/scenes/:sceneId/regenerate`
- `POST /api/v1/stories/:id/tts`

## Behavior

- Child sessions now receive `403 PARENT_SESSION_REQUIRED` before validation, quota reservation, queueing, or expensive generation work.
- This is intentionally fail-closed until parent controls, child-safe generation scopes, and parent review state are implemented.

## Verification

- `pnpm --filter wondertales-api exec tsx src/middleware/__tests__/authMiddlewareParentSession.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyQuotaReservation.test.ts`
- `pnpm --filter wondertales-api build`
- Live smoke through `http://localhost:8081/api/v1` and dev Postgres:
  - registered a temporary parent account
  - inserted a minimal child profile
  - inserted a valid child-mode session
  - signed a JWT for that child session
  - verified `POST /stories` returned `403 PARENT_SESSION_REQUIRED`
  - verified `POST /stories/:id/audio` returned `403 PARENT_SESSION_REQUIRED`
  - deleted the temporary account
  - verified no `codex-child-story-guard-*` users remained
