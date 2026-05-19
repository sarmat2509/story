# Mobile Store Final Readiness

## Scope

Final pass for Google Play and App Store submission readiness on 2026-05-10.

Official policy anchors checked:

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play AI-generated content policy: https://support.google.com/googleplay/android-developer/answer/13985936
- Google Play Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play Families policy: https://support.google.com/googleplay/android-developer/answer/9893335

## Implemented In This Pass

- Native submission config was tightened in `apps/universal-app`:
  - app id / bundle id remains `com.wondertales.app`
  - iOS build number and Android version code are set to `1`
  - Android backup is disabled
  - iOS encryption flag is set for standard HTTPS/TLS use
  - generic permission copy was replaced with parent/photo-reference wording
  - camera, microphone recording, and write-external-storage permissions are blocked for the current release
- In-app generated-content reporting was hardened:
  - story reports now start from content-report topics, not generic bug feedback
  - reported generated content records the review/quarantine result back into feedback context
  - admin feedback now shows whether review was queued, whether content was quarantined, and which story was quarantined
- RevenueCat/native billing guardrails were added:
  - catalog checks now fail Stripe-style `price_...` / `prod_...` product ids in native RevenueCat context
  - product-plan map validation now detects missing, duplicate, unexpected, mismatched, or Stripe-like product ids
  - a new native store readiness check validates RevenueCat env, EAS production env visibility, web/native billing split, and submit placeholders
- Submission docs were added:
  - `docs/runbooks/native-store-submission.md`
  - `docs/runbooks/store-listing-drafts.md`
  - `docs/runbooks/store-privacy-data-safety-drafts.md`
  - `docs/runbooks/store-reviewer-demo-flow.md`
  - updated `docs/runbooks/paid-launch-readiness.md`
- A dedicated reviewer seed account code, `STORE_REVIEW_PARENT`, was added to
  `services/api/src/scripts/seedQaTestAccounts.ts`.
- A local store build preflight check was added:
  - `pnpm launch:check-store-build-preflight`
- Root `android` / `ios` package scripts now delegate to
  `wondertales-universal-app`, and root `dev:api` / `dev:app` filters were
  corrected to the actual workspace package names.
- `pnpm --filter wondertales-universal-app lint` now exits successfully after
  applying the repo's ESLint/Prettier fixes. Remaining legacy items are warnings,
  not blocking errors.

## Current Store Position

WonderTales is closer to a store-reviewable shape, but it is not ready for App Store / Google Play submission yet.

The remaining blockers are mostly owner-operated external setup:

- App Store Connect app record, bundle id, Apple team id, App Store Connect app id.
- Play Console app record, app signing/upload key decision, Android submit service account if using `eas submit`.
- Real App Store and Google Play subscription products, connected to RevenueCat products/offering/entitlement.
- Production EAS env values for RevenueCat public SDK keys, entitlement id, and offering id.
- Production backend env values for RevenueCat webhook authorization and production product-plan map.
- Store listing metadata, screenshots, age rating / IARC, content rights answers, review notes, and reviewer parent account.
- Apple App Privacy answers and Google Data safety answers matching actual app behavior and SDKs.
- Final policy answers for target audience / Families. Current safest framing is parent-managed family app, not child-directed Kids Category / Designed for Families unless all stricter child-directed requirements are intentionally accepted.

## Verification

Passed:

- `pnpm test:revenuecat-catalog`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-api exec tsx src/routes/__tests__/feedbackReportedScreens.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/feedbackContentReviewContext.test.ts`
- `pnpm launch:check-revenuecat-catalog -- --env-file=.env.local`
- `pnpm launch:check-revenuecat-catalog -- --env-file=.env.production`
- `pnpm launch:sync-revenuecat-catalog -- --env-file=.env.local`
- `pnpm launch:check-store-build-preflight`
- `pnpm --filter wondertales-universal-app lint`
- `plutil -lint apps/universal-app/ios/WonderTales/Info.plist`
- `cd apps/universal-app && pnpm exec expo config --json`
- `cd apps/universal-app && pnpm exec expo config --type introspect --json`
- `git diff --check`

Expected failures:

- `pnpm launch:check-native-store-readiness -- --env-file=.env.production`
  currently fails for true production native readiness because the local
  production env still points at RevenueCat Test Store SDK keys/product ids, and
  both `eas.json` files still contain owner-owned App Store Connect placeholders.
- RevenueCat API access currently auto-discovers the Test Store target for the
  configured project. Production App Store / Google Play RevenueCat apps and
  products still need to be created/connected before the native production
  product map can be generated and applied.

## Important Caveats

- `apps/universal-app` is the only native submission source of truth right now.
- Root-level `app.json`, `eas.json`, `android/`, and `ios/` are stale or inconsistent and should not be used for EAS store builds. Root `app.config.js` intentionally blocks Expo/EAS runs from the wrong directory.
- Native users must not be led to Stripe/web checkout for digital subscriptions. Web can keep Stripe; iOS and Android must use App Store / Google Play Billing through RevenueCat.
- Native one-time bundles should remain unavailable until matching store one-time products and reviewed copy exist.
