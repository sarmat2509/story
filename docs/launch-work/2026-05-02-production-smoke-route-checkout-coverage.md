# Production Smoke Route and Checkout Coverage

## Summary

- Expanded `scripts/check-production-smoke.sh` so the repeatable production smoke checks direct SSR pages, direct SPA screen shells, localized app-only route prefixes, admin screen shells, billing success, Child Mode, unsupported public locale routes, and unknown public 404/noindex behavior.
- Added `PROD_SMOKE_TOKEN` and `PROD_ADMIN_SMOKE_TOKEN` support so authenticated smoke checks can run with short-lived bearer tokens without putting QA passwords into shell history.
- Added hosted Stripe checkout page loading after test-mode subscription and bundle checkout session creation when `PROD_SMOKE_CHECKOUT=1`.
- Completed a live production Stripe sandbox bundle payment through hosted Checkout and verified the returned app usage totals include the bundle grant.

## Files Changed

- `scripts/check-production-smoke.sh`
- `LAUNCH_ROADMAP.md`

## Verification

- `bash -n scripts/check-production-smoke.sh`
- `CHECK_PROD_REMOTE=0 ./scripts/check-production-smoke.sh`
  - Result: `0 failure(s)`, with only expected warnings for skipped credential-backed authenticated/admin checks.
  - Coverage included public SSR landing/pricing/stories/legal/support pages, localized SEO metadata, public story and author APIs, share-card JPEG, app-only direct screen shells, localized app-only route prefixes, unsupported `/ru/pricing` 404/noindex, unknown public 404/noindex, CORS guard, and unauthenticated private API guard.
- Production DevTools authenticated API sweep:
  - User endpoints returned expected success responses for account, library, story languages, usage, sessions, OAuth providers, privacy requests, children, characters, plans, entitlements, bundles, and voices.
  - Series endpoint returned the expected `SERIES_ACCESS_REQUIRED` entitlement gate for this account.
  - Admin endpoints returned `200` for detailed health, queue health, image rate limiter, dashboard, stories, users, feedback, privacy requests, voices, image validations, plans config, and story goals config.
- Production DevTools Stripe checkout smoke:
  - Created test-mode subscription and bundle checkout sessions; both returned `cs_test_` session ids and `checkout.stripe.com` hosted URLs.
  - Opened hosted Stripe Checkout for the bundle flow and verified the sandbox payment page rendered the expected bundle line item.
  - Completed a sandbox card payment for the bundle flow and returned to `/billing/success?kind=bundle&session_id=...`.
  - Verified `/api/v1/me/subscription-usage` showed `bundle_bonus: 5` stories and `bundle_bonus: 2` audio stories after webhook processing.
- Production docker logs for `api`, `nginx`, and `webapp` over the verification window:
  - `POST /api/v1/billing/bundle-checkout` returned `200`.
  - Stripe posted `checkout.session.completed` to `/api/v1/billing/webhook/stripe` with `200`.
  - API logged `Recorded user_bundle_grant from Stripe bundle checkout` with `extraStories: 5` and `extraAudio: 2`.
  - No API errors or exceptions were present. The only warnings were known nginx temporary-buffer warnings for static/share-card responses.

## Migration Notes

- No database migration was required.
- No destructive operation was used.
