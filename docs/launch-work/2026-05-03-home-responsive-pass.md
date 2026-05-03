# Home Responsive Pass

Date: 2026-05-03

## Scope

- Updated the SSR landing/home page CSS for mobile and tablet hero layouts.
- Made the hero media full-bleed on mobile and tablet widths.
- Changed mobile trust points from overlaid chips into a single-column text list without chip background or border.
- Kept tablet/desktop trust points over the hero image, but tightened positions so labels stay inside the viewport.
- Reduced tablet landscape hero height so the first viewport is less dominated by the mockup.
- Improved responsive spacing, grid columns, card media heights, and sticky feature controls for narrower screens.

## Local DevTools Checks

Local preview: `http://127.0.0.1:4177/`

- Mobile `320x568`: hero image spans `left: 0` to `right: 320`; trust points are one column; no trust point is clipped by viewport or clipping ancestors.
- Mobile `390x844`: hero image spans `left: 0` to `right: 390`; trust points are one column without background.
- Tablet breakpoint `701x900`: hero image spans `left: 0` to `right: 701`; overlaid trust points are inside viewport.
- Tablet landscape `1024x768`: hero image spans `left: 0` to `right: 1024`; overlaid trust points are inside viewport.
- Desktop breakpoint edge `1101x900`: trust points remain inside viewport after leaving the tablet media query.
- Desktop `1200x900` and `1366x900`: trust points are inside viewport and not clipped by overflow ancestors.

All checked widths had `document` scroll width equal to the viewport width, so no horizontal page scroll was introduced.

## Verification

- `pnpm --filter wondertales-api build`
- `git diff --check`
- Production deploy: `./scripts/deploy.sh --api`
- Production DevTools, `https://wondertales.art/?responsive-after=20260503T2346`:
  - Mobile `390x844`: hero image spans `left: 0` to `right: 390`; trust points are one column without background or border; no clipping detected.
  - Tablet `768x1024`: hero image spans `left: 0` to `right: 768`; overlaid trust points are inside viewport and not clipped by overflow ancestors.
  - Tablet landscape `1024x768`: hero image spans `left: 0` to `right: 1024`; overlaid trust points are inside viewport and not clipped by overflow ancestors.
- `pnpm launch:check-production-smoke` finished with `0 failure(s), 2 warning(s)`; warnings were the expected missing authenticated/admin smoke tokens.
