# Pricing Plan Presenter Query

## Summary

- Replaced the pricing presenter N+1 feature lookup path with one joined plan-feature query for all active plans.
- Added a pure presenter assembly helper so feature grouping, plan sorting, localization, and current-plan marking are covered without a database fixture.
- Kept the existing SSR pricing fallback behavior intact; this change reduces the chance that live plan data exceeds the bounded SSR load window.

## Files Changed

- `services/api/src/repositories/PlanRepository.ts`
- `services/api/src/services/planService.ts`
- `services/api/src/services/planPresentationService.ts`
- `services/api/src/services/__tests__/planPresentationService.test.ts`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/planPresentationService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/ssr/__tests__/pricingPresentation.test.ts`
- `pnpm --filter wondertales-api exec tsc --noEmit --pretty false`
- `pnpm --filter wondertales-api build`
- `./scripts/deploy.sh --api`
- Production curl checks:
  - `https://wondertales.art/pricing` returned `200` in about `0.36s`.
  - `https://wondertales.art/en/pricing` returned `200` in about `0.18s`.
  - `https://wondertales.art/api/v1/plans` returned `200` in about `0.20s`.
- `LOG_SINCE=5m EXPECTED_STRIPE_MODE=test pnpm launch:check-production-ops` passed with `0` failures; recent api/webapp/nginx logs had no error/warn/failed/temporary-file lines in the post-deploy window.
- `CHECK_PROD_REMOTE=0 pnpm launch:check-production-smoke` passed with `0` failures; auth/admin checks were intentionally skipped without credentials.
- `pnpm launch:check-production-security-artifacts`
- Production DevTools loaded `https://wondertales.art/en/pricing` as a single SSR document request with status `200` and no console errors or warnings.

## Migration Notes

- No database migration was required.
- No destructive operation was used.
