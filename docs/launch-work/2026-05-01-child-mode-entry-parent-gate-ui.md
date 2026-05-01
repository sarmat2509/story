# Child Mode Entry and Parent Gate UI

## What changed

- Added client session state for `parent` vs `child` sessions plus the active child profile.
- Wired `POST /api/v1/children/:id/child-mode/sessions` into the Children screen so an enabled child profile can start Child Mode.
- Added a dedicated `ChildModeScreen` that hides the parent app shell while a child session is active.
- Added a parent gate modal that calls `POST /api/v1/auth/parent-gate` and uses `skipAuthLogoutOn401` so an incorrect password does not destroy the child session.
- Added an OAuth-only/password-unavailable fallback message with sign-out as the safe recovery path.
- Added `/child-mode` as an app-only noindex route in dev and production nginx configs.
- Added translations for the Child Mode entry/return flow across the bundled UI locales.

## Verification

- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-universal-app build:web`
- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -t`
- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -s reload`
- Production nginx syntax check with a temporary dummy certificate and `--add-host api/webapp`.
- Chrome DevTools:
  - unauthenticated `/child-mode` redirects back to `/welcome`;
  - simulated child-session local state renders `ChildModeScreen`;
  - parent gate modal opens without new console errors.

## Follow-up

- Build the actual child-safe story creation UI on top of `POST /api/v1/stories/child-mode`.
- Add a richer OAuth-only parent gate path instead of sign-out recovery only.
- Add parent review workflow UI for child-created stories.
