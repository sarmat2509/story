# Data export delivery

Last updated: 2026-05-03

This runbook defines the secure manual path for delivering user export packages generated from `/admin/privacy-requests`.

## Policy

- Export JSON contains account, child-profile, story, consent, privacy-request, and usage data. Treat it as confidential user data.
- Do not paste export JSON into tickets, chat, logs, analytics, or issue trackers.
- Do not send raw export JSON as a plain email attachment.
- Use only the operator-approved delivery method recorded in the paid-launch environment as `WT_PRIVACY_EXPORT_DELIVERY_METHOD`.
- Keep the privacy request `in_review` until delivery is complete and the method/date are recorded in admin notes.

## Approved delivery patterns

Use one of these patterns only after the requester controls the account email:

- Encrypted archive attachment sent from the verified support mailbox, with the password/passphrase delivered through a separate approved channel.
- Approved secure file-share link with expiration, access logging, and no public indexing.
- In-person/manual delivery approved by the incident owner for exceptional cases.

## Operator checklist

1. Open `/admin/privacy-requests` and select the export request.
2. Verify requester control of the account email before generating the export.
3. Download the export JSON from the admin screen.
4. Create the encrypted package or approved secure share.
5. Send only the encrypted package/link, never raw JSON.
6. Record delivery method, delivery date, and any separate passphrase channel in admin notes.
7. Mark the request `fulfilled` only after delivery is complete.
8. Delete local temporary export files from the support workstation after confirmation.

## Retention note

Generated export downloads are support working files, not a new source of truth. Keep the request status and delivery notes in `/admin/privacy-requests`; do not keep unmanaged copies of export JSON.
