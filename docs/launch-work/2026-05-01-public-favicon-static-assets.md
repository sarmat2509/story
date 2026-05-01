# Public Favicon Static Assets - 2026-05-01

## Scope

Fixed a public web smoke issue found with Chrome DevTools MCP: `GET /favicon.ico` returned `502 Bad Gateway` on the local `http://localhost:8081/pricing` SSR page when Metro was not running.

## Changed

- Added explicit favicon and apple-touch-icon links to API-rendered public SSR pages.
- Added favicon links to the shared published-story SSR meta builder.
- Mounted `apps/universal-app/public` into the dev nginx container.
- Served core public icon/OG assets directly from dev nginx so SSR pages do not depend on Metro for browser chrome assets.
- Added a production nginx redirect from `/favicon.ico` to `/favicon.png`.

## Verification

- Recreated dev nginx with `docker compose -f docker-compose.dev.yml up -d nginx`.
- `curl -I http://localhost:8081/favicon.ico` returned `200 OK`.
- `curl -I http://localhost:8081/favicon.png` returned `200 OK`.
- `curl -I http://localhost:8081/pricing` returned `200 OK`.
- Chrome DevTools MCP reload of `/pricing` showed `GET /pricing [200]` and `GET /favicon.png [200]` with no console messages.
- `pnpm --filter @wondertales/shared build`
- `pnpm build` in `services/api`
- `pnpm type-check` in `apps/universal-app`
- `pnpm build:web` in `apps/universal-app`
