# AI Content Reporting and Quarantine

## What Changed

- Added explicit generated-content report topics:
  - unsafe image
  - unsafe text
  - privacy concern
  - other
- Extended `POST /api/v1/feedback` so story reports can carry `storyId`, `storySlug`, `shareToken`, `sceneId`, and `contentType`.
- Anonymous public content reports no longer require an email address, but still go through the feedback CAPTCHA path when production CAPTCHA is enabled.
- Content reports return a stable `report_id` to the user.
- Unsafe/privacy story reports now queue the story for review and remove it from public use by clearing publication fields and home-page visibility.
- Admin feedback now exposes story/report context so support can review reported generated content.
- Public and authenticated story screens now submit story report context through the existing feedback modal.
- SSR public story pages include a visible fallback "Report generated content" action for non-hydrated public pages.
- Public Terms, Privacy, and Support pages now describe WonderTales as a parent-managed family storytelling app where parents control setup, uploads, purchases, generation, sharing, deletion, and privacy actions.
- Public Terms, Privacy, and Support pages now disclose that WonderTales does not replace faces in existing photos or videos, does not create deceptive realistic media, and uses uploads only as optional references for safe fictional illustrated characters.

## Abuse Scenario

The highest-risk misuse is someone uploading photos of children they do not have permission to use, generating stories or images, and then publishing or sharing them. The practical controls now cover the public harm path:

- anyone can flag generated story content from public story pages;
- logged-in parents can flag generated content from their own story viewer;
- reported public/unlisted stories are removed from public access and featured surfaces until review;
- the report is preserved with enough context for admin/support follow-up.

## Remaining Hardening Ideas

- Add asset-level quarantine so the original uploaded child photos and generated scene assets can be blocked from reuse independently of the story.
- Add admin actions for `approve`, `keep quarantined`, and `delete/fulfill privacy request` from the feedback row.
- Add automated provider re-scan for reported images/text and store the moderation result next to the report.
- Add duplicate-photo/person-consent signals before generation, not only after reporting.
