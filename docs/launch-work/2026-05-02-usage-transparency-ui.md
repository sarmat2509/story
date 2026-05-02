# Usage Transparency UI

Date: 2026-05-02

## Summary

- Added a reusable `UsageSummaryCard` for subscription usage.
- Surfaced stories/audio remaining, reset/current period, and plan + bundle composition on `/billing/plans`.
- Replaced the short profile usage sentence with the same structured usage view inside the subscription section.
- Added the usage card before generation in both artisan and instant story creation flows.
- Localized the new copy for `uk`, `en`, `ru`, `es`, `fr`, `de`, and `pl`.

## Production Verification

- Deployed the web bundle with `./scripts/deploy.sh --web`.
- Confirmed `/billing/plans` in production shows:
  - usage period title;
  - reset date;
  - stories remaining;
  - audio stories remaining;
  - plan limit metadata.
- Confirmed `/profile` in production shows the embedded usage summary in the subscription block.
- Confirmed `/wizard` in production shows the usage summary before the generate button.
- Checked Chrome DevTools console after the flows. Only pre-existing Expo/Animated warnings and a form-field accessibility issue were present.
- Checked production API docker logs after the UI sweep. No usage endpoint errors, warnings, or failures were found.

## Validation

- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`

## Migration Notes

- No database migration was needed.
- The UI uses the existing subscription usage API fields, including `planLimit`, `bundleBonus`, `currentPeriodEnd`, and `resetsAt`.

## Follow-Up

- Locked-feature copy and Child Mode parent-gate copy remain tracked under P2 Usage Transparency.
- The wizard form-field accessibility warning is not introduced by this change, but should be handled in the UI polish backlog.
