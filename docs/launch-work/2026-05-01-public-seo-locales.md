# Public SEO Locales - 2026-05-01

## Scope

Limited indexable public SEO locale exposure to locales that currently have launch-ready legal content.

## Changed

- Added `PUBLIC_SEO_LOCALES` with `uk` and `en`.
- Landing and pricing `hreflang` alternate links now use only `uk`, `en`, and `x-default`.
- `sitemap.xml` now includes only `uk` and `en` landing/pricing public SEO URLs.
- Dev, production, and shared nginx SSR routing now only expose localized public landing/pricing SSR routes for `/en` and `/en/pricing`; default Ukrainian remains on `/` and `/pricing`.
- App-only locale-prefixed routes remain noindex SPA routes and can still support broader UI/story language behavior.
- Added a pure SSR test for the public SEO locale allowlist and alternate-link output.

## Verification

- `pnpm exec tsx src/ssr/__tests__/publicSeoLocales.test.ts`
- `pnpm build` in `services/api`
- `pnpm type-check` in `apps/universal-app`
- `pnpm build:web` in `apps/universal-app`
- `docker exec wondertales-nginx-dev nginx -t`
- Reloaded dev nginx after config changes.
- `curl -I http://localhost:8081/en` returned `200 OK`.
- `curl -I http://localhost:8081/en/pricing` returned `200 OK`.
- `curl -I http://localhost:8081/ru` returned `404 Not Found` with `X-Robots-Tag: noindex,nofollow`.
- `curl -I http://localhost:8081/ru/pricing` returned `404 Not Found` with `X-Robots-Tag: noindex,nofollow`.
- `/pricing` and `/` HTML now emit only `uk`, `en`, and `x-default` alternates.
- `sitemap.xml` includes `/en/` and `/en/pricing`, and no unsupported locale landing/pricing URLs.
- Chrome DevTools MCP loaded `http://localhost:8081/en/pricing` with `GET /en/pricing [200]` and no console messages.
