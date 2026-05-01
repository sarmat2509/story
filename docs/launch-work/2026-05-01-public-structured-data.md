# Public Structured Data

Date: 2026-05-01

## Scope

- Added SoftwareApplication JSON-LD to public landing SSR.
- Added FAQPage JSON-LD to public landing SSR using the rendered localized FAQ copy.
- Added Product/OfferCatalog JSON-LD to public pricing SSR using the rendered plan list and monthly price data.
- Localized English landing pricing CTAs and FAQ pricing links to `/en/pricing`.
- Added explicit nginx routing for nested `/landing/*` image assets after DevTools showed the SSR landing page images falling through to unknown-route 404s.
- Added launch-gate coverage for landing structured data.

## Files changed

- `services/api/src/ssr/publicStructuredData.ts`
- `services/api/src/ssr/renderLandingHtml.ts`
- `services/api/src/ssr/renderPricingHtml.ts`
- `services/api/src/ssr/__tests__/renderLandingStructuredData.test.ts`
- `services/api/src/ssr/__tests__/pricingPresentation.test.ts`
- `services/api/src/ssr/__tests__/routeOwnership.test.ts`
- `nginx/conf.d.dev/wondertales.conf`
- `nginx/conf.d/kazka.conf`
- `scripts/launch-gate.sh`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderLandingStructuredData.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/pricingPresentation.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/routeOwnership.test.ts`
- `pnpm --filter wondertales-api build`
- `docker exec wondertales-nginx-dev nginx -t`
- `pnpm launch:gate`
- `docker exec wondertales-nginx-dev nginx -s reload`
- DevTools live check:
  - `/en/` exposes SoftwareApplication and FAQPage JSON-LD.
  - `/en/` pricing links point to `/en/pricing`.
  - `/landing/draw-to-hero.png`, `/landing/listen-again.png`, `/landing/safe-by-age.png`, and `/landing/create-in-minutes.png` return 200 after nginx reload.
  - `/en/pricing` exposes Product JSON-LD with an OfferCatalog.
  - Browser console is clean for `/en/` and `/en/pricing`.
- Docker log review:
  - `wondertales-api-dev`: expected restart from shared dist changes during gate, normal startup and DB pool logs, no new errors.
  - `wondertales-nginx-dev`: expected reload notices, localized SSR rewrites, and landing asset 200 responses after reload.
  - `wondertales-postgres-dev` and `wondertales-redis-dev`: no new messages in the checked window.
