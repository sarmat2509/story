# Data Privacy Request Workflow - 2026-05-01

## Scope

Added a support/admin workflow for parent-account export and deletion requests.

## Changed

- Added migration `0086_data_privacy_requests.sql`.
- Added `data_privacy_requests` to the Drizzle schema.
- Added `DataPrivacyRequestRepository`.
- Added `dataPrivacyRequestService` with request formatting, message normalization, user listing, admin listing, and admin status updates.
- Added parent-only user endpoints:
  - `GET /api/v1/me/privacy-requests`
  - `POST /api/v1/me/privacy-requests`
- Added admin-only endpoints:
  - `GET /api/v1/admin/privacy-requests`
  - `PATCH /api/v1/admin/privacy-requests/:requestId`
- Added admin-only export endpoint:
  - `GET /api/v1/admin/privacy-requests/:requestId/export`
- Added `userDataExportService` to build JSON export packages without password hashes, OAuth/session/reset tokens, story share tokens, or signed asset URLs.
- Added `dataPrivacyRequestService` to the launch gate test set.

## Notes

- The workflow records export/deletion requests and gives support an auditable queue.
- It generates export JSON for admin-reviewed `export` requests, but secure delivery remains a manual support action before fulfillment is marked.
- Migration is append-only and uses `CREATE TABLE IF NOT EXISTS` plus indexes only.

## Verification

- `pnpm exec tsx src/services/__tests__/dataPrivacyRequestService.test.ts`
- `pnpm exec tsx src/services/__tests__/userDataExportService.test.ts`
- `pnpm exec tsx src/scripts/checkMigrationFiles.ts`
- `pnpm build`
- `docker compose -f docker-compose.dev.yml exec -T api sh -c 'cd /app/services/api && pnpm exec tsx src/scripts/runAllMigrations.ts 0086_data_privacy_requests.sql'`
- `curl http://localhost:3000/api/v1/me/privacy-requests` returned `401` without a token.
- `curl http://localhost:3000/api/v1/admin/privacy-requests` returned `401` without a token.
