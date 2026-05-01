# Localized legal route ownership

## What changed

- Made legal SSR locale resolution path-based:
  - `/terms` and `/privacy` render default `uk`.
  - `/en/terms` and `/en/privacy` render `en`.
- Added canonical and `hreflang` links for legal pages, limited to `uk`, `en`, and `x-default`.
- Added shared `buildPublicLegalPath()` route helper.
- Added nginx dev/prod/common routes for English legal URLs.
- Updated public SSR footers to preserve the active public SEO locale for home, pricing, stories, terms, and privacy links.
- Added launch-gate coverage for localized legal rendering and route ownership.

## Checks

- `pnpm --filter @wondertales/shared build`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderLegalHtml.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/publicSeoLocales.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/routeOwnership.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- Reloaded dev nginx with `docker exec wondertales-nginx-dev nginx -s reload`.
- `curl http://localhost:8081/terms` returned Ukrainian legal content, canonical `/terms`, and `uk`/`en`/`x-default` alternates.
- `curl http://localhost:8081/en/terms` returned English legal content, canonical `/en/terms`, and localized footer links.
- `curl http://localhost:8081/privacy` returned Ukrainian legal content and canonical `/privacy`.
- `curl http://localhost:8081/en/privacy` returned English legal content, canonical `/en/privacy`, and localized footer links.
- `curl -I http://localhost:8081/ru/terms` returned `404` with `X-Robots-Tag: noindex,nofollow`.
- `pnpm launch:gate`
- DevTools smoke on `/en/privacy` confirmed:
  - `html lang="en"`;
  - canonical `/en/privacy`;
  - `uk`, `en`, and `x-default` alternates;
  - `robots=index,follow`;
  - localized footer links for public SEO routes;
  - no fallback "Content not available" copy;
  - no console messages.
- Docker logs checked after the full gate:
  - API only showed expected watch restarts and normal startup/health logs.
  - nginx showed the localized legal rewrites and `200` legal responses; known dev `/hot` websocket and source-map noise was present.
  - Postgres and Redis had no recent errors.
