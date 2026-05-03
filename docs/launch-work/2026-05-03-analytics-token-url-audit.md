# Analytics token URL audit expansion

Date: 2026-05-03

## What changed

- Expanded analytics scrubbing and static payload audit coverage for checkout and portal URL style fields.
- Added `checkout_url` and `portal_url` to the PostHog web denylist/personal-data configuration.
- Extended the focused analytics privacy test with checkout and portal URL properties.

## Why

Stripe Checkout and Customer Portal URLs can contain session-bearing tokens. The roadmap requires analytics payload audits to keep expanding as event conventions grow; this catches both explicit session ids and URL-shaped billing session properties.

## Verification

- `pnpm exec tsx src/services/analytics/__tests__/privacy.test.ts`
- `node scripts/check-analytics-payloads.js`

## Notes

- Aggregate fields such as `plan_slug`, `mode`, and `preferred_locale` remain allowed.
