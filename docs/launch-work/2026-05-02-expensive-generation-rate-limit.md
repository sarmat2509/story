# Expensive Generation Rate Limit

Date: 2026-05-02

## Summary

- Added an authenticated, per-owner hourly limiter for provider-costly story routes.
- Covered story creation, Child Mode creation, instant photo stories, image retries, continuations, audio generation, forced alignment, scene regeneration, and the legacy TTS route.
- Child sessions are keyed by the parent owner id so child-mode activity cannot bypass the same paid-account throttle.
- Kept the existing broad IP write limiter in place as an outer guard before route-specific auth.

## Validation

- `pnpm exec tsx src/middleware/__tests__/rateLimiter.test.ts`
- `pnpm build`
- `pnpm launch:gate`
- `./scripts/deploy.sh --api`
- Production `https://wondertales.art/health` returned healthy with database connected.
- Production SSR smoke for `/pricing` and `/stories` returned `200` with security headers.
- Production `/api/v1/plans` returned the active launch plan catalog with real payments enabled.
- Production docker logs after deploy showed no API errors; nginx logged one benign proxy-buffering warning while reading the large public stories catalog response.

## Configuration

- `EXPENSIVE_GENERATION_RATE_LIMIT_MAX` controls the hourly per-owner cap.
- The default is `20` costly generation requests per hour.
- The limiter is skipped in local development, matching the existing API rate-limit behavior.

## Migration Notes

- No database migration was needed.
- No destructive operations were performed.

## Follow-Up

- Add alerting/notification workflows when a user repeatedly hits cost-control thresholds or expensive-generation throttles.
