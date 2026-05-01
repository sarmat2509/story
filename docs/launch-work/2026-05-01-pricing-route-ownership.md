# Pricing Route Ownership

Date: 2026-05-01

## Roadmap Item

- `LAUNCH_ROADMAP.md` -> P1 "Public SEO Routing and Pricing Ownership"
- `LAUNCH_ROADMAP.md` -> P1 "Pricing and Billing UX"

## Changes

- Moved the authenticated app `Plans` route from `/pricing` to `/billing/plans`.
- Updated Stripe subscription and bundle checkout cancel URLs to return to `/billing/plans`.
- Added `X-Robots-Tag: noindex,nofollow` for `/billing/*` in dev and production nginx configs.

## Verification

- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-api build`
- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -t`

## Notes

- Public `/pricing` remains owned by API SSR.
- This is a focused route conflict fix. Broader route ownership manifest, app-only noindex coverage for every authenticated prefix, and unknown public 404 behavior still remain.
