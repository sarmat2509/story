# Route Indexing Guardrails

Date: 2026-05-01

## What changed

- Added an explicit `robots` option to published story SSR rendering.
- Rendered unlisted share SSR (`/u/:token`) with `noindex,nofollow` in both meta tags and `X-Robots-Tag`.
- Removed the React-only `/stories` catalog route from `sitemap.xml` until an SSR catalog exists.
- Added nginx SPA proxy includes for dev and prod to keep route ownership consistent.
- Marked app-only SPA routes with `X-Robots-Tag: noindex,nofollow`.
- Changed unknown public nginx routes from SPA catch-all `200` responses to real `404` responses with `noindex,nofollow`.
- Kept exact `/stories` accessible as the SPA catalog but noindexed it until it is SSR-backed.
- Updated `robots.txt` to keep crawler access to public pages while blocking API and health-check paths.

## App-only noindex routes

- `/welcome`
- `/register`
- `/auth/*`
- `/billing/*`
- `/dashboard`
- `/wizard`
- `/me/*`
- `/children`
- `/characters`
- `/profile`
- `/settings/*`
- `/admin/*`
- `/authors/*` until author SSR exists
- localized variants of these routes

## Verification

- `pnpm --filter wondertales-api exec tsx src/ssr/__tests__/renderPublishedStoryHtml.test.ts`
- `pnpm --filter wondertales-api build`
- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -t`
- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -s reload`
- Prod nginx syntax check with a temporary dummy certificate and `--add-host api/webapp`.
- `pnpm --filter wondertales-universal-app build:web`
- `curl -I http://localhost:8081/pricing` returns `200`.
- `curl -I http://localhost:8081/not-a-real-public-route` returns `404` and `X-Robots-Tag: noindex,nofollow`.
- `curl -I http://localhost:8081/stories` returns `200` and `X-Robots-Tag: noindex,nofollow`.
- `curl -I http://localhost:8081/register` returns `200` and `X-Robots-Tag: noindex,nofollow`.
- `curl http://localhost:8081/sitemap.xml` no longer contains exact `/stories`, `/u/*`, or `/authors/*` URLs.
- In-app browser smoke opened `/not-a-real-public-route` as an nginx 404 page and `/stories` without console errors.
