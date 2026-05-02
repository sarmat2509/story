# Subscription Usage Normalization

Date: 2026-05-02

## Summary

- Normalized subscription usage API response fields at the `useSubscriptionUsage` boundary.
- This preserves dynamic pricing feature slug maps such as `image_quality` while still mapping usage fields such as `plan_limit`, `bundle_bonus`, `current_period_end`, and `cancel_at_period_end` to the camelCase shape used by UI components.
- The production issue surfaced after a Stripe subscription test payment: `/api/v1/me/subscription-usage` returned `plan_limit` and `bundle_bonus`, but the UI did not see those fields and displayed bundle credits as part of the plan limit.

## Production Finding

- Stripe sandbox subscription checkout creation succeeded for the `golden` plan.
- Stripe sandbox subscription payment completed and returned to `/billing/success?kind=subscription&session_id=...`.
- The authenticated usage API reported active Stripe billing with story/audio limits and bundle bonus values.
- Before the fix, `/billing/plans` rendered `35` as the plan limit instead of `30 + 5` for stories.
- A global fetch-response camelize attempt fixed usage but rewrote dynamic plan feature keys, so the final fix is scoped to subscription usage only.

## Validation

- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- `./scripts/deploy.sh --web`
- Production DevTools verified `/billing/plans` renders localized feature labels and usage rows as `Тариф 30 + пакет 5` and `Тариф 10 + пакет 2`.
- Production API docker logs after the subscription checkout showed expected Stripe checkout/webhook records and no matching error/warn/failed lines.

## Deployment Notes

- No database migration is needed.
- This is a web client fix; API data was already correct.
