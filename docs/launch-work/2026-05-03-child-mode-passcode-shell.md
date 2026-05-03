# 2026-05-03 Child Mode Passcode and App Shell

## Summary

Implemented a Child Mode return path that does not use Google/Apple OAuth. Parents configure a per-child exit passcode before Child Mode can be started, and returning to Parent Mode verifies that passcode through `POST /api/v1/auth/parent-gate`.

Expanded Child Mode from a one-page shell into the normal app shell with child-scoped permissions:

- Dashboard/Wizard stay on the child-safe story creator.
- Library and Story Viewer allow children to read and listen to permitted existing stories.
- Characters allows child-safe character listing, photo upload, analysis, and creation.
- Navigation shows the active child profile name/avatar.
- Billing, settings, support, destructive actions, publishing/sharing, review controls, and plan flows remain parent-only.

## Backend Changes

- Added `child_mode_passcode_hash` and `child_mode_passcode_set_at` to `child_profiles`.
- Child Mode cannot be enabled without an exit passcode.
- Child Mode sessions cannot be created unless the profile has a passcode configured.
- Parent-gate return verifies the selected child's passcode instead of the parent account password or OAuth.
- Legacy parent-gate Google/Apple routes return `PARENT_GATE_PASSCODE_REQUIRED` and no longer use the OAuth limiter.
- Child story APIs filter a child session to the active child profile unless `allowSharedFamilyStories` grants `family_stories:read`.
- Child-profile API responses and privacy exports omit the passcode hash/set timestamp.
- Child-safe character upload/list/create routes allow `child_mode` scoped sessions while edit/delete stay parent-only.

## Frontend Changes

- `/children` profile cards include passcode setup and disable Child Mode start until passcode is configured.
- Child Mode exit modal now asks for the Child Mode passcode.
- OAuth parent-gate buttons were removed from the child UI.
- Main navigation adjusts Series visibility based on `allowSharedFamilyStories`.
- Series screens hide feedback/continuation/plan CTAs in child sessions.

## Verification

- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm exec tsx src/services/__tests__/sessionService.test.ts`
- `pnpm exec tsx src/routes/__tests__/feedbackReportedScreens.test.ts`
- `pnpm exec tsx src/services/__tests__/moderationDecisionService.test.ts`
- `pnpm exec tsx src/services/__tests__/promptSafetyService.test.ts`
- `pnpm exec tsx src/services/__tests__/photoInputSafetyService.test.ts`
- `pnpm exec tsx src/services/__tests__/childModeControlsService.test.ts`
- `pnpm exec tsx src/services/__tests__/childModePolicyService.test.ts`
- `pnpm exec tsx src/services/__tests__/childStoryAccessService.test.ts`
- Locale JSON parse check for `en`, `ru`, `uk`, `es`, `fr`, `de`, and `pl`.

## Production

- Deployed API and webapp with `./scripts/deploy.sh`; migrations `0089_moderation_decision_events.sql` and `0090_child_mode_passcode.sql` were applied.
- Re-deployed webapp with `./scripts/deploy.sh --web` after final UI cleanup.
- Production health check returned healthy database status.
- `pnpm launch:check-production-security-artifacts` passed after deploy.
- `./scripts/check-production-smoke.sh` passed with `0` failures and the expected unauthenticated smoke warnings.
- Recent API Docker logs were scanned for error/warn/failure patterns with no matches.
- Chrome DevTools opened `https://wondertales.art/children`; unauthenticated navigation redirected to welcome and browser console had no errors or warnings.

## Follow-up

- Run an authenticated production Child Mode passcode E2E with a temporary child profile when a disposable parent account/token is available in the smoke environment.
