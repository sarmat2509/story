# Cost Control Alerts

Date: 2026-05-02

## Summary

- Added a backend cost-control alert builder for warning and critical launch guardrail breaches.
- Admin dashboard data now includes `costControls.alerts` with alert key, severity, detail, action, review URL, metric value, and threshold value.
- Covered projected monthly spend, daily average spend, top-user 24h spend, max story cost, high-cost stories, and unpriced AI usage events.
- Admin dashboard UI now renders the active alert queue and shows a clear empty state during healthy periods.
- Added focused regression coverage for alert generation.

## Validation

- `cd services/api && pnpm exec tsx src/services/__tests__/costControlService.test.ts`
- `cd services/api && pnpm build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- `./scripts/deploy.sh --api --web`
- `./scripts/deploy.sh --web`
- Production `/api/v1/admin/dashboard?days=7` returned `costControls.alerts` as an array.
- Production `/admin/dashboard` rendered `Cost guardrails` and `No active cost alerts.` for the current healthy state.
- DevTools network check confirmed `/api/v1/admin/dashboard?days=30` returned `200`.
- DevTools console check found no console messages on the admin dashboard.
- Production Docker logs showed successful `/admin/dashboard` and `/api/v1/admin/dashboard` responses; the only warning was the known nginx temporary-buffer message for the large web bundle.

## Migration Notes

- No database migration was needed.
- No destructive operations were performed.

## Follow-Up

- External notification delivery remains a separate escalation step if beta traffic grows beyond manual dashboard checks.
