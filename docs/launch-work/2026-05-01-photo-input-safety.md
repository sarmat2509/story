# Photo Input Safety

## Scope

- Added a shared guard for user-provided photo URLs before photo analysis, child profile creation, character creation, instant photo story queueing, and instant photo job processing.
- Restricted those flows to uploaded WonderTales asset URLs owned by the authenticated user.
- Restricted allowed `photoType` by flow:
  - child analysis/profile creation: `child`;
  - character analysis/creation: `character`;
  - instant photo stories: `character` or `child`.
- Made instant photo story creation parent-session-only and require child-data consent.
- Fixed instant photo schema so `.max(5)` applies to the photo array instead of each URL string.

## Behavior

- External URLs are rejected with `PHOTO_URL_NOT_ALLOWED`.
- URLs for another user's uploads are rejected with `PHOTO_OWNER_MISMATCH`.
- Disallowed upload buckets such as `feedback` are rejected with `PHOTO_TYPE_NOT_ALLOWED`.
- Invalid asset paths are rejected before any analysis, queueing, or provider call.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/photoInputSafetyService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/assetAccessService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/promptSafetyService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyQuotaReservation.test.ts`
- `pnpm --filter wondertales-api build`
- Live smoke through `http://localhost:8081/api/v1`: a temporary parent account posting `/stories/instant` with an external photo URL received `400 PHOTO_URL_NOT_ALLOWED` and was then deleted.
