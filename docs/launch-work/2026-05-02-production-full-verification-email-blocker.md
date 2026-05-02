# Production Full Verification and Email Blocker

Date: 2026-05-02

## Summary

- Re-ran the broad production smoke against `https://wondertales.art`.
- Created a temporary smoke account, elevated only that account to `admin` for read-only admin API checks, and deleted it after verification.
- Covered SSR pages, app-only noindex routes, public APIs, authenticated APIs, admin read-only APIs, CORS, public sharing, sitemap/share-card behavior, and Stripe test-mode subscription and bundle Checkout Session creation.
- Loaded hosted Stripe checkout pages for both subscription and bundle sessions.
- Used Chrome DevTools MCP to verify live authenticated UI on `/dashboard`, `/profile`, `/wizard`, `/admin/dashboard`, and `/settings/language`.
- Ran auth/recovery and production ops checks after the smoke.

## Results

- `PROD_SMOKE_CHECKOUT=1 ./scripts/check-production-smoke.sh` passed with `0 failure(s), 0 warning(s)`.
- `./scripts/check-production-auth.sh` passed with `0 failure(s), 3 warning(s)`.
- `LOG_SINCE=40m ./scripts/check-production-ops.sh --backup-smoke` passed with `0` failures and `1` warning.
- DevTools showed no console errors during the authenticated screen sweep.
- The temporary smoke account was deleted from production after the run.

## Findings

- Resend rejected production welcome email delivery because `wondertales.art` is not verified in Resend.
- Public DNS checks found no SPF TXT, no DMARC TXT, and no common Resend DKIM CNAME records for `wondertales.art`.
- The ops check's only warning was the recent API log entry for the Resend delivery failure.

## Migration Notes

- No database migration was needed.
- No destructive schema operation was performed.
- The only production data mutation was the temporary smoke account lifecycle used for verification.

## Follow-Up

- Verify `wondertales.art` in Resend.
- Add SPF, DMARC, and Resend DKIM records.
- Re-run auth smoke with a real inbox and confirm password-reset delivery.
