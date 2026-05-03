# Child-data deletion form planning

Date: 2026-05-03

## What changed

- Added a roadmap item for a parent-facing dedicated child-data deletion request form.
- The planned form should create an auditable privacy deletion request instead of relying only on `support@wondertales.art`.
- The plan keeps email support as a fallback, but makes the in-app form the preferred path for common child-data deletion requests.

## Why

The Privacy Policy says adults can request deletion of child data by contacting support. That is acceptable as a fallback, but a dedicated form is safer operationally: it can require parent authentication, capture scoped child context, route into `/admin/privacy-requests`, and reduce ad-hoc email handling of sensitive child data.

## Planned shape

- Parent-only UI entry from profile/privacy settings and child profile management.
- Request scope options for child profile, child uploads/drawings/photos, child-related stories, or full child-data deletion review.
- Adult confirmation copy before submission.
- Backend request stored as `requestType='deletion'` with structured child context in the privacy request message/context.
- Admin/support review through the existing privacy request queue.

## Notes

- This is a planning change only; implementation should follow as a separate roadmap task.
- The legal text can continue to mention support email, but the product flow should offer the form as the primary route once implemented.
