# Secure export delivery policy

Date: 2026-05-03

## What changed

- Added `docs/runbooks/data-export-delivery.md` for manual user export delivery.
- Updated the admin privacy request export checklist to prohibit raw JSON as a plain email attachment.
- Updated support/incident handling to reference the secure export delivery runbook.
- Extended `pnpm launch:check-paid-readiness` with:
  - `WT_PRIVACY_EXPORT_DELIVERY_CONFIRMED`
  - `WT_PRIVACY_EXPORT_DELIVERY_METHOD`
- Added the data export delivery runbook to the paid-launch runbook placeholder audit.

## Why

The admin export generator already omits high-risk secrets and uses request-id filenames, but delivering the JSON is still a support operation. This change makes the delivery policy explicit: verify requester control, use an approved secure channel or encrypted package, record method/date in admin notes, and do not mark fulfilled until delivery is complete.

## Verification

- `bash -n scripts/check-paid-launch-readiness.sh`
- `pnpm type-check`
- Paid-readiness check with fake launch env values passed with `0` failures and `0` warnings.
