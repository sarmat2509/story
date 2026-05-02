# Production Auth and Recovery Checks

## What changed

- Added `scripts/check-production-auth.sh` for repeatable production OAuth/password-reset smoke checks.
- Tightened production config validation so API startup requires `GOOGLE_CALLBACK_URL`, `WEB_APP_URL`, `RESEND_API_KEY`, and `FROM_EMAIL`.
- Updated deployment docs and `LAUNCH_ROADMAP.md` with the verified and remaining auth/recovery launch status.

## Verified on 2026-05-02

- Production API container has Google OAuth client/secret/callback and Resend/from-email configured.
- `GET https://wondertales.art/api/v1/auth/google/start` returns `302` to Google with `redirect_uri=https://wondertales.art/api/v1/auth/google/callback`.
- DevTools web UI check from `https://wondertales.art/welcome` reaches the Google sign-in screen for `wondertales.art`; no redirect mismatch appeared.
- `POST /api/v1/auth/forgot-password` returns the privacy-preserving success response for an unknown smoke-test email.
- `POST /api/v1/auth/reset-password` rejects an invalid token with `INVALID_OR_EXPIRED_TOKEN`.
- A production account registered with a Gmail address received a real password-reset email in Gmail, and the reset link opened the production reset screen.
- Cross-origin smoke from `https://evil.example` did not receive an `access-control-allow-origin` reflection.
- Recent API docker logs were checked after the smoke tests.

## Remaining launch blockers

- Complete a real Google OAuth login in production and verify callback/session persistence after Google returns to the app.
