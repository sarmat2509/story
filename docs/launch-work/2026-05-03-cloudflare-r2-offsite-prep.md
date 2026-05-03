# Cloudflare R2 offsite backup prep

Date: 2026-05-03

## Context

Cloudflare Free DNS was being activated for `wondertales.art`, and a private Cloudflare R2 bucket was prepared for offsite production backups. The R2 credentials were added to the local production env using the existing launch names:

- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_ENDPOINT`
- `CLOUDFLARE_R2_BUCKET`
- `OFFSITE_BACKUP_RCLONE_TARGET`

The target convention is `wondertales-r2-crypt:wondertales/prod`, with encrypted backup delivery handled by rclone rather than by the application runtime.

## Local changes

- Added `scripts/configure-r2-rclone.sh` and `pnpm launch:configure-r2-rclone` to configure a Cloudflare R2 rclone remote plus an encrypted crypt remote.
- The helper supports dry-run validation, a safe status report, and an optional smoke write/read/delete under the encrypted offsite target.
- Bucket-scoped R2 credentials are allowed to warn on account-wide bucket listing; the required checks are direct bucket reachability and encrypted target reachability.
- Updated `scripts/install-production-ops-cron.sh` so the daily backup cron loads `BACKUP_ENV_FILE` and no longer hard-codes `--skip-offsite`; once rclone is configured, the existing daily backup job can copy artifacts offsite.
- The ops cron installer also uploads `scripts/configure-r2-rclone.sh` to the droplet so the R2 helper is available after deploy/cron installation.
- Updated `docs/runbooks/production-operations.md` with the R2/rclone setup flow and the crypt recovery-file warning.

## Remote result

- The R2/offsite env rows are present in the droplet `.env.production`; the previous file was backed up before those rows were added.
- `rclone` is installed on the droplet.
- `pnpm launch:install-production-ops-cron -- --apply` installed the updated daily backup cron and uploaded the R2 helper script to the droplet.
- `./scripts/configure-r2-rclone.sh --apply --smoke` configured `wondertales-r2` and `wondertales-r2-crypt`, wrote a private crypt recovery file, verified bucket and encrypted target reachability, and completed an encrypted write/read/delete smoke.
- `./scripts/run-production-backup-retention.sh --local --apply` created and validated a fresh production DB dump and uploads archive, applied local retention, and copied the artifacts to encrypted R2.
- R2 now contains the decrypted crypt-view names for the fresh backup set: DB dump, DB checksum, uploads archive, and uploads checksum.
- `LOG_SINCE=30m ./scripts/check-production-ops.sh` passed with `0` failures and `2` warnings: backup smoke skipped in read-only mode and admin dashboard alert scheduler missing. The offsite backup target warning is gone.
- The follow-up offsite restore drill is documented separately in `docs/launch-work/2026-05-03-offsite-restore-drill.md`.

## Cloudflare DNS note

Cloudflare shows `wondertales.art` as Active on the Free plan, and public health checks still return `200` for `https://wondertales.art/health`. Cloudflare/Google DoH checks confirm that `wondertales.art` and `www.wondertales.art` now resolve to Cloudflare edge IPs while `mail.wondertales.art` remains DNS-only on the origin IP.

## Remaining follow-up

- Reinstall production ops cron with `pnpm launch:install-production-ops-cron -- --apply --include-admin-alerts` once the alert webhook/auth is also ready.
