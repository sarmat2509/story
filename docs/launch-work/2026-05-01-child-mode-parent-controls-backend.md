# Child Mode parent controls backend

Date: 2026-05-01

## What changed

- Added `child_mode_enabled` and `child_mode_settings` to `child_profiles`.
- Added shared validation/types for Child Mode controls:
  - daily/monthly generation limits
  - allowed themes, languages, and characters
  - free-text prompts
  - audio generation
  - parent review requirement
  - sibling characters
  - shared family story viewing
- Added parent-only API endpoints:
  - `GET /api/v1/children/:id/child-mode`
  - `PATCH /api/v1/children/:id/child-mode`
  - `POST /api/v1/children/:id/child-mode/sessions`
  - `DELETE /api/v1/children/:id/child-mode/sessions`
- Added active child-session counts to `/api/v1/children`.
- Added frontend API hooks for reading/updating controls, entering Child Mode, and revoking child sessions.

## Safety notes

- Child Mode remains fail-closed for story writes until a scoped child-safe generation endpoint is implemented.
- Controls are stored and exposed now, but generation enforcement is a follow-up task.
- Returning from Child Mode to Parent Mode still needs a parent gate UI/API.

## Migration

- Applied `services/api/drizzle/0087_child_mode_controls.sql` in the dev API container.
- Migration is additive only and avoids `DROP`/`TRUNCATE`.

## Verification

- `pnpm --filter @wondertales/shared build`
- `pnpm exec tsx src/services/__tests__/childModeControlsService.test.ts`
- `pnpm build` in `services/api`
- `pnpm type-check` in `apps/universal-app`
- Dev API smoke:
  - unauthenticated `GET /api/v1/children/:id/child-mode` returns `401`
  - unauthenticated `POST /api/v1/children/:id/child-mode/sessions` returns `401`
