# P0 Story Quota Reservation

Date: 2026-05-01

## Roadmap Item

- `LAUNCH_ROADMAP.md` -> P0 "Server-Side Quota Enforcement"

## Changes

- Added transactional monthly story quota reservation for story request creation.
- Applied the quota gate to:
  - standard wizard story creation;
  - instant/photo story creation;
  - manual story continuations;
  - scheduled story continuations.
- Added a per-user PostgreSQL advisory transaction lock around quota calculation, request creation, and usage event insertion to prevent concurrent direct API calls from overspending the story quota.
- Story quota is now consumed when the API accepts a request for queueing. This intentionally counts pending work; failed-job refund behavior still needs a later explicit support/admin flow.
- Removed duplicate `story_created` usage event writes from story record enrichment so accepted requests are counted once.
- Story quota reservation uses half-open bundle grant matching: `grant_start < period_end` and `grant_end > period_start`.
- Switched usage event billing windows to half-open intervals to avoid counting events exactly at the next period boundary.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyQuotaReservation.test.ts` -> passed.
- `pnpm --filter wondertales-api build` -> passed.

## Notes

- No database migration was needed.
- This commit covers story request quota reservation. The broader bundle-period repository cleanup is still mixed with pre-existing uncommitted bundle work and should be committed separately once that work is ready. Other launch quota gates still remain, including child profile count, image limits per story, premium voice access, story-from-drawing access, and a user-facing refund/release path for failed queued story jobs.
