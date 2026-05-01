# Child Mode Story Creator UI

Date: 2026-05-01

## Scope

- Added a child-facing story creation flow to the dedicated Child Mode screen.
- Reused the existing scoped backend endpoint: `POST /api/v1/stories/child-mode`.
- Kept the parent app navigation hidden while in a child session.

## Changes

- Child sessions now persist the normalized Child Mode controls returned by the session endpoint:
  - allowed languages;
  - allowed theme slugs;
  - free-text prompt permission;
  - parent review requirement.
- Added `useCreateChildModeStory` in the web app API layer.
- Expanded `ChildModeScreen` from a return-only shell into a guided story creator:
  - theme selection from allowed themes;
  - language selection from allowed languages;
  - illustration style selection;
  - optional short idea field only when free-text prompts are enabled;
  - safe pending/processing/completed/failed states;
  - child-safe limit and policy error messaging.
- Updated child-mode quota attribution so scoped child story requests reserve quota with `reservationSource: child_mode`.
- Updated shared story orchestration prompt-safety source labels for child-mode requests.
- Added localized UI strings for `en`, `uk`, `ru`, `es`, `de`, `fr`, and `pl`.
- Marked the completed child-safe generation UI work in `LAUNCH_ROADMAP.md`.

## Verification

- `node -e '...JSON.parse...'` for all shared i18n JSON files.
- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-api build`
- `pnpm --dir services/api exec tsx src/services/__tests__/childModePolicyService.test.ts`
- `pnpm --dir services/api exec tsx src/services/__tests__/childModeControlsService.test.ts`
- `pnpm --dir services/api exec tsx src/middleware/__tests__/authMiddlewareParentSession.test.ts`
- `pnpm --filter wondertales-universal-app build:web`
- `pnpm launch:gate`
- Chrome DevTools smoke on `http://localhost:8081/child-mode` with simulated child sessions:
  - allowed theme/language controls rendered;
  - free-text notes hidden when disabled and visible when enabled;
  - parent gate modal opened without console errors;
  - mobile viewport screenshot checked for layout fit.
- Docker logs checked after smoke:
  - `api` showed normal startup/query activity and no child-mode request errors;
  - `nginx` returned `200/304` for `/child-mode` and `/api/v1/dictionaries/story-themes`.

## Observations

- Dev nginx logs still contain pre-existing IPv6 upstream fallback noise for Metro assets (`connect() to [fdc4:...]:8082 failed`) before successful `200` responses. This did not break the Child Mode smoke, but it should be cleaned up separately so real nginx errors stand out.

## Remaining Related Work

- Add parent review workflow UI for child-created stories.
- Add richer non-password parent gate recovery for OAuth-only accounts.
- Add parent allowed-content selector UI for themes, languages, characters, and sibling inclusion.
- Run live Child Mode queue/provider smoke after production-like provider configuration is available.
