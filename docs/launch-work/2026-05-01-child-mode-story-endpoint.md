# Child Mode story endpoint

Date: 2026-05-01

## What changed

- Added `POST /api/v1/stories/child-mode`.
- The route requires:
  - `requireAuth`
  - `requireChildSession`
  - `requireSessionScope('child_mode')`
- The route forces `childProfileId` from the child session and creates queued story requests with:
  - `createdByMode = child`
  - `createdByChildProfileId`
  - `parentReviewRequired` from child-mode controls
- Added `childModePolicyService` to enforce:
  - child mode enabled for the profile
  - request profile matches the child session
  - free-text prompts disabled/enabled
  - allowed themes
  - allowed languages
  - allowed characters
  - sibling inclusion
  - daily/monthly child-mode generation caps
- Child-mode prompt safety logs use dedicated child-mode sources.

## Safety notes

- This endpoint is backend-ready but not exposed from the UI yet.
- Parent return gate and review-management UI remain required before making Child Mode user-facing.
- Queue-enqueue failures still release quota reservations through the existing compensation path.

## Verification

- `pnpm exec tsx src/services/__tests__/childModePolicyService.test.ts`
- `pnpm build` in `services/api`
- Dev API smoke: unauthenticated `POST /api/v1/stories/child-mode` returns `401`
