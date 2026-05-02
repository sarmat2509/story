# Forgot Password Confirmation UX

Date: 2026-05-02

## Summary

- Reworked the post-submit forgot-password state into a clear confirmation card.
- Added the submitted email, inbox/spam guidance, reset-link expiry context, and privacy-safe wording.
- Added explicit actions to return to login or use a different email without leaving the screen.
- Added localized copy for the launch UI locales: Ukrainian, English, Russian, and Polish.

## Validation

- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-api exec tsx src/ssr/__tests__/appUiI18nCoverage.test.ts`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-universal-app build:web`
- `pnpm launch:gate`
- `./scripts/deploy.sh --web`
- DevTools verified the local `/auth/forgot-password` submit flow on desktop and mobile viewports.
- DevTools console check found no errors or warnings on the verified local screen.
- DevTools verified the production `/auth/forgot-password` submit flow on `wondertales.art`.
- Production DevTools console check found no errors or warnings on the verified screen.
- Fresh Docker log scan found no webapp/API errors or warnings; nginx only reported the known temporary-buffer warning for the large web bundle.

## Migration Notes

- No database migration was needed.
- No destructive schema operation was performed.

## Follow-Up

- Re-check the same screen on production after web deploy.
