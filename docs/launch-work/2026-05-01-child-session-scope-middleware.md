# Child session scope middleware

Date: 2026-05-01

## What changed

- Added `requireChildSession` middleware for child-only endpoints.
- Added `requireSessionScope(scope)` middleware for explicit session scope checks.
- Extended auth middleware tests to cover:
  - parent sessions blocked by child-only routes
  - child sessions without child profile context blocked
  - scoped session authorization failures
  - scoped session authorization success
- Added the auth middleware test to `launch:gate`.

## Safety notes

- This does not expose a child-safe generation endpoint yet.
- Future child endpoints should use `requireAuth`, `requireChildSession`, and `requireSessionScope(...)` before doing expensive or data-changing work.

## Verification

- `pnpm exec tsx src/middleware/__tests__/authMiddlewareParentSession.test.ts`
- `pnpm build` in `services/api`
