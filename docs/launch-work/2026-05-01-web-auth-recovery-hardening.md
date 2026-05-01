# Web Auth Recovery Hardening

Date: 2026-05-01

## What changed

- Hid Apple sign-in on web while the web Apple OAuth service id is still a placeholder.
- Added backend guards so Apple OAuth routes return `APPLE_OAUTH_NOT_CONFIGURED` instead of redirecting to Apple with a placeholder client id.
- Applied the stricter OAuth limiter to Google and Apple OAuth start/callback/token routes.
- Added a dedicated password reset limiter because forgot-password intentionally returns `200` even when an email is unknown.
- Restored dev nginx passthrough for Metro's `/apps/.../index.bundle` route after the route-indexing catch-all was tightened.

## Verification

- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-universal-app build:web`
- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -t`
- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -s reload`
- `curl http://localhost:8081/api/v1/auth/apple/start` returns `404` with `APPLE_OAUTH_NOT_CONFIGURED`.
- `curl -I http://localhost:8081/api/v1/auth/google/start` still returns `302` to Google OAuth.
- `POST /api/v1/auth/forgot-password` returns the privacy-preserving `200`.
- `curl -I` for the Metro dev bundle under `/apps/universal-app/index.bundle...` returns `200`.
- In-app browser smoke on `/welcome` shows Google sign-in, hides Apple sign-in, and has zero console errors.

## Follow-up

- Configure real Apple web OAuth before showing Apple sign-in on web.
- Verify production password reset email delivery with real `RESEND_API_KEY` and `FROM_EMAIL`.
