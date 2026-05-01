# Plan-aware bundle cache

Date: 2026-05-01

## What changed

- Made the authenticated bundle catalog cache include the current plan slug.
- Disabled the authenticated plans query on public/unauthenticated billing-plan views to avoid unnecessary 401 requests.
- Invalidated bundle catalog data after:
  - bundle checkout session creation;
  - subscription checkout session creation;
  - customer portal session creation;
  - stub plan upgrade;
  - billing success redirect.
- Reconciled the roadmap with the current app-only `/billing/plans` route and `/pricing` SSR split.

## Why

- Bundle prices are plan-specific.
- A shared `['bundles']` cache could show stale bundle prices after a plan change until a full reload or manual invalidation.
- Public viewing of the billing/plans screen should use public plan data without producing auth-only 401 noise.

## Verification

- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-universal-app build:web`
- `pnpm --filter wondertales-api build`
- DevTools live smoke:
  - `http://localhost:8081/billing/plans` renders the app billing/plans screen.
  - `http://localhost:8081/pricing` renders the SSR pricing page.
  - After the auth-query guard, unauthenticated `/billing/plans` reload had no console warnings/errors.
- Docker logs checked after the live smoke; API logs showed normal DB connection debug noise, while nginx still has the known dev IPv6 upstream fallback noise.
