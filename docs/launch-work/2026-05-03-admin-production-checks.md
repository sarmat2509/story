# Admin production checks and follow-up fixes

Date: 2026-05-03

## Checks run

- Production admin read-only smoke with owner-supplied admin credentials passed with `0` failures. The only warning was expected because no regular smoke user token was supplied and remote log tailing was disabled for the local run.
- Admin dashboard external-alert checker dry-run passed with `severity=info`, `findingCount=0`, and no alert sent.
- Non-mutating authenticated/admin production smoke passed with `0` failures while checkout creation and remote log tailing stayed disabled.
- Full production smoke against the long-lived admin account was intentionally allowed to create only cleanup-safe fixtures. It found two blockers:
  - subscription and bundle checkout returned Stripe `resource_missing` for a stored customer id from a different Stripe key mode;
  - Child Mode fixture creation failed on that account with `CHILD_PROFILE_LIMIT_EXCEEDED`, so full smoke should use a disposable parent smoke account instead of the main admin account.
- Disposable Child Mode smoke passed after the local fixture fix: child profile creation, Child Mode controls update, child-session creation, child-safe usage, parent API guard, child cleanup, and temporary account deletion all completed successfully.
- Production ops read-only check passed with `0` failures and warnings for known launch operations follow-up: backup smoke skipped in that read-only run, offsite backup target reference missing, admin dashboard alert scheduler reference missing, and recent logs containing the Stripe customer key-mode errors from the failed full-smoke checkout branch.
- Production security artifact checker passed against `wondertales.art` and archived headers/report under `docs/launch-work/artifacts/production-security-2026-05-03-admin-check/`.
- `pnpm launch:gate` passed after the local fixes, including shared/API builds, critical API tests, new app utility tests, web type-check/export, manifest, client secret, security-header, analytics-payload, and API production asset checks.
- The first production deploy attempt after the green launch gate stopped during the local Docker API image build because the local Docker daemon stopped responding before image upload. The script did not reach upload, restart, or migrations.
- Post-abort production checks confirmed no partial deploy reached the droplet: `/health` returned healthy, containers were still the pre-existing `api`, `webapp`, `nginx`, and `postgres` instances, and public production smoke passed with `0` failures.
- Production ops backup smoke then passed with `0` failures and `3` warnings. It created a `3.1 MB` custom-format PostgreSQL dump in the production backup mount and verified it with `pg_restore -l`; the warnings at that point were offsite backup target missing, admin dashboard alert scheduler missing, and known pre-deploy Stripe customer key-mode log lines.
- After restoring SSH-agent access and Docker responsiveness, `./scripts/deploy.sh --api --web` completed successfully: API image build/upload, `.env.production`, Google service account upload, API restart, nginx config validation/recreate, post-deploy migrations, web export/upload, and webapp recreate all succeeded.
- Post-deploy public smoke passed with `0` failures, production security artifact scan passed, admin read-only smoke passed with `0` failures, admin alert dry-run returned no findings, fresh API logs had no error/warn/failure lines, and production ops read-only check passed with `0` failures.
- The deployed Stripe active-key-mode customer retry was verified on a disposable account. The smoke seeded a bogus `stripe_customer_id`, created a Stripe Checkout Session successfully, confirmed the stored customer id was replaced, expired the created Checkout Session, deleted the created Stripe test customer, deleted the temporary WonderTales account, and verified `0` remaining user rows.

## Local fixes prepared

- `services/api/src/services/billingService.ts` now detects Stripe `resource_missing` customer errors caused by a stored customer id from the wrong active key mode.
- Subscription and bundle checkout creation now retry once by creating a new Stripe customer with the active key, updating the stored `stripeCustomerId`, and recreating the Checkout Session.
- `services/api/src/services/__tests__/stripeCustomerMode.test.ts` covers the customer-mode error classifier, and `scripts/launch-gate.sh` includes it in the API launch tests.
- `scripts/check-production-smoke.sh` now sends `childModePasscode` before enabling Child Mode in the temporary fixture, matching the production API requirement.

## Verification

- `pnpm exec tsx src/services/__tests__/stripeCustomerMode.test.ts`
- `pnpm build`
- `pnpm exec tsx src/services/__tests__/stripeInvoiceSubscription.test.ts`
- `pnpm exec tsx src/routes/__tests__/billingReturnUrls.test.ts`
- `bash -n scripts/check-production-smoke.sh`
- `pnpm launch:gate`
- `curl -fsS https://wondertales.art/health`
- `./scripts/check-production-smoke.sh --no-remote`
- `./scripts/check-production-ops.sh --backup-smoke`
- `pnpm launch:check-production-security-artifacts -- --output-dir docs/launch-work/artifacts/production-security-2026-05-03-admin-check`
- `./scripts/deploy.sh --api --web`
- `pnpm launch:check-production-security-artifacts -- --output-dir docs/launch-work/artifacts/production-security-2026-05-03-post-deploy`
- Disposable Stripe retry smoke with temporary account, Checkout Session expiry, Stripe test customer deletion, and account deletion.
- Admin read-only smoke after deploy.
- Admin dashboard alert checker dry-run after deploy.
- `LOG_SINCE=10m ./scripts/check-production-ops.sh`

## Follow-up

- Keep running full production smoke during launch windows with a disposable parent smoke account plus admin read-only credentials.
- Keep the primary admin account out of mutation-heavy smoke fixtures because child-profile limits can make the fixture fail for account-state reasons unrelated to Child Mode.
- Keep support-feedback smoke opt-in because it creates real support feedback rows that need manual closure.
- Configure the offsite backup target and admin-dashboard alert scheduler before paid public launch.
