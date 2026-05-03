# Public story report smoke coverage

Date: 2026-05-03

## What changed

- Added optional production smoke coverage for the public story report/support feedback path.
- `PROD_SMOKE_SUPPORT_FEEDBACK=1` or `--support-feedback` submits an authenticated `published_story` report with `supportTopic=unsafe_content` and a billing/plans refund support item with `supportTopic=refund`.
- When admin credentials or an admin token are present, the smoke verifies both items through the admin feedback filters.
- If production feedback CAPTCHA is enabled and no smoke CAPTCHA token is provided, the smoke warns on `CAPTCHA_REQUIRED` instead of pretending a report was created.
- Updated `docs/runbooks/content-quality-review.md` with the smoke workflow.

## Why

The roadmap requires the public story report/removal path and refund/support policy path to stay verified in production smoke. The existing feedback/admin flow was implemented, but this gives both support paths a repeatable release check.

## Verification

- `bash -n scripts/check-production-smoke.sh`

## Notes

- The check is opt-in because it creates a real support feedback row.
- Use a temporary QA account and close the smoke item after verification.
