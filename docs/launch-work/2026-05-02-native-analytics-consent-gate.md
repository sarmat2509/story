# Native Analytics Consent Gate

Date: 2026-05-02

## Summary

- Changed analytics consent from web-only to web and native.
- Native analytics now defaults to not allowed until the stored consent value is `granted`.
- The existing consent banner now renders on native as well as web, so mobile users can explicitly accept or decline before PostHog initializes.
- Native consent is stored in a dedicated MMKV namespace for synchronous reads during app startup.
- `AnalyticsProvider` now reacts to consent changes and disables the PostHog client when consent is missing or denied.
- Added shared analytics property scrubbing for web and native event payloads, covering email, display name, prompt, story text/title, raw messages, child names, photo/media URLs, narration, and transcripts.

## Validation

- `cd apps/universal-app && pnpm type-check`
- `pnpm launch:gate`
- Chrome DevTools MCP on local `http://localhost:8082/welcome`:
  - fresh context showed the localized analytics consent banner;
  - declining stored `wondertales:analytics-consent=denied`;
  - no PostHog local storage keys were created;
  - no app console errors were emitted.
- `./scripts/deploy.sh --web`
- Chrome DevTools MCP on production `https://wondertales.art/welcome`:
  - fresh context showed the localized analytics consent banner;
  - before a choice, only same-origin document, CSS, JS, favicon, font, and image requests were made;
  - declining stored `wondertales:analytics-consent=denied`;
  - no PostHog local storage keys were created;
  - no app console errors were emitted.
- `LOG_SINCE=10m ./scripts/check-production-ops.sh` passed with `0` failures and `1` expected warning because backup smoke was skipped.
- Production Docker log grep for nginx/webapp/api errors since the deploy found only known nginx temporary-buffer warnings for the large web JS/font assets.

## Migration Notes

- No database migration was needed.
- No destructive schema operation was performed.

## Follow-Up

- Continue auditing newly added analytics events for product-safe payload names.
- Re-check consent UI on real iOS/Android builds before mobile store submission.
