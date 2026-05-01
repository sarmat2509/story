# Route ownership manifest

Date: 2026-05-01

## What changed

- Added `packages/shared/src/utils/routeOwnership.ts` as the shared route ownership manifest for launch SEO locales, public SSR route contracts, app-only route paths, and noindex app prefixes.
- Moved sitemap static SEO routes for `/`, `/pricing`, `/en/`, and `/en/pricing` onto the shared manifest.
- Moved the app linking path for the authenticated plans screen to `APP_ROUTE_PATHS.billingPlans`, keeping it on `/billing/plans` instead of `/pricing`.
- Made public landing/pricing SSR locale ownership path-based: `/` and `/pricing` render the default `uk` route, while `/en/` and `/en/pricing` render `en`; `Accept-Language` no longer changes canonical route ownership.
- Changed landing/pricing SSR ETags to hash rendered HTML, so canonical/alternate changes cannot be hidden behind stale `304 Not Modified` responses.
- Added `services/api/src/ssr/__tests__/routeOwnership.test.ts` and included it in `pnpm launch:gate`.
- Added `services/api/src/ssr/__tests__/seoEtag.test.ts` and route-locale assertions in `publicSeoLocales.test.ts`.

## Why

- Public SEO route ownership was spread across nginx, sitemap generation, SSR helpers, and React Navigation.
- The manifest gives tests a single contract to compare against and keeps exact `/stories`, `/u/*`, `/billing/*`, and other app-only routes out of sitemap/indexable surfaces.

## Verification

- `pnpm --filter @wondertales/shared build`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/routeOwnership.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/seoEtag.test.ts`
- `pnpm --dir services/api exec tsx src/services/__tests__/sitemapService.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/publicSeoLocales.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `curl -I http://localhost:8081/pricing` returned `200` SSR HTML.
- `curl -I http://localhost:8081/stories` returned `200` with `X-Robots-Tag: noindex,nofollow`.
- `curl -I http://localhost:8081/billing/plans` returned `200` with `X-Robots-Tag: noindex,nofollow`.
- DevTools checked `/pricing` and `/billing/plans`; both rendered without console errors. DevTools also exposed a stale `304` pricing response with old locale alternates, which is now covered by HTML-hash ETags.
- Docker logs were checked during the batch; stale Postgres healthcheck noise was fixed by recreating the dev Postgres container on the existing volume.

## Follow-up

- Add localized author/story catalog route contracts only when localized SSR ownership exists.
- Build an SSR `/stories` catalog before making exact `/stories` indexable or adding it to sitemap.
