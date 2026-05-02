# Production Smoke Series Entitlement

Date: 2026-05-02

## Summary

- Updated the production smoke script so `/api/v1/me/series` handles mutable QA account state correctly.
- The smoke still passes when a free QA user receives the expected `SERIES_ACCESS_REQUIRED` response.
- It also passes when the same QA account has paid-series access and receives a successful `{ series: [] }` list.

## Why

- Production QA accounts can move between free, paid, canceled, and checkout-tested states during launch verification.
- The previous smoke treated a safe entitled response as a failure, even though the endpoint and authorization were behaving correctly.

## Validation

- `./scripts/check-production-smoke.sh` was run against production with authenticated user/admin checks and Stripe checkout-session creation.
- The run covered public SSR pages, localized SEO metadata, public story/author APIs, app-only noindex routes, authenticated APIs, admin read-only APIs, CORS, and Stripe subscription/bundle checkout session creation.
- The only failure was the stale series-entitlement expectation fixed here.
- After the fix, the same production smoke passed with `0` failures and `0` warnings.
- Remote docker log tail showed expected OAuth strategy initialization and Stripe checkout-session creation logs with no error/warn lines.

## Migration Notes

- No database migration was needed.
- No production data was modified by this script change.
