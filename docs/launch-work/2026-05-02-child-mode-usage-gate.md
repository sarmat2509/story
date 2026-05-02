# Child Mode Usage Gate

## Summary

- Added a Child Mode usage panel backed by the existing subscription usage endpoint.
- Child sessions now see localized, child-safe "story chances" copy before creating a story.
- When story credits are exhausted, the create action is disabled and the only help CTA opens the existing parent gate.
- No checkout, customer portal, billing settings, plan-change, or adult account settings path was added to Child Mode.

## Files Changed

- `apps/universal-app/src/screens/childMode/ChildModeScreen.tsx`
- `packages/shared/src/i18n/en.json`
- `packages/shared/src/i18n/uk.json`
- `packages/shared/src/i18n/ru.json`
- `packages/shared/src/i18n/es.json`
- `packages/shared/src/i18n/fr.json`
- `packages/shared/src/i18n/de.json`
- `packages/shared/src/i18n/pl.json`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- `./scripts/deploy.sh --web`
- Production DevTools render check on `https://wondertales.art/child-mode` with a temporary simulated child session:
  - Child Mode rendered with the deployed bundle.
  - Usage panel displayed the child-safe "Історії на цей період" copy.
  - Parent gate opened from the child shell.
  - No checkout, customer portal, plan-change, billing settings, or adult settings path was exposed in the child shell.
- Production docker logs after the check showed successful `/child-mode`, `/api/v1/dictionaries/story-themes`, and `/api/v1/me/subscription-usage` requests with no API errors. The only warning was the known nginx temporary-buffer warning for the large web bundle.

## Production Notes

- No database migration was required.
- No destructive operation was used.
- A full production child-flow smoke still needs a stable QA child profile. Until that fixture exists, the production UI can be render-checked by temporarily simulating a child session in DevTools with an existing authenticated QA session and without submitting story generation.
