# Stripe Mode Ops Check

Date: 2026-05-02

## Summary

- Added a Stripe key-mode check to `scripts/check-production-ops.sh`.
- The checker classifies `STRIPE_SECRET_KEY` as `test` or `live` by prefix inside
  the production API container without printing the key value.
- The default expected mode is `test`, matching the current beta/test-mode
  verification path.
- Operators can require live mode before paid launch with:
  `EXPECTED_STRIPE_MODE=live ./scripts/check-production-ops.sh`.

## Why

The remaining Stripe roadmap item is mostly provider-side: decide whether the
test-mode webhook endpoint stays active for beta or is replaced during live-mode
setup. This code-level guard makes that decision visible in the repeatable
production ops check and prevents silently running paid launch checks against the
wrong Stripe mode.

## Verification

- `bash -n scripts/check-production-ops.sh`
- `EXPECTED_STRIPE_MODE=test ./scripts/check-production-ops.sh`
  - `PASS api Stripe secret key mode is test as expected`
  - Summary: `0` failures, `5` warnings.
  - Warnings were the existing operator/scheduler items: backup smoke skipped,
    backup retention scheduler, offsite backup target, ops monitor scheduler,
    and admin dashboard alert scheduler.

## Migration Notes

- No database migration was needed.
- No Stripe provider settings were changed.
- No secrets are printed by the check.
- No destructive operations were performed.
