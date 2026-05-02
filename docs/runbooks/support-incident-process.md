# Support and incident process

Last updated: 2026-05-02

This runbook keeps common support cases inside admin, Stripe, and the feedback inbox instead of ad-hoc database access.

## Intake paths

- In-app feedback modal: stores message, optional screenshot, reported screen, URL, user account, and `supportTopic`.
- Support email: `support@wondertales.art`.
- Privacy admin queue: `/admin/privacy-requests` for export and deletion requests.
- Stripe dashboard: source of truth for charges, invoices, refunds, disputes, and hosted customer portal activity.

## Feedback topics

- `billing`: payment failed, checkout, subscription, portal, quota, or invoice issue.
- `refund`: refund review request. Cancellation alone is not an automatic refund.
- `unsafe_content`: public story report, unsafe generation, or child-safety concern.
- `generation_failed`: failed queued story/audio/image generation or quota confusion after failure.
- `account_privacy`: account, child data, export, deletion, or privacy question.
- `bug`, `feature`, `other`: general product feedback.

## Common lookup flow

1. Open `/admin/feedback` and filter by support topic or search by account email, contact email, URL, screen, or message text.
2. Check screenshot and reported screen context before asking the parent to repeat details.
3. For account/billing cases, open `/admin/users` and search by email. Confirm plan, period dates, and usage counters.
4. For story cases, open `/admin/stories`; for image-quality or unsafe-generation cases, use validation/admin story detail screens where available.
5. For export/deletion cases, use `/admin/privacy-requests` and keep status plus internal notes current.
6. For payments, verify the matching Stripe customer, subscription, invoice, checkout session, charge, and event log.
7. Check production logs only for correlation and errors; do not paste secrets or child content into tickets.

## Response templates

### Payment issue

Subject: WonderTales payment check

Hi,

Thanks for reporting this. We are checking the payment provider event, your subscription status, and the billing portal state for the account email you used with WonderTales.

If payment needs attention, please update the payment method in the billing portal. We will follow up after the provider confirms whether the payment succeeded, failed, or is still pending.

### Refund request

Subject: WonderTales refund review

Hi,

Thanks for contacting us. Refunds are reviewed by support and are not automatic when a subscription is canceled. We will check the account email, charge date, invoice, plan usage, and applicable payment-provider rules before confirming the outcome.

Please send the account email and approximate charge date if they were not included in your first message.

### Deletion or export request

Subject: WonderTales data request

Hi,

We received your data request. For account, child-profile, upload, or story export/deletion, we will verify that the requester controls the account and then process the request through our privacy request workflow.

Some billing, security, consent, legal, or abuse-prevention records may be retained where required or reasonably necessary.

### Unsafe content report

Subject: WonderTales safety report

Hi,

Thank you for reporting this. We are reviewing the story, prompt context available to support, generated assets, and moderation/validation signals. If the story is public, we may unpublish or restrict it while the review is open.

Please do not send additional child photos or sensitive child details unless support specifically asks for the minimum needed to identify the issue.

### Failed generation

Subject: WonderTales generation issue

Hi,

Thanks for reporting the failed generation. We are checking the story request, job status, provider response, and quota state for your account. If the request permanently failed after being accepted, support will confirm whether a quota adjustment or retry is appropriate.

## Incident checklists

### Outage

- Confirm `/api/health`, `/api/v1/public/stories`, landing SSR, pricing SSR, auth, and dashboard load.
- Check production API/web container status and recent error logs.
- Update support with scope, started time, workaround, and next checkpoint.

### Payment/webhook failure

- Confirm Stripe webhook endpoint status and recent event delivery.
- Check API logs for `Processing Stripe webhook`, checkout creation, grant, subscription update, or payment-failed messages.
- Verify `/api/v1/me/subscription-usage` for an affected QA account.
- Do not grant paid access manually unless owner approves the support action.

### Unsafe generation or public report

- Preserve the feedback item, screenshot, story id/URL, and validation evidence.
- Restrict public visibility first if child-safety risk is plausible.
- Review related prompts/assets through admin-safe screens.

### Data leak or privacy concern

- Escalate immediately to the owner.
- Preserve logs and affected identifiers.
- Stop the relevant public access path before analysis if exposure is active.
- Use privacy request status and notes for auditable follow-up.

### Queue backlog

- Check job queue depth, worker logs, provider errors, and rate-limit signals.
- Pause broad retries if the provider is returning systematic failures.
- Prioritize paid parent accounts and safety-related stuck work.

## Production verification

- Submit a feedback item from `/billing/plans` with a billing/refund topic.
- Confirm it appears in `/admin/feedback` with topic, screen, URL, user/contact, and screenshot where available.
- Search/filter by topic and email.
- Check production logs for the feedback insert with no errors.
- For Stripe cases, pair the support item with the relevant Stripe customer/subscription/invoice and the steps in `docs/runbooks/stripe-test-mode.md`.
