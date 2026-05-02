# Privacy Export Delivery Hygiene

Date: 2026-05-02

## Summary

- Changed admin export filenames to use the privacy request id instead of the
  exported user id.
- Added filename sanitization for generated export download names.
- Added an admin review-panel checklist for export delivery:
  - verify requester control,
  - download JSON only from the admin screen,
  - send through the verified support mailbox,
  - record delivery method/date in admin notes,
  - mark fulfilled only after delivery is complete.

## Why

The export JSON already omits password hashes, OAuth/session/reset tokens, story
share tokens, and signed asset URLs. This pass reduces avoidable identifier
leakage in filenames and makes the remaining manual delivery process harder to
complete accidentally without a support note.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/dataPrivacyRequestService.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-universal-app build:web`
- `./scripts/deploy.sh --api --web`
- `curl -fsS https://wondertales.art/health`
- Production API/webapp Docker log scan after deploy found no `error`, `warn`,
  `failed`, `panic`, `unhandled`, or `exception` lines in the checked window.

## Migration Notes

- No database migration was needed.
- No export payload fields were removed in this batch.
- No destructive operations were performed.
