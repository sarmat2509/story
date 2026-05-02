# Admin cost controls and queue dashboard

Date: 2026-05-02

## What changed

- Added configurable cost-control thresholds for high-cost stories, daily spend, projected monthly spend, top-user daily spend, and queue depth.
- Added backend dashboard guardrail metrics for projected monthly AI spend, daily average spend, max story cost, high-cost story count, unpriced AI usage events, and top-user 24h cost.
- Added live queue health to the admin dashboard for text, image, audio, and legacy story queues.
- Added admin dashboard UI sections for cost guardrails and queue depth.
- Added a focused cost-control service test and wired it into `pnpm launch:gate`.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/costControlService.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- `./scripts/deploy.sh --api --web`
- Production admin dashboard API returned `costControls` and `queueHealth` with healthy status.
- DevTools production smoke confirmed `/admin/dashboard` renders `Cost guardrail`, `Queue backlog`, `Cost guardrails`, and `Queue depth`.
- Production console check had no new errors; only existing Expo web warnings were present.
- Production API docker logs after the smoke showed queue startup logs and no dashboard errors, warnings, or failed requests.

## Notes

- No migration was needed.
- This adds operator-visible guardrail bands and queue visibility. External alert delivery and deeper automated per-user abuse response remain future work.
