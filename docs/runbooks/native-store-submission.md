# Native store submission

Last updated: 2026-05-10

This runbook is for the first WonderTales iOS App Store and Google Play submissions.
The store submission source of truth is `apps/universal-app`. Run EAS commands from
that directory unless the root Expo/EAS setup is intentionally cleaned up and
re-verified.

The repository root has an `app.config.js` guard that intentionally fails Expo
or EAS commands launched from the wrong directory. This prevents accidental
submission from the stale root native artifacts.

## Store identifiers

- iOS bundle id: `com.wondertales.app`
- Android application id: `com.wondertales.app`
- App name: `WonderTales`
- User-facing version: `1.0.0`
- Initial native build numbers: iOS `1`, Android `1`

## Preflight checks

Run these before creating store binaries:

```bash
cd apps/universal-app
pnpm type-check
pnpm lint
pnpm exec expo config --json
pnpm exec expo config --type introspect --json
```

The introspected Android manifest should keep the release permission surface to:

- `android.permission.INTERNET`
- `android.permission.READ_EXTERNAL_STORAGE` for parent-selected reference images on older Android versions
- `android.permission.MODIFY_AUDIO_SETTINGS` for narration/audio playback

The manifest should also include remove guards for permissions that are not part
of the current release:

- `android.permission.CAMERA`
- `android.permission.RECORD_AUDIO`
- `android.permission.WRITE_EXTERNAL_STORAGE`

Do not submit a build that adds location, contacts, calendar, SMS, call-log,
background location, advertising ID, or notification permissions unless the
feature, consent copy, store declarations, and policy review have been updated.

## App Store Connect

Owner-provided items:

- Apple Developer team id and App Store Connect app id, then replace the
  placeholders in `apps/universal-app/eas.json`.
- Bundle id record for `com.wondertales.app`.
- RevenueCat/App Store subscription products and entitlement mapping verified
  with `pnpm launch:check-revenuecat-catalog -- --env-file=.env.production`.
- Privacy Policy URL, Terms URL, support URL, and account deletion URL.
- App category, age rating questionnaire, content rights, screenshots, previews,
  app subtitle, promotional text, description, keywords, and support contact.
- Demo/reviewer parent account with clear notes. Do not provide an admin account.

Draft materials:

- Store listing copy: `docs/runbooks/store-listing-drafts.md`
- Privacy/data safety drafts: `docs/runbooks/store-privacy-data-safety-drafts.md`
- Reviewer/demo account flow: `docs/runbooks/store-reviewer-demo-flow.md`

Privacy Nutrition Label draft inputs to review against production behavior:

- Contact Info: email address for parent account/support.
- Identifiers: app/user account id; RevenueCat/customer identifiers if linked.
- User Content: optional parent-uploaded photos/drawings, generated story text,
  generated images, narration/audio, public story reports, feedback messages,
  and support screenshots when submitted.
- Purchases: subscription/purchase history through App Store/RevenueCat.
- Usage Data: product interaction only when analytics consent is granted.
- Diagnostics: crash/diagnostic data only for enabled SDKs/services.

Set `ITSAppUsesNonExemptEncryption=false` only if the shipped app uses standard
platform HTTPS/TLS and no custom/non-exempt cryptography.

## Google Play Console

Owner-provided items:

- Play Console app record for `com.wondertales.app`.
- Play app signing / upload key or EAS credentials decision.
- Service account JSON for `eas submit` if automated submission is used.
- Target audience and content answers. If children are included in the target
  audience, complete the Families policy review before rollout.
- IARC content rating, ads declaration, Data safety form, privacy policy URL,
  support URL, and external account deletion URL.
- Closed/internal testing track, tester list, release notes, screenshots,
  feature graphic, short description, and full description.

Data safety answers must match the app, SDKs, and public privacy policy. Google
requires every published app to complete Data safety and provide a privacy policy.

Families review notes:

- WonderTales is parent-managed: the adult creates the account, accepts legal
  terms, manages child profiles, uploads reference photos, controls purchases,
  sharing, deletion, and child mode settings.
- Do not add `com.google.android.gms.permission.AD_ID` for the current release.
- Do not transmit device identifiers from child or unknown-age users.
- Confirm any SDK used in a child-directed context is allowed for that context.

## Reviewer notes

Use this as the starting point for both stores:

```text
WonderTales is a parent-managed family storytelling app. A parent or legal
guardian creates the account, accepts Terms and Privacy, manages child profiles,
and controls optional reference photo uploads, AI story generation, narration,
sharing, purchases, child mode, data export, and deletion requests.

The app does not contain third-party ads. Analytics are gated by explicit
consent. Native subscriptions are handled through App Store / Google Play via
RevenueCat; web Stripe checkout is not used for native in-app purchases.

Optional photo access is used only when a parent chooses an image they have the
right to use as a reference for fictional illustrated story characters. The app
does not require location, contacts, SMS, call logs, advertising ID, background
location, camera capture, or microphone recording for the current release.

Public story sharing is parent-controlled. Public/unlisted stories have report
flows; unsafe/privacy reports queue the story for review and remove it from
public surfaces while reviewed.
```

## Build and submit

Builds and submissions are owner-operated. Do not run these from automation
until account ids, credentials, reviewer accounts, and store listings are ready.

Run local store build preflight first:

```bash
pnpm launch:check-store-build-preflight
```

```bash
cd apps/universal-app
eas build --platform ios --profile production
eas build --platform android --profile production
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

Keep root-level `app.json`, `eas.json`, `android/`, and `ios/` out of the native
submission path until they are either removed or intentionally rebuilt from
`apps/universal-app`.

## References

- Expo permissions: https://docs.expo.dev/guides/permissions/
- Expo app config: https://docs.expo.dev/versions/latest/config/app/
- Apple App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play Families policy: https://support.google.com/googleplay/android-developer/answer/9893335
