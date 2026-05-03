# Quota and Access Hardening

Date: 2026-05-03

## Summary

- Closed the remaining direct API quota bypass pass before expensive generation work is queued.
- Added targeted tests for image-per-story and child-profile limit behavior.
- Updated `LAUNCH_ROADMAP.md` with the new P0 quota status.

## Enforcement Changes

- Legacy `POST /api/v1/stories/:id/tts` now follows the queued audio generation path:
  - validates audio generation input;
  - enforces premium voice access;
  - reserves `audio_synthesized` quota before queueing;
  - releases the reservation if the queue enqueue fails.
- Scene image regeneration now checks `images_per_story` before queueing and again inside the worker-side regeneration path.
- Image generation access now allows replacing an existing in-plan image, but prevents adding out-of-plan scene images through direct API or queue paths.
- Child profile creation now checks the plan's child-profile limit inside the creation transaction with a per-user advisory lock.
- Quota/paywall API codes now map to localized app messages for story, audio, image, child-profile, premium voice, and story-from-drawing limit failures.

## Reservation Behavior

- Story and audio quota are reserved when the API accepts work for queueing.
- Reservations are stored as append-only `usage_events`.
- Queue enqueue failures release reservations immediately with compensating negative usage events.
- Permanent pre-artifact generation failures release reservations only after retries are exhausted.
- Successful usable story/audio artifacts keep the reservation as final usage.
- No destructive quota mutation is used.

## Verification

- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/imageStoryLimitService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/childProfileLimitService.test.ts`
- Previously run targeted quota tests remain relevant for this batch:
  - `storyQuotaReservation.test.ts`
  - `audioQuotaReservationService.test.ts`
  - `bundlePeriodOverlap.test.ts`
  - `voiceAccessService.test.ts`
  - `storyFromDrawingAccessService.test.ts`
  - `assetAccessService.test.ts`
  - `subscriptionUsageView.test.ts`

## Production Deploy

- Deployed with `./scripts/deploy.sh --api --web`.
- API image build, upload, restart, nginx config validation, and webapp upload/recreate completed successfully.
- Post-deploy migration runner reported: `All migrations already applied`.
- `curl -fsS https://wondertales.art/health` returned healthy with database connected.
- `./scripts/check-production-smoke.sh` passed with `0` failures and `2` expected warnings because authenticated/admin smoke credentials were not exported in this shell.
- Fresh docker log scan for `api`, `webapp`, and `nginx` found no `error`, `warn`, `exception`, `failed`, `panic`, `fatal`, or `traceback` lines in the post-deploy window.
- Chrome DevTools MCP opened `https://wondertales.art/welcome`; the page rendered and the browser console had no runtime errors.

## Migration Notes

- No database migration was needed.
- No destructive operations were performed.
