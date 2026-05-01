# Live Verification

Date: 2026-05-01

## Local Stack

- Started Docker Desktop.
- Ran `apps/universal-app/start-web-dev.sh`.
- Confirmed:
  - web app: `http://localhost:8081`
  - API: `http://localhost:3000`
  - Metro: `http://localhost:8082`

## Browser Check

- Opened `http://localhost:8081/plans` in the Codex in-app browser.
- Followed the visible "Тарифи" button to `http://localhost:8081/pricing`.
- Confirmed the unauthenticated pricing screen renders plan cards.
- Checked browser console warnings/errors; no new runtime errors were observed. Existing warnings were React Native Web / Expo deprecation warnings.

## HTTP Checks

- `curl -I http://localhost:8081/pricing` -> `200 OK`.
- `curl http://localhost:3000/health` -> healthy, database connected.
- `curl http://localhost:3000/api/v1/bundles` without auth -> `401 Unauthorized`, as expected.

## Migration Check

- Ran the dev-container migration command for bundle migrations `0078` through `0083`.
- Result: migrations were already marked applied.
- Confirmed local dev DB contains:
  - `story_bundles`: 5 rows.
  - `plan_bundle_prices`: 20 rows.
  - schema journal entries for all bundle migrations `0078` through `0083`.

## Tooling Note

- Google DevTools MCP was not available in this session (`list_mcp_resources` and templates were empty).
- Used the available Codex Browser Use in-app browser workflow for live verification instead.
