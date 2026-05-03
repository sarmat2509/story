# Remaining actions after autonomous launch batch

Date: 2026-05-03

## Completed in this batch

- Billing entry routing for guest web, parent sessions, and child sessions.
- Billing state invalidation after checkout/portal returns.
- Analytics URL/token scrubbing and static analytics payload audit.
- Paid-launch readiness gate and runbook.
- Production smoke support feedback/report coverage.
- Parent-facing child-data deletion request form.
- Profile actions for account-level data export and deletion-review requests.
- Parent-visible recent privacy request statuses in Profile.
- Secure export delivery policy and paid-readiness checks.
- Static tracked-migration number gate after `0052_create_schema_migrations.sql`.
- Production admin read-only smoke and admin dashboard alert dry-run with owner-supplied admin credentials.
- Production security artifact audit archived under `docs/launch-work/artifacts/production-security-2026-05-03-admin-check/`.
- Disposable production Child Mode passcode smoke with child profile cleanup and temporary account deletion.
- Local Stripe checkout protection for stored customer ids that belong to a different active Stripe key mode.
- `pnpm launch:gate` passed for the full local batch.
- A production deploy attempt was stopped before upload/restart/migrations because local Docker became unresponsive during the API image build; follow-up live health and public smoke stayed green.
- Production ops backup smoke passed with a verified PostgreSQL custom-format dump; remaining durable ops warnings are offsite backup target and admin alert scheduler.
- Production deploy retry completed after restoring SSH-agent/Docker access.
- Post-deploy public smoke, security artifact scan, admin read-only smoke, admin alert dry-run, fresh API log scan, and production ops read-only check passed.
- Deployed Stripe active-key-mode retry was verified on a disposable account, with created Stripe/session/account artifacts cleaned up.

## Still blocked by owner/operator decisions

- Confirm legal operator, registered address, and merchant/payment-provider disclosure.
- Record owner stage decision: free beta, FOP bridge, Ukrainian TOV, Spanish structure, Merchant of Record, or adviser-approved alternative.
- Confirm paid-launch tax/adviser review.
- Assign launch incident owner and escalation contact.
- Confirm support inbox value in the paid-launch environment.
- Approve the secure privacy export delivery method.
- Offsite backup target and restore drill are now complete through encrypted Cloudflare R2.
- Ops/admin alert scheduling, admin alert auth, and Telegram alert delivery are now complete.
- Approve production orphan cleanup apply mode and retention/deletion window.
- Confirm billing-record retention wording with legal/operator context.

## Still needs live follow-up

- Re-run full production smoke during launch windows with a disposable parent smoke account and admin read-only credentials.
- Live provider failure smoke for story/audio/image generation and Child Mode queue retry behavior.
- Production security artifact checker after any deploy that changes nginx headers, SSR HTML, or exported web bundle.
- Production route-log monitoring during the first external beta window.

## Ongoing launch operations

- Weekly quality/safety review of failed moderation, unsafe reports, poor generation, and repeated image validation retries.
- Keep public story report/removal path covered in production smoke.
- Expand the analytics payload audit if new event naming conventions appear.
- Curate real sample stories before adding more public examples.

## Readiness check result without operator env

`pnpm launch:check-paid-readiness` now fails as expected with `15` operator/environment failures and `0` warnings. All runbook placeholder checks pass.
