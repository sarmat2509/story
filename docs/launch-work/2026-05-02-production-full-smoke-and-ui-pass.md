# Production Full Smoke and UI Pass

Date: 2026-05-02

## What changed

- Added `scripts/check-production-smoke.sh` for repeatable production checks across SSR pages, app-only noindex routes, public APIs, authenticated APIs, admin read-only APIs, CORS, and optional Stripe checkout creation.
- Hardened auth/user responses so login, register, parent-gate, OAuth-token auth, and `/api/v1/me` omit `passwordHash` and `stripeCustomerId`.
- Fixed email/password login and registration navigation so successful web auth resets to `/dashboard` instead of leaving the user on `/welcome`.
- Fixed Stripe bundle checkout when no static bundle Price ID exists by creating Checkout line items with inline `price_data` from the bundle catalog.
- Localized visible Ukrainian fallbacks found during DevTools checks on photo upload, library empty/loading/error states, library view-toggle accessibility, billing portal wording, and profile pseudonym copy.
- Removed production-visible debug logs from app startup, library, and audio-filter controls.

## Production verification

- `./scripts/check-production-smoke.sh` with authenticated QA user/admin checks and Stripe checkout creation passed with `0` failures and `0` warnings after deploy.
- DevTools clean-context login verified `/welcome` email login redirects to `https://wondertales.art/dashboard`.
- DevTools verified authenticated screens:
  - `/dashboard`
  - `/wizard`
  - `/me/stories`
  - `/profile`
  - `/settings/language`
  - `/settings/theme`
  - `/billing/plans`
  - `/children` and `/characters` with an artisan/admin QA account
  - `/admin/dashboard`
- DevTools verified Ukrainian copy fixes on `/wizard`, `/me/stories`, and `/billing/plans`.
- Hosted Stripe checkout pages loaded in sandbox mode for subscription and bundle sessions; no card payment was completed.
- API docker log tail after smoke showed expected Stripe checkout creation events and no matching error/warn entries.

## Remaining

- Complete a real production Google OAuth callback with a human-owned test account.
- Verify real password-reset inbox delivery after SPF, DMARC, and Resend DKIM records are configured.
- Complete Stripe success/cancel return checks, webhook event checks, customer portal, failed payment, and refund/support runbook verification.
- Continue broader UI localization cleanup for non-launch app locales if they remain visible in the language selector.
