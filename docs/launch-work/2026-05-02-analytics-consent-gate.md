# Analytics Consent Gate

Date: 2026-05-02

## Summary

- Added a web analytics consent banner with accept/decline choices persisted in local storage.
- Blocked PostHog web initialization until analytics consent is explicitly granted.
- Kept analytics calls as no-ops before consent or after decline.
- Disabled PostHog autocapture, replay, surveys, product tours, dead-click capture, heatmaps, remote flags, and external dependency loading for the web client.
- Added a `before_send` scrubber for high-risk analytics property names.
- Re-runs analytics identity after consent changes, but only sends product-safe traits.
- Removed email, display name, story title, and raw generation error message properties from analytics payloads.
- Localized consent copy for `uk`, `en`, `ru`, `es`, `fr`, `de`, and `pl`.

## Privacy Notes

- Analytics events must not include child names, prompts, photos, generated story text, narration text/audio, or raw user notes.
- Current event payloads use product state such as mode, locale, wizard type, feature flags, counts, plan slug, internal ids, and boolean state.
- Native analytics still needs an explicit launch decision before mobile release; this batch gates the production web surface.

## Validation

- Parsed all i18n JSON files.
- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- `./scripts/deploy.sh --web`
- Production DevTools, `https://wondertales.art/welcome`, fresh context `prod-analytics-consent-v2`:
  - banner visible in Ukrainian;
  - before opt-in, network contained only app/static/font/image/favicon requests and no PostHog requests;
  - after accept, `wondertales:analytics-consent=granted`, banner removed, no recorder/surveys/dead-clicks/config external modules loaded, and console had no errors or warnings.
- Production DevTools, fresh context `prod-analytics-deny-v1`:
  - after decline, `wondertales:analytics-consent=denied`, no PostHog storage keys were created, no PostHog requests appeared, and console had no errors or warnings.
- Production docker logs for nginx/webapp/api after deploy showed no app/API errors; only expected nginx proxy-buffering warnings for the large web bundle and icon font asset.

## Migration Notes

- No database migration was needed.
- No destructive operations were performed.
