# Admin Health Endpoint Guards

Date: 2026-05-01

## Scope

- Kept the basic `/health` endpoint public for infrastructure probes.
- Protected detailed operational health endpoints with `requireAuth` and `requireAdmin`:
  - `/health/detailed`
  - `/health/queues`
  - `/health/image-rate-limiter`
- Added a focused admin guard middleware test.

## Behavior

- Anonymous requests to detailed health endpoints receive `401`.
- Authenticated non-admin users receive `403`.
- Basic `/health` still returns the simple public health payload.

## Verification

- `pnpm --filter wondertales-api exec tsx src/middleware/__tests__/authMiddlewareAdmin.test.ts`
- `pnpm --filter wondertales-api exec tsx src/middleware/__tests__/authMiddlewareParentSession.test.ts`
- `pnpm --filter wondertales-api build`
- Live smoke through `http://localhost:8081`:
  - `/health` returned `200`
  - `/health/detailed` without auth returned `401`
  - `/health/detailed` with a temporary non-admin parent account returned `403`
  - deleted the temporary account
  - verified no `codex-health-guard-*` users remained
