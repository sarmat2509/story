# Public Story Report Action

Date: 2026-05-01

## Scope

- Added an explicit report story button to public and unlisted story pages.
- Reused the existing feedback modal, upload path, rate limiting, and admin feedback inbox.
- Added a `published_story` reported-screen context so support can distinguish public story reports from generic feedback.
- Added localized report story copy and feedback screen labels.
- Added launch-gate coverage for the feedback API reported-screen list.

## Files changed

- `apps/universal-app/src/screens/published/PublishedStoryScreen.tsx`
- `apps/universal-app/src/api/feedback.ts`
- `apps/universal-app/src/components/FeedbackModal.tsx`
- `services/api/src/routes/feedback.ts`
- `services/api/src/routes/__tests__/feedbackReportedScreens.test.ts`
- `packages/shared/src/i18n/*.json`
- `scripts/launch-gate.sh`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --dir services/api exec tsx src/routes/__tests__/feedbackReportedScreens.test.ts`
- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-api build`
- `pnpm launch:gate`
- DevTools live check on a public story page confirmed the report story button opens feedback with the `Публічна історія` reported-screen context and no browser console errors.
- Docker log review covered API, nginx, Postgres, and Redis. The only noise was expected dev restarts/source-map requests and an existing `/message` dev 404; no new runtime errors appeared.
