# Support feedback intake and incident templates

Date: 2026-05-02

## What changed

- Added shared feedback topic constants for billing, refund, unsafe content, failed generation, account/privacy, bug, feature, and other.
- Extended feedback submission with optional `supportTopic` stored in JSON context while preserving the existing database `category` constraint.
- Updated the feedback modal so plans/profile default to billing, public stories default to unsafe content, and story creation defaults to generation failed.
- Updated admin feedback to display and filter by support topic, while retaining existing category filters.
- Added localized topic labels for all app UI locales.
- Added `docs/runbooks/support-incident-process.md` with operator templates and incident checklists.
- Extended the Stripe test-mode runbook with the refund/support review path.

## Verification

- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-api exec tsx src/routes/__tests__/feedbackReportedScreens.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- `./scripts/deploy.sh --api --web`
- `./scripts/check-production-smoke.sh` passed public/SSR/API checks with `0` failures; authenticated/admin sections were skipped by the script because credentials are not exported into the shell.
- DevTools production smoke opened `/billing/plans`, confirmed the feedback modal renders billing, refund, unsafe-content, failed-generation, and account/privacy topics.
- Production feedback API accepted a logged-in refund support-topic smoke item.
- Production admin feedback API and `/admin/feedback` showed the smoke item with `supportTopic: "refund"` and `reportedScreen: "plans"`.
- Production docker logs showed `User feedback submitted` with the smoke feedback id, category `other`, and support topic `refund`.

## Notes

- No migration was needed: `supportTopic` lives in the existing `user_feedback.context` JSONB column.
- The old `category` values remain `bug`, `feature`, and `other`, so existing feedback records and the current CHECK constraint remain compatible.
