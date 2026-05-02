# Quality Review Dashboard

Date: 2026-05-02

## Summary

- Added a `qualityReview` section to the admin dashboard API response.
- Added admin dashboard UI for quality/safety review status, weekly queues, unsafe reports, moderation failures, generation-failure reports, public story reports, image retry rate, and sample-story candidates.
- Added `qualityReviewService` threshold/status logic with launch-gate coverage.
- Documented the weekly quality review process in `docs/runbooks/content-quality-review.md`.

## Review Signals

- Failed moderation cases: failed story requests with moderation/policy-like errors plus stories with failed text moderation flags.
- Poor generation cases: generation-failure feedback and image validation retry pressure.
- Public story safety: unsafe-content reports and public-story report context.
- Sample curation: public catalog stories that are eligible but not yet featured on the home page.

## Validation

- `pnpm exec tsx src/services/__tests__/qualityReviewService.test.ts`
- `pnpm build` in `services/api`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- `./scripts/deploy.sh --api --web`
- Production API smoke: `/api/v1/admin/dashboard?days=7` returned `qualityReview.status`, six review queues, failed request rate, and image retry story rate.
- Production DevTools: `/admin/dashboard` rendered the `Quality review` metric, `Quality & safety review loop`, all six queue rows, and had no console warnings/errors.
- Production smoke with Stripe checkout-session creation passed with `0` failures and `0` warnings.
- Production docker logs for nginx/webapp/api after deploy showed no app/API errors; only expected nginx proxy-buffering warning for the large web bundle.

## Migration Notes

- No database migration was needed.
- No destructive operations were performed.
