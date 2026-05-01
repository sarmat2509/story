# Admin Privacy Requests UI - 2026-05-01

## Scope

Added a web admin screen for support review of data export and deletion requests.

## Changed

- Added admin API hooks and types for privacy request listing/updating.
- Added `AdminPrivacyRequestsScreen`.
- Added the screen to admin navigation, sidebar, and web linking at `/admin/privacy-requests`.
- The screen supports search, type/status filters, request cards, and inline status/admin-note updates.

## Verification

- `pnpm type-check` in `apps/universal-app`
- `pnpm build:web` in `apps/universal-app`
- DevTools MCP navigation to `http://localhost:8081/admin/privacy-requests`
  - With Metro running, nginx no longer returns `502`.
  - Without an admin session, the app redirects to `/welcome`.
  - No new runtime console errors were observed; DevTools showed existing welcome-form warnings only.
