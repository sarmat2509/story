# Google OAuth E2E And Log Redaction

## Context

Production Google OAuth was exercised with a real Google account on `wondertales.art`.
The callback returned to the application, the user session was established, and the
authenticated app route plus `/api/v1/me` checks succeeded.

During log review, the API showed successful OAuth and welcome-email events, but
the Google callback log included the full app callback URL. That URL carries the
short-lived auth token as a query parameter, so the log context had to be redacted
before continuing launch work.

## Changes

- Replaced token-bearing Google OAuth callback log fields with a safe structured
  context: provider, callback path, `isNewUser`, and `parentGate`.
- Removed production debug `console.log` calls from the web OAuth callback screen.
- The web OAuth callback now clears the token from the address bar immediately
  after reading it.
- The web OAuth callback now uses the shared `resetToMainRoute` helper, matching
  the email login/register success path.
- Added a launch-gate regression test that blocks token-bearing OAuth callback
  URLs and production OAuth debug logs from returning.

## Verification

- Production API logs showed the real Google OAuth callback created a session and
  sent the welcome email without a backend callback error.
- DevTools console for the authenticated production app page did not preserve the
  first-login error; only known web/runtime warnings were present.
- `pnpm --filter wondertales-api exec tsx src/routes/__tests__/oauthCallbackSafety.test.ts`
  passed.
- `pnpm --filter wondertales-api build`, `pnpm --filter wondertales-universal-app type-check`,
  `pnpm --filter wondertales-universal-app build:web`, and `./scripts/launch-gate.sh`
  passed.
- Deployed API and web with `./scripts/deploy.sh --api --web`; all migrations were
  already applied.
- `./scripts/check-production-auth.sh` passed with `0` failures and `0` warnings.
- Fresh post-deploy API logs only showed Google OAuth strategy startup and
  Google/Gemini API-key selection notices; no OAuth callback, email, or backend
  error was present.
- Fresh post-deploy nginx/web logs only showed the expected smoke-test `400` for
  an intentionally invalid reset token.
- DevTools verified `/api/v1/me` from an authenticated production app page returns
  `200` with no sensitive user fields.

## Follow-Up

- If the first-login alert appears again after redeploy, capture the browser
  console immediately from the OAuth callback tab; server logs did not show a
  corresponding backend failure.
