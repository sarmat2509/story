# Child Mode Live Usage Smoke

Date: 2026-05-02

## Summary

- Fixed `/api/v1/me/subscription-usage` so child sessions can read a child-safe usage payload for Child Mode story chances.
- Parent sessions still receive the full billing-aware payload used by profile and billing screens.
- Child-session responses omit subscription status, cancel-at-period-end, payment provider, real-payments flag, plan base limits, and bundle bonus details.
- Expanded `scripts/check-production-smoke.sh` with `PROD_SMOKE_CHILD_MODE=1` to create a temporary child profile, enable Child Mode, create a real child session, verify child-safe usage, verify parent-only API blocking, and delete the temporary child profile.
- Added launch-gate coverage for the child-safe usage view.

## Validation

- `bash -n scripts/check-production-smoke.sh`
- `cd services/api && pnpm exec tsx src/services/__tests__/subscriptionUsageView.test.ts`
- `cd services/api && pnpm build`
- `pnpm launch:gate`
- `./scripts/deploy.sh --api`
- `PROD_SMOKE_CHILD_MODE=1 PROD_SMOKE_CHECKOUT=1 ./scripts/check-production-smoke.sh` with temporary authenticated/admin smoke token passed with `0 failure(s), 0 warning(s)`.
- Production Docker logs showed `Updated child mode controls` and `Created child mode session` for the temporary smoke child, with no Child Mode errors.

## Migration Notes

- No database migration was needed.
- No destructive schema operation was performed.
- Temporary production smoke user and child profile data were deleted after verification.

## Follow-Up

- Keep `PROD_SMOKE_CHILD_MODE=1` enabled for full launch verification runs.
- The separate production email deliverability blocker remains: Resend still rejects mail until the domain is verified and sender DNS is configured.
