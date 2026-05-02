# Transactional Email Log Redaction

Date: 2026-05-02

## Summary

- Removed raw recipient email addresses from transactional email structured logs.
- Password-reset and welcome-email logs now include only `recipientDomain` and a short normalized `recipientHash`.
- Added launch-gate coverage for the safe email log context helper.
- Deployed the API image to the production droplet through the tracked `./scripts/deploy.sh --api` path.

## Validation

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/emailServiceLogContext.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm launch:gate`
- `./scripts/deploy.sh --api`
- `./scripts/check-production-auth.sh` passed after deploy with `0` failures and `0` warnings.
- Production API container env still includes `SUPPORT_EMAIL=support@wondertales.art` after the deploy uploaded `.env.production`.
- Production migration runner reported all migrations already applied.

## Migration Notes

- No database migration was needed.
- No destructive schema operation was performed.

## Follow-Up

- Keep future notification and support email logs on the same pattern: correlation ids, domains, and hashes instead of raw email addresses.
