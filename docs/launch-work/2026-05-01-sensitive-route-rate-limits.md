# Sensitive route rate limits

Date: 2026-05-01

## What changed

- Added `storyWriteLimiter` for non-read `/api/v1/stories` requests.
- Added `uploadLimiter` for `/api/v1/upload`.
- Added `billingLimiter` for `/api/v1/billing`.
- Kept public rating limiter already present on public and unlisted rating endpoints.
- Kept development bypasses so local smoke tests and dev server polling are not blocked.

## Limits

- Story write requests: 60 per IP per 15 minutes, excluding `GET`, `HEAD`, and `OPTIONS`.
- Upload requests: 40 per IP per 15 minutes.
- Billing requests: 30 per IP per 15 minutes.

## Verification

- `pnpm --filter wondertales-api build`
- Smoke: `/health` still returns 200 through nginx.
- Smoke: unauthenticated `/api/v1/stories` still returns 401 through nginx, confirming route mount remains reachable.
