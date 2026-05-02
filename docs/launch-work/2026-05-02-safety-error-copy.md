# Safety Error Copy

Date: 2026-05-02

## Context

Prompt and photo-input safety errors already fail closed in the API, but some app flows could fall back to a generic "try again" message because the shared API-error mapper did not know those safety codes.

## Changes

- Localized `PROMPT_SAFETY_BLOCKED` and `PROMPT_SAFETY_REJECTED` to a parent-safe rewrite prompt.
- Localized uploaded-photo safety failures:
  - `PHOTO_URL_NOT_ALLOWED`
  - `PHOTO_PATH_INVALID`
  - `PHOTO_TYPE_NOT_ALLOWED`
  - `PHOTO_OWNER_MISMATCH`
- Added required i18n coverage for the new API error keys across all app translation files.

## Verification

- `pnpm --filter wondertales-api exec tsx src/ssr/__tests__/appErrorI18n.test.ts`
- `pnpm --filter wondertales-api exec tsx src/ssr/__tests__/appUiI18nCoverage.test.ts`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter @wondertales/shared build:fast`
- JSON parse check for `packages/shared/src/i18n/*.json` and copied `dist/i18n/*.json`
