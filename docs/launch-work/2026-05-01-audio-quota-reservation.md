# Audio Quota Reservation

Date: 2026-05-01

## Scope

- Added transactional audio story quota reservation before audio jobs are queued.
- Used a per-user PostgreSQL advisory transaction lock to prevent concurrent direct API requests from overspending `audio_stories_per_month`.
- Counted bundle `extraAudio` grants with the same half-open billing-period overlap used by story quota.
- Reused existing `audio_synthesized` usage accounting so entitlement and subscription usage views reflect accepted audio work immediately.
- Allowed retrying the same already-reserved story without consuming another audio credit.

## Behavior

- `POST /api/v1/stories/:id/audio` now checks voice access, active job pressure, then reserves an audio story credit immediately before queueing.
- If the user's current plan has no audio access, the API returns `403 AUDIO_NOT_AVAILABLE`.
- If the monthly audio limit is exhausted, the API returns `429 AUDIO_LIMIT_EXCEEDED` with `featureSlug`, `limit`, `used`, `remaining`, and `resetsAt`.
- Reservation metadata includes `quotaReservation: true` and `reservationBehavior: consumed_on_queue_acceptance`.
- Successful audio generation still records legacy subscription audio minutes, but skips creating a second `audio_synthesized` entitlement event when the reservation already exists.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/audioQuotaReservationService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyQuotaReservation.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/bundlePeriodOverlap.test.ts`
- `pnpm --filter wondertales-api build`
- Live smoke through `http://localhost:8081/api/v1` and dev Postgres:
  - registered a temporary parent account
  - inserted a minimal private story owned by that user
  - inserted one current-period `audio_synthesized` usage event
  - called `POST /stories/:id/audio`
  - received `429 AUDIO_LIMIT_EXCEEDED`
  - deleted the temporary account
  - verified no `codex-audio-quota-*` users remained
