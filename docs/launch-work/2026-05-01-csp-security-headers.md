# CSP and Security Headers

## What changed

- Added a production webapp nginx security-header include for the exported Expo SPA.
- Added HSTS, frame, content-type, referrer, permissions, and opener policy headers to the same include.
- Added a reviewed CSP for the web bundle:
  - scripts/styles/assets are self-hosted by default;
  - PostHog is the only third-party script/connect source;
  - images and media allow `https:` for production CDN/storage assets;
  - Stripe Checkout/Portal, Google OAuth, and Apple OAuth remain top-level redirects through API routes and do not receive subresource access.
- Mounted the shared nginx include into the production `webapp` service and copied it into the standalone webapp Docker image.
- Tightened API Helmet `connect-src` so production SSR/API pages no longer allow broad `https:` connections.
- Added `pnpm launch:check-security-headers` and wired it into `pnpm launch:gate`.
- Updated the roadmap to mark the CSP allowlist review as code-ready while keeping deployed-domain header capture as remaining production work.

## Verification

- `pnpm launch:check-security-headers`
- `docker run --rm -v "$PWD/apps/universal-app/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/nginx/includes:/etc/nginx/includes:ro" -v "$PWD/apps/universal-app/dist:/usr/share/nginx/html:ro" nginx:alpine nginx -t`
- Temporary production-like webapp nginx smoke on port `8090`:
  - `curl -I http://localhost:8090/welcome`
  - Chrome DevTools console/network check against `http://localhost:8090/welcome`
- API/web checks after the TypeScript changes:
  - `pnpm --filter wondertales-api build`
  - `pnpm --filter wondertales-universal-app type-check`
  - `pnpm --filter wondertales-universal-app build:web`
- Production artifact follow-up on 2026-05-02:
  - `pnpm launch:check-production-security-artifacts`
  - `pnpm launch:check-production-security-artifacts -- --output-dir docs/launch-work/artifacts/production-security-2026-05-02`

## Follow-up

- Re-run the production artifact checker after release deploys that change nginx headers, SSR HTML, or the exported web bundle.
