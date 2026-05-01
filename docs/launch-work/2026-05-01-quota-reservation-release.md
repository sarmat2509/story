# Quota Reservation Release - 2026-05-01

## Scope

Implemented the P0 follow-up for story/audio quota reservations that were previously consumed when work was accepted into a queue.

## Changed

- Added append-only reservation release helpers for story and audio quota.
- Story quota release now writes a compensating `usage_events` row with `quantity: -1` for active story reservations when queue enqueue fails or text/instant setup permanently fails before a usable story is created.
- Audio quota release now writes a compensating `usage_events` row with `quantity: -1` for active audio reservations when audio queue enqueue fails or audio generation permanently fails.
- `ConcurrentJobQueue` now supports `onPermanentFailure` hooks, called only after configured retries are exhausted.
- Story, instant-story, continuation, scheduled-continuation, and audio enqueue paths now release reservations if queueing fails after reservation.

## Safety Notes

- No destructive database operation or migration was needed.
- Existing usage history is preserved; release is represented as an audit-friendly negative adjustment.
- Release is idempotent: when no active net reservation remains, no new release row is inserted.
- Story quota release skips requests that already produced a non-stub story.

## Verification

- `pnpm exec tsx src/services/__tests__/storyQuotaReservation.test.ts`
- `pnpm exec tsx src/services/__tests__/audioQuotaReservationService.test.ts`
- `pnpm build` in `services/api`
