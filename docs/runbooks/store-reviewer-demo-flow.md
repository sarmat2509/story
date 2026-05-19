# Store Reviewer Demo Flow

Last updated: 2026-05-10

This flow is for App Store and Google Play reviewers. It should use a normal
parent account, not an admin account.

## Seed Account

The API seed script can create a dedicated parent reviewer account:

```bash
pnpm --dir services/api seed:test-accounts --only=STORE_REVIEW_PARENT
```

Useful env overrides:

```env
QA_TEST_EMAIL_DOMAIN=wondertales.art
QA_TEST_EMAIL_PREFIX=review
QA_TEST_DEFAULT_PASSWORD=<owner-generated-review-password>
QA_TEST_LOCALE=en
```

Expected generated email:

```text
review.store_review_parent@wondertales.art
```

The account includes:

- parent display name
- free plan subscription row
- seeded child profile
- seeded character fixture
- parent pseudonym/about-me fields

The script does not upload real photos and does not create public stories. Add
those manually only if a reviewer path needs them.

## Reviewer Path

1. Sign in with the parent reviewer account.
2. Open Dashboard and confirm the parent-managed app shell.
3. Open Children and inspect the seeded child profile.
4. Open the child profile Access tab and confirm parent controls.
5. Open Wizard and create or inspect a story for the seeded child.
6. Open the story viewer and use Report issue.
7. Choose unsafe image, unsafe text, privacy concern, or other.
8. Open Published stories or a public story and verify reporting is also available there.
9. Open Plans and verify native subscription copy and restore purchases.
10. Open Profile and verify analytics consent, data export/deletion request, and account settings.

## Reviewer Notes Snippet

```text
Please use the provided parent reviewer account. WonderTales is parent-managed:
the adult creates child profiles, controls optional reference image uploads,
story generation, sharing, subscriptions, child mode, and privacy/deletion
requests.

Native subscriptions are handled through App Store / Google Play via RevenueCat.
Web Stripe checkout is not used for native in-app purchases.

To test content safety reporting, open any story and tap Report issue. Reports
for unsafe images, unsafe text, privacy concerns, or other issues are queued for
review and can quarantine public content while reviewed.
```

