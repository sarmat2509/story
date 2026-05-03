# Content Quality Review Runbook

Date: 2026-05-02

## Weekly Review

Run this checklist at least once per week during beta, and immediately after any unsafe-content report:

1. Open `/admin/dashboard` and review the `Quality review` status for the last 7 and 30 days.
2. Triage every unsafe-content report before featuring, promoting, or keeping a reported public story visible.
3. Review moderation failures and failed generation reports for recurring prompt or policy gaps.
4. Inspect repeated image validation attempts in `/admin/image-validations` and update prompts or retry guidance when the same issue repeats.
5. Review public-story reports before keeping a story in public examples or landing-page curation.
6. Curate public sample candidates from `/admin/stories?publishedStatus=published`; do not feature stories until they pass safety, parent-review, and quality checks.

## Escalation Rules

- `critical`: unsafe reports or moderation failures exist. Review before adding public examples or promoting the site.
- `warning`: failed request rate, image retry rate, generation reports, or public story reports exceed the launch thresholds. Review before the next paid acquisition push.
- `healthy`: no immediate safety signal, but sample curation still requires manual reading.

## Data Sources

- `story_requests`: failed generation and moderation-like failures.
- `stories.policy_checks`: failed story text moderation signals.
- `image_validation_results`: repeated image validation attempts.
- `user_feedback.context.supportTopic`: unsafe-content and generation-failure reports.
- `stories` public visibility fields: sample story candidates eligible for manual curation.

## Production smoke coverage

The public story report and refund/support paths can be exercised from the production smoke script with an authenticated smoke user:

```bash
PROD_SMOKE_SUPPORT_FEEDBACK=1 PROD_SMOKE_TOKEN=... ./scripts/check-production-smoke.sh --require-auth
./scripts/check-production-smoke.sh --support-feedback
```

When admin credentials or an admin token are also present, the smoke script verifies that the submitted `published_story` report appears in `/api/v1/admin/feedback?supportTopic=unsafe_content` and that the refund support smoke appears under `supportTopic=refund`.

If feedback CAPTCHA is enabled in production, provide a fresh token for the smoke submission:

```bash
PROD_SMOKE_SUPPORT_FEEDBACK=1 \
PROD_SMOKE_FEEDBACK_CAPTCHA_TOKEN=... \
PROD_SMOKE_TOKEN=... \
PROD_ADMIN_SMOKE_TOKEN=... \
./scripts/check-production-smoke.sh --require-auth --require-admin
```

Without a CAPTCHA token, the smoke treats `CAPTCHA_REQUIRED` as a warning and does not create a support item.

## Notes

- This review loop is operational only; it does not replace legal/safety policy review.
- No destructive database operations are required for this process.
