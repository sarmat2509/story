# Paid launch readiness

Last updated: 2026-05-03

This runbook tracks the launch items that require an explicit owner decision or external secret/configuration. The codebase can verify that these items are present, but it must not invent them.

Run the check before enabling live paid checkout, paid ads, annual plans, or broad public acquisition:

```bash
pnpm launch:check-paid-readiness
```

For native App Store / Google Play readiness, also run:

```bash
pnpm launch:check-native-store-readiness -- --env-file=.env.production
pnpm launch:check-revenuecat-catalog -- --env-file=.env.production
```

The check intentionally sits outside `pnpm launch:gate`. Public beta builds should keep moving while operator-owned paid-launch decisions are pending, but paid launch should not proceed until this check passes.

## Required confirmations

Set these in the operator shell, production secret store, or CI environment used for paid-launch verification. Do not commit secret values.

- `WT_LEGAL_OPERATOR_CONFIRMED=1`: legal operator, registered address, and merchant-of-record disclosure are approved for paid use.
- `WT_LEGAL_OPERATOR_NAME`: the same operator name used in Terms, Privacy, payment provider records, invoices/receipts, support templates, and launch notes.
- `WT_OWNER_STAGE_DECISION`: one of `free_beta`, `fop_bridge`, `ukrainian_tov`, `spanish_structure`, `merchant_of_record`, or another adviser-approved value recorded in launch notes.
- `WT_PAYMENT_RECORD_OPERATOR`: the operator name or merchant record configured in the payment provider.
- `WT_TAX_ADVISER_REVIEW_CONFIRMED=1`: paid-launch structure was reviewed for the owner's current tax/residency constraints.
- `WT_INCIDENT_OWNER`: the person/account responsible for production launch incidents.
- `WT_ESCALATION_CONTACT`: the backup escalation contact or rotation destination.
- `WT_SUPPORT_EMAIL`, `SUPPORT_EMAIL`, or `FROM_EMAIL`: support inbox used for customer-visible support and incident follow-up.
- `WT_PRIVACY_EXPORT_DELIVERY_CONFIRMED=1`: secure export delivery method is approved for paid users.
- `WT_PRIVACY_EXPORT_DELIVERY_METHOD`: approved delivery method label, such as encrypted archive plus separate passphrase channel or approved expiring secure file share.
- `OFFSITE_BACKUP_RCLONE_TARGET`: encrypted offsite backup target configured for production database and upload-volume artifacts.
- `WT_OFFSITE_RESTORE_DRILL_CONFIRMED=1`: an offsite backup was restored to a non-production target and verified.
- `OPS_ALERT_WEBHOOK_URL` or Telegram alert env: external alert destination for production ops failures.
- `ADMIN_ALERT_WEBHOOK_URL`, `OPS_ALERT_WEBHOOK_URL`, or Telegram alert env: external alert destination for admin dashboard cost, queue, and quality-review alerts.
- `PROD_ADMIN_ALERT_TOKEN` or `PROD_ADMIN_ALERT_EMAIL` plus `PROD_ADMIN_ALERT_PASSWORD`: admin dashboard alert checker authentication.

## Native store confirmations

These remain human-owned because they live in App Store Connect, Play Console,
RevenueCat, EAS account env, or reviewer notes rather than in the repository.

- EAS production build env exposes `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`, `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`, and `EXPO_PUBLIC_REVENUECAT_OFFERING_ID`.
- App Store Connect has approved subscription products matching `com.wondertales.<plan>.monthly`.
- Google Play Console has active subscriptions/base plans matching `com.wondertales.<plan>:monthly`.
- RevenueCat offering/packages attach only App Store, Google Play, or Test Store product ids; no Stripe `price_...` or `prod_...` ids are present.
- RevenueCat webhook points to `/api/v1/billing/webhook/revenuecat` and sends the same Bearer value configured in `REVENUECAT_WEBHOOK_AUTHORIZATION`.
- Native review notes explain that web uses Stripe but iOS/Android digital subscriptions are purchased and restored in-app through the store account.
- Native one-time bundles stay disabled until matching store one-time products and policy-reviewed copy exist.

## Operator notes

If Ukrainian FOP is used, keep it marked as a temporary validation bridge in launch notes. Re-check the operating structure before broad EU paid traffic, paid ads, annual plans, or material recurring revenue.

Before live paid launch, the public legal pages and payment provider records should describe the same real operator. If those records differ, pause checkout setup until the mismatch is resolved.

The offsite restore drill should use a separate database or temporary Postgres container. Do not restore over production during a readiness check.

Critical incidents use the owner and escalation contact configured above. Keep child prompts, uploaded photos, story text, raw emails, tokens, and payment secrets out of incident notes.

User export packages must follow `docs/runbooks/data-export-delivery.md`. Do not send raw export JSON as a plain email attachment.
