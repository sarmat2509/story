# Transactional Email Template System

Date: 2026-05-02

## Summary

- Added a reusable branded transactional email renderer for account emails.
- Moved welcome and password-reset emails onto the shared renderer, keeping localized copy in the existing i18n files.
- Added plain-text fallbacks, preheader text, escaped HTML output, CTA fallback URLs, support footer, and `replyTo` support routing.
- Kept recipient logging on the existing safe domain/hash pattern.
- Added launch-gate coverage for renderer escaping, support footer links, CTA URL output, and text fallback content.

## Validation

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/transactionalEmailRenderer.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/emailServiceLogContext.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm launch:gate`
- `./scripts/deploy.sh --api`
- `./scripts/check-production-auth.sh` returned `0` failures and `0` warnings.
- Fresh Docker log scan for API/nginx after deploy found no `error`, `warn`, `exception`, `failed`, or `panic` entries.

## Migration Notes

- No database migration was needed.
- No destructive schema operation was performed.

## Follow-Up

- Add email verification, billing receipt, privacy request, and story-ready emails through the shared renderer instead of hand-written HTML.
- Send live welcome and password-reset test emails to a real inbox after deploy and check Gmail/Zoho rendering.
