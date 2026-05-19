# Native Store Readiness

## What Changed

- Audited the root and `apps/universal-app` Expo/EAS/native store config.
- Confirmed `apps/universal-app` is the only submission-ready native app tree:
  - app id / bundle id: `com.wondertales.app`
  - display name: `WonderTales`
  - app config resolves through `apps/universal-app/app.config.js`
- Added Expo app metadata for the native app:
  - parent-managed family-storytelling description
  - iOS build number `1`
  - Android version code `1`
  - `android.allowBackup=false`
  - `ITSAppUsesNonExemptEncryption=false`
- Restricted the generated Android permission surface:
  - blocks `CAMERA`
  - blocks `RECORD_AUDIO`
  - blocks `WRITE_EXTERNAL_STORAGE`
  - keeps photo-library read access for parent-selected reference images
  - keeps audio settings access for narration playback
- Added explicit Expo plugin configuration for `expo-image-picker` and `expo-av`
  so config/prebuild output is not left with generic permission copy.
- Added native Android manifest remove guards for camera, audio recording, and
  external-storage write permissions.
- Added App Store encryption and tailored permission usage strings to the
  committed native iOS plist.
- Added `docs/runbooks/native-store-submission.md` with store preflight,
  reviewer notes, policy checklist, and human-owned submission items.

## Audit Findings

- The root `app.json` / `eas.json` and root `android/` / `ios/` trees are not
  safe submission sources. They still contain stale `wondertales-plus` /
  `com.anonymous.wondertalesplus` native identifiers and old root-native
  assumptions. Use `apps/universal-app` for native store work until the root
  setup is intentionally removed, redirected, or rebuilt.
- A root `app.config.js` guard now fails accidental Expo/EAS runs from the
  workspace root and points operators to `apps/universal-app`.
- Root `.easignore` excludes both native trees and says EAS rebuilds native
  projects. That is compatible only with a fully correct app config. The
  current root config is not the submission source.
- `apps/universal-app/eas.json` still has owner placeholders for App Store
  Connect app id and Apple team id, and no automated Android submit credentials.
  That is expected to remain owner-owned.

## Verification

- `cd apps/universal-app && pnpm exec expo config --json`
- `cd apps/universal-app && pnpm exec expo config --type introspect --json`
- `pnpm --filter wondertales-universal-app type-check`
- `git diff --check -- apps/universal-app/app.json apps/universal-app/android/app/src/main/AndroidManifest.xml apps/universal-app/ios/WonderTales/Info.plist docs/runbooks/native-store-submission.md docs/launch-work/2026-05-10-native-store-readiness.md`

The introspected Android manifest now includes `allowBackup=false`, only the
expected release permissions, and remove guards for camera, record-audio, and
write-external-storage.

`pnpm --filter wondertales-universal-app lint` currently fails on existing
app-wide ESLint/Prettier debt in source files outside this config/doc change.
Treat lint cleanup as a separate launch-readiness task before store submission.

No deploy, EAS build, EAS submit, billing logic change, or feedback/reporting
code change was performed.

## Remaining Owner Items

- Replace App Store Connect placeholders in `apps/universal-app/eas.json`.
- Decide and configure Android submit credentials/service account if using
  `eas submit`.
- Create/verify App Store Connect and Play Console app records for
  `com.wondertales.app`.
- Complete Privacy Nutrition Label, Google Data safety, Families/target audience,
  IARC/age rating, content rights, and child-safety answers.
- Confirm public privacy policy, support, terms, and external account deletion
  URLs in both stores.
- Prepare screenshots, descriptions, keywords, release notes, test track,
  reviewer account, and reviewer notes.
- Verify RevenueCat products/entitlements against native store products before
  any paid native rollout.
