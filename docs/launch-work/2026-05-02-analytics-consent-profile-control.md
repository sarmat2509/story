# Analytics Consent Profile Control

Date: 2026-05-02

## Summary

- Added a web profile preference for changing the analytics consent choice after the first banner.
- Turning analytics on stores `granted` consent and initializes/opts in the PostHog client.
- Turning analytics off stores `denied` consent, opts out the existing PostHog client, and resets the client identity.
- Updated the consent banner to react to the same consent-change event so profile changes immediately hide the banner.
- Localized the profile analytics setting for `uk`, `en`, `ru`, `es`, `fr`, `de`, and `pl`.

## Validation

- Parsed all i18n JSON files.
- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- `./scripts/deploy.sh --web`
- Production DevTools check on `https://wondertales.art/profile`:
  - With no stored app consent, the profile row showed analytics disabled and the banner was visible.
  - Enabling analytics from the profile switch stored `granted`, changed the row to enabled, initialized PostHog, and hid the banner without a reload.
  - Disabling analytics from the profile switch stored `denied`, changed the row to disabled, cleared PostHog session storage, and kept the banner hidden.
  - The refreshed profile network traffic contained only same-origin document/script/API calls; no external recorder, survey, dead-click, or PostHog module scripts were loaded.
- Production console check showed one pre-existing accessibility issue about unnamed form fields and no runtime errors.
- Production docker log check after deployment showed only the expected nginx temporary-buffer warning for the large web bundle.

## Migration Notes

- No database migration was needed.
- No destructive operations were performed.
