# Image Validation Admin Route Guard

Date: 2026-05-01

## Scope

- Converted standalone `GET /api/v1/image-validations` into an admin-only moderation/debug endpoint.
- Removed user-owner access for raw image validation internals.
- Kept the existing admin UI path `/api/v1/admin/image-validations` unchanged.

## Behavior

- Anonymous requests receive `401`.
- Authenticated non-admin users receive `403`.
- Admin users can still list all validation rows or filter by `storyId`.

## Verification

- `pnpm --filter wondertales-api exec tsx src/middleware/__tests__/authMiddlewareAdmin.test.ts`
- `pnpm --filter wondertales-api build`
- Live smoke through `http://localhost:8081/api/v1`:
  - `/image-validations` without auth returned `401`
  - `/image-validations` with a temporary non-admin parent account returned `403`
  - deleted the temporary account
  - verified no `codex-image-validations-*` users remained
