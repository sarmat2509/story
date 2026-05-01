# Public stories catalog SSR

## What changed

- Added API SSR HTML for the exact public stories catalog route:
  - `/stories`
  - `/en/stories`
- Moved `/stories` from a noindex SPA route to an indexable API SSR route.
- Kept `/stories/:slug` on the existing published-story SSR route.
- Kept unsupported localized story catalog routes, such as `/ru/stories`, out of the launch SEO route set.
- Added canonical and `hreflang` links for `uk`, `en`, and `x-default`.
- Added `/stories` and `/en/stories` to sitemap static SEO routes and bumped the sitemap Redis cache key to `sitemap:xml:v3`.
- Added a lightweight `window.__INITIAL_STORIES__` payload so the hydrated React catalog avoids the first catalog API refetch without embedding full scene text or audio alignment metadata.

## Checks

- `pnpm --filter @wondertales/shared build`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderPublicStoriesCatalogHtml.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/routeOwnership.test.ts`
- `pnpm --dir services/api exec tsx src/services/__tests__/sitemapService.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- Reloaded dev nginx with `docker exec wondertales-nginx-dev nginx -s reload`.
- `curl -sSI http://localhost:8081/stories` returned `200`, `index,follow`, and a stories-catalog ETag.
- `curl http://localhost:8081/stories` showed `html lang="uk"`, canonical `/stories`, and `window.__INITIAL_STORIES__`.
- `curl http://localhost:8081/en/stories` showed `html lang="en"` and canonical `/en/stories`.
- `curl http://localhost:8081/sitemap.xml` includes `/stories` and `/en/stories`.
- DevTools smoke on `/stories`:
  - SSR document returned `200`.
  - public story images returned `200`.
  - no console messages were emitted.
  - the first hydrated screen did not refetch `/api/v1/public/stories`.
- Docker logs checked after the full gate:
  - API only showed expected watch restarts and database/debug lines.
  - nginx showed successful `200` responses for `/stories`; one earlier `502` happened while the API dev server was restarting during the build.
  - Postgres had no recent errors.
  - Redis only showed a normal background save.
- Dev stack status after checks: API, nginx, Postgres, and Redis were running; Postgres and Redis were healthy.
