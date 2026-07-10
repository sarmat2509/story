# Premium Voice Access Gate

## Scope

- Added an API/service-level access check for explicit `voiceId` audio generation requests.
- The voice picker already marked premium voices as locked; this change prevents direct API calls from bypassing that lock.
- Applied the guard in `/api/v1/stories/:id/audio` before queueing and in the audio job processor.

## Behavior

- Missing explicit voices return `VOICE_NOT_FOUND`.
- Inactive voices return `VOICE_INACTIVE`.
- Premium voices require the `premium_voices` feature and otherwise return `PREMIUM_VOICE_REQUIRED`.
- Automatic voice selection still works without an explicit `voiceId`.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/voiceAccessService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyQuotaReservation.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/aiUsageProsodyCost.test.ts`
- `pnpm --filter wondertales-api build`

## Test Runner Note

- `src/services/__tests__/audioRateLimiter.test.ts` is not a standalone `tsx` test; it uses `describe`/runner globals and currently fails before executing assertions when invoked directly with `tsx`.
