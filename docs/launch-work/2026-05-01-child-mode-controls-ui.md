# Child Mode controls UI

Date: 2026-05-01

## What changed

- Expanded child profile cards on `/children` with Child Mode controls.
- Parents can toggle Child Mode enablement per child.
- Parents can edit daily/monthly generation caps.
- Parents can toggle free-text prompts, audio generation, parent review requirement, and shared family story viewing.
- Cards show active child-session counts and expose a revoke action when sessions are active.
- Added English, Ukrainian, and Russian copy for the new controls.

## Safety notes

- The UI does not start a child session yet because the parent return gate is still missing.
- The controls are visible and editable, but child-safe generation enforcement remains a separate backend task.
- Allowed themes, languages, characters, and sibling inclusion still need richer controls.

## Verification

- `pnpm --filter @wondertales/shared build`
- `pnpm type-check` in `apps/universal-app`
- DevTools live check: navigating to `http://localhost:8081/children` redirects unauthenticated users to `/welcome` with no new console errors.
