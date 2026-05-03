# Child-data deletion request form

Date: 2026-05-03

## What changed

- Added a parent-only child-data deletion request flow to the child profiles screen.
- Added a Profile preferences entry that takes parents to child profile management for deletion requests.
- Added Profile preferences actions for account-level data export and deletion-review requests.
- Added recent privacy request status rows in Profile preferences using `/api/v1/me/privacy-requests`.
- Added `usePrivacyRequests()` and `useCreatePrivacyRequest()` for `/api/v1/me/privacy-requests`.
- Added a tested account privacy request message builder for Profile export/deletion-review requests.
- Added `buildChildDataDeletionRequestMessage()` so scoped child deletion requests are formatted consistently before entering the support/admin queue.
- Added launch gate coverage for the child-data deletion request message builder.

## Product behavior

- A parent opens a child profile card and chooses `Request child data deletion`.
- The form defaults to all child-data scopes: profile/settings, reference photos and character sheets, stories/prompts/drafts/illustrations, audio/narration, and a full support review for any other linked child data.
- The parent can add an optional note; submission creates a privacy request with `requestType='deletion'`.
- Support reviews the request in `/admin/privacy-requests`; support email remains a fallback path.

## Files changed

- `apps/universal-app/src/api/privacyRequests.ts`
- `apps/universal-app/src/utils/childDataDeletionRequest.ts`
- `apps/universal-app/src/utils/__tests__/childDataDeletionRequest.test.ts`
- `apps/universal-app/src/screens/children/ChildrenScreen.tsx`
- `apps/universal-app/src/screens/children/components/ChildCard.tsx`
- `apps/universal-app/src/screens/profile/ProfileScreen.tsx`
- `packages/shared/src/i18n/{en,uk,ru,pl}.json`
- `scripts/launch-gate.sh`
- `LAUNCH_ROADMAP.md`
- `docs/runbooks/support-incident-process.md`

## Verification

- `pnpm exec tsx src/utils/__tests__/childDataDeletionRequest.test.ts`
- `pnpm exec tsx src/utils/__tests__/privacyRequestMessages.test.ts`
- `pnpm exec tsx src/ssr/__tests__/appUiI18nCoverage.test.ts`
- Launch locale JSON parse check for `en`, `uk`, `ru`, and `pl`
- `pnpm type-check`
- `pnpm build:web`
