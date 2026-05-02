# Analytics Payload Audit Gate

Date: 2026-05-02

## Summary

- Added `scripts/check-analytics-payloads.js`, a TypeScript AST audit for
  app-side analytics calls.
- The audit checks `capture()` and `identify()` object-literal payloads outside
  the analytics provider internals.
- It fails on risky property names such as `email`, `prompt`, `story_title`,
  `story_text`, raw `message`, raw `text`, media URL/URI fields, narration, and
  child-name fields.
- Safe aggregate keys already used by the launch flows remain allowed, such as
  `has_photos`, `photo_count`, `has_children`, `children_count`, `story_id`,
  `request_id`, and plan/voice/scenario ids.
- Added the audit to `scripts/launch-gate.sh` so future analytics payload drift
  is caught before production deployment.

## Verification

- `node scripts/check-analytics-payloads.js`
- `./scripts/launch-gate.sh`

## Migration Notes

- No database migration was needed.
- No runtime analytics behavior was changed.
- No destructive operations were performed.
