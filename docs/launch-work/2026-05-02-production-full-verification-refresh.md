# Production Full Verification Refresh

Date: 2026-05-02

## Summary

- Re-ran the broad production smoke after the latest web deploy.
- Verified production SSR, localized SEO metadata, app-only noindex pages, public APIs, authenticated APIs, admin read-only APIs, CORS, and Stripe test checkout creation.
- Completed a real Stripe sandbox bundle payment from hosted Checkout and verified the success return path, bundle credit usage response, and webhook logs.
- Swept the main authenticated and admin web screens in production with Chrome DevTools MCP.

## Production Smoke

- `PROD_SMOKE_CHECKOUT=1 ./scripts/check-production-smoke.sh` passed with `0 failure(s), 0 warning(s)`.
- Coverage included:
  - `/`, `/en`, `/pricing`, `/en/pricing`, `/stories`, `/en/stories`, `/terms`, `/en/terms`, `/privacy`, `/en/privacy`, `/support`.
  - app-only noindex routes such as `/welcome`, `/register`, `/auth/*`, and `/billing/plans`.
  - public stories, story detail, author detail, sitemap, share-card, and missing unlisted routes.
  - authenticated `/api/v1/me`, library, usage, sessions, privacy requests, children, characters, plans, entitlements, bundles, and voices endpoints.
  - admin dashboard, stories, users, feedback, privacy requests, voices, image validations, and content-config endpoints.
  - Stripe subscription and bundle Checkout Session creation in test mode.

## Stripe Test Payment

- Opened the generated bundle Checkout Session in hosted Stripe Checkout.
- Verified sandbox UI, bundle line item, QA email, card form, and return URL.
- Completed payment with Stripe test card data.
- Stripe returned to `/billing/success?kind=bundle&session_id=...`.
- Success UI rendered bundle-specific copy: the package was added for the current billing period.
- Authenticated usage API reported active bundle credits after webhook processing:
  - `stories.bundle_bonus: 10`
  - `audio.bundle_bonus: 4`
- Production API logs showed:
  - `Created Stripe bundle Checkout Session`
  - `Processing Stripe webhook` for `checkout.session.completed`
  - `Recorded user_bundle_grant from Stripe bundle checkout`

## DevTools Screen Sweep

- Verified these production screens render expected content:
  - `/dashboard`
  - `/wizard`
  - `/me/stories`
  - `/me/series`
  - `/children`
  - `/characters`
  - `/billing/plans`
  - `/profile`
  - `/settings/language`
  - `/settings/theme`
  - `/stories`
  - `/admin/dashboard`
  - `/admin/stories`
  - `/admin/users`
  - `/admin/feedback`
  - `/admin/privacy-requests`
  - `/admin/validations`
  - `/admin/content-config`
  - `/admin/voices`

## Logs And Console

- Production billing/docker log check showed the expected Stripe checkout and webhook sequence.
- No production API error/warn/failed/exception lines were found in the checked billing flow.
- Nginx emitted expected temporary-buffer warnings for large static assets and share-card/image responses.
- Browser console had no runtime errors during the screen sweep.
- Remaining console noise:
  - `expo-notifications` web listener support warning.
  - `expo-av` SDK deprecation warning.
  - a browser issue about form fields missing `id`/`name` attributes.

## Migration Notes

- No database migration was needed.
- No destructive operations were performed.
