# Home Image Loading Optimization

Date: 2026-05-03

## Scope

- Added repeatable responsive image generation for the landing/home page via `pnpm --filter wondertales-universal-app optimize:landing-assets`.
- Generated AVIF and WebP variants for the hero mockup and landing section artwork under `apps/universal-app/public/landing/optimized/`.
- Updated the SSR landing renderer to use `<picture>` with AVIF/WebP `srcset`, responsive `sizes`, async decoding, and PNG/WebP fallbacks.
- Kept the original heavy assets in place as fallback files.
- Updated production smoke to accept Cloudflare Email Obfuscation output for the support email.

## DevTools Measurements

Production before optimization, `https://wondertales.art/`:

- Total first-pass image encoded payload: about 18.1 MB.
- Largest files:
  - `/landing/listen-again.png`: 8,689,374 bytes.
  - `/landing/create-in-minutes.png`: 2,505,698 bytes.
  - `/landing/safe-by-age.png`: 2,403,365 bytes.
  - `/landing/draw-to-hero.png`: 1,727,221 bytes.
  - `/hero-mockup.webp`: 1,593,480 bytes.

Local after optimization, `http://127.0.0.1:4177/`:

- Total first-pass image encoded payload: 406,635 bytes.
- Hero and the first four landing cards loaded as AVIF.

Production after deploy, `https://wondertales.art/?img-opt-after=20260503T2044`:

- Total first-pass image encoded payload: 303,102 bytes.
- Loaded optimized files:
  - `/landing/optimized/hero-mockup-1800.avif`: 50,054 bytes.
  - `/landing/optimized/draw-to-hero-720.avif`: 17,819 bytes.
  - `/landing/optimized/listen-again-720.avif`: 23,034 bytes.
  - `/landing/optimized/create-in-minutes-720.avif`: 18,215 bytes.
  - `/landing/optimized/safe-by-age-720.avif`: 18,534 bytes.

## Cloudflare Cache

- Cloudflare cache is active for proxied static assets.
- Verified `cf-cache-status: HIT` for repeated optimized asset requests, including `/landing/optimized/hero-mockup-1800.avif`.
- Current static asset cache header is `cache-control: max-age=14400`.
- Cloudflare cache helps avoid repeated origin hits, but it does not shrink first-user payload. The payload reduction comes from generated AVIF/WebP variants and responsive `sizes`.

## Verification

- `pnpm --filter wondertales-api build`
- `node --check apps/universal-app/scripts/optimize-landing-assets.js`
- `bash -n scripts/check-production-smoke.sh`
- `git diff --check`
- `pnpm launch:check-production-smoke`
- Production deploy: `./scripts/deploy.sh --api --web`
