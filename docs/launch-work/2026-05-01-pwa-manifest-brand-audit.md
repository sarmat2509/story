# PWA manifest brand audit

## What changed

- Replaced stale `Kazka+` naming in the web manifest with WonderTales branding.
- Added `/manifest.json` to shared public SSR head assets.
- Added `/manifest.json` to published story SSR meta generated from the shared package.
- Added `scripts/check-web-manifest-brand.sh`.
- Wired the manifest brand check into `pnpm launch:gate` after `build:web`, so it checks both source and exported manifests when `dist` exists.

## Checks

- `pnpm --filter wondertales-universal-app build:web`
- `bash scripts/check-web-manifest-brand.sh`
- `pnpm --filter @wondertales/shared build`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderPublicAuthorHtml.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderPublicStoriesCatalogHtml.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm launch:gate`
- `curl http://localhost:8081/manifest.json` returned WonderTales `short_name` and `name`.
- `curl http://localhost:8081/stories` showed `<link rel="manifest" href="/manifest.json">` in SSR HTML.
- DevTools reload on `/stories` confirmed:
  - the SSR document exposes `/manifest.json`;
  - `/manifest.json` returns `200`;
  - the manifest name is WonderTales;
  - no stale `Kazka` text appears in the document or manifest;
  - no console messages were emitted.
- Docker logs checked after the full gate:
  - API only showed expected watch restarts from edited SSR/shared files and normal startup/health lines.
  - nginx showed successful `200` manifest/catalog requests plus one dev source-map `404` noise line.
  - Postgres and Redis had no recent errors.

## Notes

- This closes the launch-roadmap stale PWA brand item locally.
- The production domain still needs a post-deploy manifest/header capture under the existing production verification work.
