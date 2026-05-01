# Story From Drawing Access Gate

Date: 2026-05-01

## Scope

- Added a server-side `story_from_drawing` feature gate for photo/drawing-based flows.
- Covered instant photo story creation before queueing expensive work.
- Covered child and character photo analysis before Gemini Vision calls.
- Covered child and character creation with reference photos before turnaround generation.
- Added a job-level fallback for queued instant photo setup.
- Mapped `PlanFeatures.allowReferencePhotos` to the existing `story_from_drawing` feature when the legacy `allow_reference_photos` slug is absent.

## Behavior

- Photo-free child/character creation can still proceed without `story_from_drawing`.
- Photo/drawing-based actions return:
  - HTTP `403`
  - `code: STORY_FROM_DRAWING_REQUIRED`
  - `featureSlug: story_from_drawing`
- The implementation uses a small pure evaluator so plan-gate behavior is covered without database setup.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyFromDrawingAccessService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/photoInputSafetyService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyQuotaReservation.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/bundlePeriodOverlap.test.ts`
- `pnpm --filter wondertales-api build`
- Live smoke through `http://localhost:8081/api/v1`:
  - registered a temporary parent account
  - called `POST /stories/instant` with an owned asset-style child photo URL and child data consent
  - received `403 STORY_FROM_DRAWING_REQUIRED`
  - deleted the temporary account
