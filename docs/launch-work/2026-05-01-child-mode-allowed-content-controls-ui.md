# Child Mode Allowed Content Controls UI

Date: 2026-05-01

## Scope

- Added parent-facing selectors for Child Mode allowed content controls in `/children`.
- Reused the existing `PATCH /api/v1/children/:id/child-mode` endpoint and existing backend policy fields.

## Changes

- `/children` now passes story goal, language, and saved character options into each child card.
- Child profile cards now expose:
  - allowed story themes;
  - allowed story languages;
  - allowed saved characters;
  - sibling-character permission.
- Empty selections continue to mean "any" for themes, languages, and characters, matching backend policy behavior.
- Existing selected values that are no longer present in the option lists still render as chips so parents can see and clear them.
- Added localized labels for `en`, `uk`, `ru`, `es`, `de`, `fr`, and `pl`.
- Updated `LAUNCH_ROADMAP.md` to mark allowed content selectors as done.

## Verification

- `node -e '...JSON.parse...'` for all shared i18n JSON files.
- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-universal-app build:web`
- Chrome DevTools smoke on `http://localhost:8081/children` with a mocked authenticated parent API session:
  - allowed theme, language, saved-character, and sibling controls rendered in the child profile card;
  - selecting an allowed theme updated the control state without a runtime error;
  - the initial form-field accessibility warning on Child Mode limit inputs was fixed by adding stable native IDs;
  - a follow-up console check returned clean.
- Docker logs checked after the browser smoke:
  - `api` had normal startup/watch output and no application errors from the smoke;
  - `nginx` returned successful page and bundle responses, with the known pre-existing IPv6 Metro upstream fallback noise still present before successful `200` responses.

## Remaining Related Work

- Parent review workflow UI for child-created stories.
- Non-password parent gate path for OAuth-only accounts.
- Production-domain verification for OAuth callbacks and email delivery remains outside this local UI batch.
