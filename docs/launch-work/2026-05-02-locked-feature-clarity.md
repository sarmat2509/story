# Locked Feature Clarity

Date: 2026-05-02

## Summary

- Added plan-unlock explanations to locked feature rows on `/billing/plans`.
- Locked features now show the first plan that includes that capability.
- Added a premium voice lock reason in the voice selector so parents understand that premium voices require the Fairy World plan.
- Localized the new copy for `uk`, `en`, `ru`, `es`, `fr`, `de`, and `pl`.

## Validation

- Parsed all updated i18n JSON files.
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- `./scripts/deploy.sh --web`
- Production DevTools verified `/billing/plans` shows localized unlock reasons such as `Доступно з тарифу Казковий світ` and preserves localized feature labels.
- Production browser console only showed known Expo/Animated warnings.
- Production nginx/webapp docker log scan after deploy showed one benign nginx proxy-buffering warning for the large JS bundle and no application errors.

## Migration Notes

- No database migration was needed.
- The plan-unlock text is derived from the already loaded plan catalog and does not add API calls.

## Follow-Up

- Child Mode still needs a dedicated child-safe locked-feature/help pattern if future child-facing locked paid blocks are added.
