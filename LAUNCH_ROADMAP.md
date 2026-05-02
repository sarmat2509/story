# WonderTales Web Launch Roadmap

Last updated: 2026-05-02

This roadmap describes what must be finished before opening WonderTales to real web users.
It intentionally focuses on launch blockers only. Improvements that can happen after real usage starts are separated into later priorities.

## Scope

### In scope for this launch

- Public web landing pages and story pages.
- Web account creation and sign-in.
- Parent-owned accounts.
- Supervised child use inside a parent account.
- Personalized story generation.
- Character, child profile, drawing/photo, illustration, audio, and read-along flows.
- Public/private story sharing.
- Web subscriptions, bundles, usage limits, and Stripe billing.
- Localization for visible web UI.
- Production security, privacy, observability, backups, and support readiness.

### Out of scope for this launch

- Native iOS and Android app-store launch.
- Native in-app purchases / RevenueCat.
- Full offline mode.
- Multi-server storage/CDN/S3 migration unless required by production topology.
- Advanced admin dashboards beyond what is needed for safety, support, and billing operations.
- Broad content marketplace/community mechanics.

## Launch Definitions

### Internal Dogfood

Only the team uses the product. Manual fixes and direct database inspection are acceptable.

### Closed Beta

Small invited group. No broad indexing, no public acquisition, no paid traffic.
The team can manually support users, but privacy/security/payment blockers must already be closed.

### Public Web Beta

Anyone can discover the site, sign up, create stories, and use free limits.
Payments may be enabled only if the payment gate below is complete.

### Paid Public Launch

Subscriptions and bundles are available to normal users without manual intervention.
All billing, refund, cancellation, quota, and support paths must work end to end.

## Priority Levels

- P0: Must be completed before closed beta with external families.
- P1: Must be completed before public web beta.
- P2: Must be completed before paid public launch or during the first active beta window.
- P3: Post-launch improvements that are useful but not blockers.

## P0 - External User Blockers

### P0 Status Snapshot - 2026-05-02

Current overall state: backend launch guardrails are much stronger than the original roadmap baseline, and the main production web/TLS/SSR/security path has been verified on `wondertales.art`. P0 is not fully green for external families until full Google OAuth completion, password-reset inbox delivery, final operator/legal confirmations, and approved cleanup policy are finished.

Completed or ready for closed-beta verification:

- Public route guardrails for pricing/legal/footer/support/noindex/robots were implemented and locally verified.
- Legal pages and consent gates exist for the current beta flow.
- Private asset access is enforced for generated and uploaded child-related assets.
- Story, audio, bundle, premium voice, child-profile, image-count, and story-from-drawing limits are now enforced server-side.
- Story/audio quota reservations now release through compensating usage events when queue enqueue or final generation fails before a usable artifact is created.
- Prompt, generated-text, generated-image, photo-input, and publishing safety gates are in place.
- Story/account/child-profile deletion behavior was hardened and documented.
- Parent-session guards now block child sessions from billing, plan actions, profile editing, uploads, and story writes.
- Sensitive route rate limits, credentialed CORS restrictions, upload validation, admin health guards, and debug route guards are in place.
- Child Mode now has scoped sessions, parent controls, child-safe story request enforcement, attribution, password and OAuth-only parent-gate fallbacks, start/return UI, child-safe story creation UI, allowed content selectors, and parent review workflow UI.
- Scheduled orphan-file cleanup exists with disabled/dry-run defaults, retention-age gating, and launch-gate coverage.
- API build, web type-check, web export, and `pnpm launch:gate` passed after the P0 fixes.
- Production deploy path was exercised on 2026-05-02: API/webapp/nginx deployed, 15 pending migrations applied, production SSR pricing/legal/stories/sitemap routes smoke-tested, security headers captured, and DevTools live checks completed.
- Production `www.wondertales.art` certificate coverage and canonical redirect to `wondertales.art` were fixed and verified.
- Production API and Postgres ports are now bound to `127.0.0.1`; public access goes through nginx/TLS.
- Production Google OAuth start now redirects from the web UI to Google with `redirect_uri=https://wondertales.art/api/v1/auth/google/callback`; DevTools reaches the Google sign-in screen without redirect mismatch.
- Production password reset endpoints return the expected privacy-preserving and invalid-token responses; the deployed API has `RESEND_API_KEY` and `FROM_EMAIL` configured.
- Production full smoke on 2026-05-02 passed with `0` failures and `0` warnings across SSR pages, app-only noindex pages, public APIs, authenticated user APIs, admin read-only APIs, CORS, and Stripe test-mode subscription/bundle checkout creation.
- Auth/login, register, parent-gate, and `/api/v1/me` user responses now omit sensitive fields such as `passwordHash` and `stripeCustomerId`; production smoke verifies the omission.
- Email/password login and registration now reset the web app to `/dashboard` after a successful auth mutation; DevTools verified the production redirect in a clean browser context.
- Stripe bundle checkout now works even when no static Stripe bundle Price ID is configured, using inline Checkout `price_data` derived from the production bundle catalog.

Remaining P0 bottlenecks:

- Google OAuth still needs a real account completion check through the callback, session cookie, and post-login app route.
- Password-reset email still needs sender DNS (`SPF`, `DMARC`, Resend DKIM) and real inbox delivery verification for `noreply@wondertales.art`.
- Legal/operator details must be finalized before paid launch, and non-`en`/`uk` legal alternates must either receive real legal content or stay out of indexed launch routes.

Solutions not yet applied:

- OAuth-only parent gate fallback is implemented locally for web Google re-auth and native Google/Apple token re-auth; production still needs a real-account Google callback completion check.
- Scheduled orphan-file cleanup policy/job is implemented with disabled/dry-run defaults and a retention-age gate; production apply mode still requires live dry-run review and operator approval.

### 1. Stabilize Public Web Routes

Status on 2026-05-02: Ready for closed-beta verification; local/server code fixes are done and production domain smoke checks passed.

Done:

- `/pricing` and localized pricing ownership were separated from the React billing screen.
- `/terms` and `/privacy` now render real SSR legal content instead of placeholders.
- Unknown public routes and app-only routes received noindex/404 guardrails.
- `robots.txt` and sitemap behavior were tightened to avoid indexing API/app-only paths.
- Footer links now include legal, pricing, and support routes.
- Public SSR pages now declare favicon/apple-touch-icon links, and dev nginx serves core public icon assets without requiring Metro.
- Production `/`, `/en/`, `/pricing`, `/en/pricing`, `/terms`, `/en/terms`, `/privacy`, `/en/privacy`, `/stories`, `/sitemap.xml`, `/health`, and a sample public story returned expected statuses after deploy.
- `www.wondertales.art` now has valid TLS and redirects to the apex domain.

Remaining:

- Keep monitoring production SSR route logs during the first external beta window.

Historical production findings that triggered this work and were re-checked after deploy:

- `https://wondertales.art/pricing` timed out / returned `504`.
- `https://wondertales.art/en/pricing` returned `502`.
- `https://wondertales.art/terms` returned `502` intermittently.
- `https://wondertales.art/privacy` rendered, but the body was `Content not available.`
- Unknown routes return the SPA shell with HTTP 200, creating soft-404s.
- `robots.txt` currently allows all paths.

Completed required work:

- Fix `/pricing` and localized pricing routes.
- Fix `/terms` and `/privacy`.
- Return proper 404 status for unknown non-SPA public routes.
- Keep app-only routes as SPA routes where appropriate, but prevent them from being indexed.
- Add footer links to Terms, Privacy, Pricing, Contact/Support, and optionally Cookies.
- Ensure all landing-page CTA links lead to working routes.

Acceptance criteria:

- `/`, `/en/`, `/pricing`, `/en/pricing`, `/terms`, `/privacy`, `/stories`, and sample story pages return stable 200 responses.
- Unknown public routes return 404 or a noindex error page.
- `curl -I` and browser navigation agree on route status.
- Sitemap contains only routes that are ready for indexing.

### 2. Legal, Privacy, and Consent Content

Status on 2026-05-01: Mostly ready for closed beta; legal/entity and locale decisions remain.

Done:

- Terms and Privacy markdown exist for `en` and `uk`.
- The documents cover child data, photos/drawings, AI content, public sharing, cancellation/refunds, cookies, deletion/retention, and support contact.
- Sign-up requires Terms, Privacy, and adult guardian confirmation.
- Child data/photo flows require explicit child data consent.
- Public publishing requires explicit publish consent and safety checks.
- Consent records store user, consent type, document version, timestamp, and audit context.
- Public SEO locale exposure is now limited to `uk` and `en`, matching the current launch-ready legal content set.

Remaining:

- Finalize the legal operator/entity/Merchant-of-Record disclosure before paid launch.
- Add real legal content before adding any more indexed launch locale beyond `uk` and `en`.
- Child self-use consent remains blocked by the unfinished Child Mode product flow.
- Cookie/analytics consent UI still needs a jurisdiction review before broader public acquisition.

WonderTales handles child profiles, child names, drawings, photos, generated images, generated story text, narration/audio, and sharing. Empty legal pages are a launch blocker.

Required documents:

- Legal operator disclosure for the current launch stage.
- Terms of Service.
- Privacy Policy.
- Children's Privacy Notice.
- Parental Consent Notice.
- Cookie / tracking notice.
- Refund and cancellation policy.
- Data deletion and retention policy.
- AI-generated content disclaimer.
- Public sharing / publishing policy.

Required consent flow:

- During sign-up, the user confirms they are an adult parent or legal guardian.
- The user accepts Terms and Privacy.
- The user gives explicit consent before adding child data or uploading child photos/drawings.
- The user gives explicit consent before enabling child self-use.
- The user gives explicit consent before publishing a story publicly.
- Consent records store document versions, timestamp, user id, and consent type.

Acceptance criteria:

- Public legal pages clearly identify the service operator for the current stage: individual, Ukrainian FOP, Ukrainian TOV, Spanish entity, or Merchant of Record-backed structure.
- Legal pages have real content in at least the launch languages.
- Sign-up cannot complete without Terms/Privacy acceptance.
- Child data cannot be created without parental/guardian consent.
- Public publishing cannot happen accidentally.
- Support can answer: what data is stored, why, where, for how long, and how it is deleted.

### 3. Private-by-Default Asset Access

Status on 2026-05-01: Ready for closed-beta verification.

Done:

- Private story assets now require authenticated ownership.
- Public asset access is limited to published stories and valid unlisted/share-token contexts.
- Rejected/debug/moderation assets are not exposed as public child-facing assets.
- Story deletion, unpublish, and account deletion paths clean up or revoke asset access.
- Asset access and deletion tests were added/updated.

Remaining:

- Re-test against the final production storage/CDN topology if local storage is replaced or fronted by a CDN.
- Production apply-mode orphan-file cleanup still needs target-environment dry-run review before activation.

Generated images/audio and uploaded child-related files must not be public by raw storage path unless the story is explicitly public.

Required work:

- Make private story assets require authenticated ownership.
- Allow public asset access only for published stories or signed/unlisted share links.
- Ensure rejected/debug/moderation assets are never public.
- Ensure story previews do not leak private child names/photos through public metadata.
- Add tests for private story assets, public story assets, and unlisted links.

Acceptance criteria:

- A logged-out request cannot fetch assets from a private story.
- A logged-out request can fetch assets only for a published story or valid share token.
- Deleting or unpublishing a story immediately removes public access.

### 4. Server-Side Quota Enforcement

Status on 2026-05-01: Core API enforcement is ready; reservation release is implemented for queue enqueue failures and permanent generation failures before a usable story/audio artifact is created.

Done:

- Story creation now uses atomic monthly quota reservation with bundle support before queueing.
- Bundle grants use half-open billing period overlap, with a boundary test for exact period handoff.
- Audio generation now reserves `audio_synthesized` quota before queueing and uses a per-user advisory lock.
- Story and audio reservation release now uses append-only compensating `usage_events` rows with `quantity: -1`, preserving audit history without destructive updates.
- Queue permanent-failure hooks release story/audio quota only after retries are exhausted; enqueue failures release immediately.
- Images-per-story limits are enforced in generation planning.
- Child profile count is enforced server-side.
- Premium voice access is enforced in API and service/job paths.
- Story-from-drawing/photo generation access is enforced before expensive photo analysis/generation.
- Quota, bundle, audio, premium voice, and story-from-drawing tests exist.

Remaining:

- Error codes are user-safe, but not all quota/paywall messages are localized in the app.
- Live provider failure paths still need production smoke verification to observe release behavior with real queue retries and provider errors.
- Child-mode generation now has a scoped child UI and route; live provider failure paths still need production smoke verification in Child Mode.

The UI paywall is not enough. Story generation, audio generation, images per story, premium voices, child profile count, story-from-drawing, and bundles must be enforced by the API.

Historical bundle purchase review findings, now fixed in code and kept as regression context:

- Main story creation endpoints currently create and queue story requests without a server-side `checkUsageLimit('stories_per_month')` gate.
- Bundle grant period matching currently uses inclusive interval overlap, which can make a bundle bought in the previous Stripe billing period count in the next period when `old_period_end === new_period_start`.

Required work:

- Enforce plan limits before queueing expensive generation jobs.
- Enforce `stories_per_month` on every story creation entrypoint before queueing work:
  - standard wizard story creation;
  - instant/photo story creation;
  - scheduled continuations if they consume monthly stories;
  - any future child-mode story creation entrypoint.
- Atomically reserve usage or prevent double-spend races.
- Enforce monthly story limits.
- Enforce audio story limits.
- Enforce images-per-story limits.
- Enforce child profile limits.
- Enforce premium voice access.
- Enforce story-from-drawing access.
- Enforce bundle grants consistently with subscription usage.
- Use half-open billing intervals for bundle grants: `grant_start < period_end` and `grant_end > period_start`.
- Add a boundary test proving a bundle ending exactly at the next Stripe period start does not carry over.
- Return user-safe, localized error codes/messages for exhausted limits.

Acceptance criteria:

- Direct API calls cannot bypass the UI.
- A direct API call cannot create a story when `story_created >= plan_limit + active_bundle_bonus`.
- Concurrent requests cannot exceed quota.
- Bundle bonuses increase the effective story/audio limit only for the intended billing period.
- Bundle bonuses stop applying at the exact next billing period boundary.
- Failed pre-artifact jobs do not incorrectly consume final quota; reservation release behavior is documented and covered by targeted quota tests.
- Usage shown in the UI matches server-side accounting.

### 5. Account, Auth, and Recovery

Status on 2026-05-02: Partially ready; production email/password auth, OAuth start, noindex auth routes, sensitive response filtering, and reset endpoint smoke checks pass, but real Google callback completion and email deliverability remain.

Done:

- Email/password registration and sign-in paths exist and were used repeatedly in local live smoke tests.
- Sign-up cannot complete without Terms, Privacy, and adult guardian consent.
- Auth, OAuth, and password reset endpoints have stricter rate limits.
- Apple sign-in is hidden on web (`WelcomeScreen` only renders it on iOS).
- Child-owned accounts are not part of the launch model; child sessions attach to parent-owned accounts.
- Production Google OAuth start redirects to Google with the correct `wondertales.art` callback URL and no redirect mismatch in DevTools.
- Production forgot/reset password endpoints return expected responses for safe smoke cases.
- Production API startup now requires `GOOGLE_CALLBACK_URL`, `WEB_APP_URL`, `RESEND_API_KEY`, and `FROM_EMAIL` instead of silently booting with broken auth/recovery links.
- Production email/password login and registration now navigate to `/dashboard` after successful authentication.
- Login/register/current-user JSON responses no longer expose password hashes or Stripe customer ids.
- Deployed `/welcome`, `/register`, `/auth/forgot-password`, and `/auth/reset-password?token=bad` return app-shell HTML with `noindex,nofollow` in the production smoke script.

Remaining:

- Complete Google OAuth on the production domain with a real account and verify callback/session persistence after Google returns to the app.
- Add/verify password-reset sender DNS (`SPF`, `DMARC`, Resend DKIM) and confirm real inbox delivery.
- Decide whether IP-only rate limits are sufficient for beta or whether CAPTCHA/WAF bot protection is required before public acquisition.

Required work:

- Ensure email/password sign-up and sign-in work.
- Ensure Google OAuth works on web.
- Fix Apple OAuth for web or hide the Apple button on web.
- Configure and verify password reset email.
- Add bot/rate-limit protection to auth endpoints.
- Add legal/consent text to sign-up.
- Do not allow child-owned accounts for launch.

Acceptance criteria:

- A parent can sign up, verify or access account as intended, sign out, sign in, and reset password.
- OAuth callback paths work on production domain.
- Password reset actually sends email in production.
- Auth routes are not indexed.

### 6. Parent-Owned Child Mode

Status on 2026-05-01: Ready for closed-beta verification; production OAuth callback verification remains tracked under Auth and Onboarding.

Done:

- Session schema supports explicit `parent` and `child` modes with parent/child context.
- `requireParentSession` blocks child sessions from account settings, billing, plan changes, entitlements, profile management, uploads, publishing, and story write/expensive generation routes.
- Billing endpoints, bundle checkout, customer portal, plan upgrade, and bundle catalog reject child sessions.
- Child profile deletion revokes active child sessions for that profile.
- Live smoke tests verified child sessions receive `PARENT_SESSION_REQUIRED` on plan/bundle and story-write routes.
- Child profiles now store Child Mode enablement and parent-control settings.
- Parent-only child-mode endpoints can read/update controls, enter Child Mode by creating a child session, and revoke active child sessions for a child profile.
- `/children` includes normalized child-mode controls and active child-session counts.
- `/children` UI now exposes Child Mode enablement, daily/monthly limits, free-text/audio/review/family-story toggles, active child-session counts, and session revocation.
- `/children` can now start Child Mode for enabled child profiles, and child sessions render a dedicated Child Mode shell with parent app navigation hidden.
- Parent gate UI now lets password-authenticated adults return from Child Mode without logging out; OAuth-only accounts get a safe sign-out recovery path.
- `story_requests` and `stories` now carry child-mode attribution and parent review fields; the async story pipeline propagates these fields when a child-created request is introduced.
- `requireChildSession` and `requireSessionScope` middleware are available for future child-safe endpoints.
- `POST /api/v1/stories/child-mode` creates queued story requests from scoped child sessions and enforces child-mode profile, free-text, theme, language, character, sibling, and daily/monthly limit controls.
- Child sessions now persist their normalized Child Mode controls locally so the child UI can render only allowed languages/themes and hide free-text prompts when disabled.
- Child Mode now includes a child-safe story creation UI with theme, language, illustration style, optional free-text idea, safe progress states, limit/error messaging, and parent-review handoff copy.
- `/children` now lets parents configure allowed story themes, story languages, saved characters, and sibling inclusion for Child Mode.
- Child-created story requests now record `reservationSource: child_mode` in quota reservation metadata and reuse child-mode prompt safety source labels through the shared orchestration path.
- Child-created stories that require review now surface review badges in the library, expose approve/reject controls in the story viewer, block publishing/sharing until approved, and are excluded from public/unlisted lookup predicates while pending or rejected.
- `POST /api/v1/auth/parent-gate` lets password-authenticated adults re-enter Parent Mode from a child session and revokes the previous child session.
- OAuth-only parent gate fallback is implemented for web Google re-auth and native Google/Apple token re-auth; callback URLs still need production live verification.

Remaining:

- Verify the OAuth-only parent gate fallback against production callback URLs after deploy.

If children can use the app themselves, they must do so inside a supervised mode controlled by an adult account.

Required product model:

- Account owner is always an adult.
- Child profiles belong to the adult account and should become the main "family profile" unit.
- A child profile is not a separate user account and does not use email, social login, or independent billing identity.
- Child Mode is enabled per child by the adult.
- Child Mode runs as a limited child session attached to one active child profile.
- Child sessions must be enforced by the API, not only by hiding UI.
- Child Mode cannot access billing, subscription management, account settings, legal consent, public publishing, raw profile settings, support contact forms, or destructive deletion flows.
- Child Mode generation is limited by parent settings and server-side quota checks.
- Parent can revoke all active child sessions for a child profile.

Required session model:

- Add an explicit session mode: `parent` or `child`.
- Child session context includes `parentUserId`, `childProfileId`, allowed scopes, expiration, and revocation state.
- Parent-only endpoints use a `requireParentSession` authorization guard.
- Child-safe endpoints use a `requireChildSession` or scoped authorization guard.
- Child sessions expire automatically after a defined period or inactivity timeout.
- Clearing local storage or logging out must not restore parent access; it should return to an unauthenticated state.

Required parent controls:

- Enable/disable child self-use.
- Daily or monthly generation cap.
- Allowed characters.
- Allowed story themes.
- Allowed languages.
- Free text prompt enabled/disabled.
- Audio generation enabled/disabled.
- Require parent review before saving or sharing.
- Allow/disallow siblings or other child profiles as story characters.
- Allow/disallow viewing shared family stories.
- Review and revoke active child sessions/devices.

Required `/children` profile management:

- Expand `/children` into a family profile management area.
- Each child profile shows name, age, languages, avatar, Child Mode status, usage limits, and active child sessions.
- Parent can start Child Mode for a selected child from that child's profile card.
- Parent can configure Child Mode settings per child.
- Switching the active child inside Child Mode is blocked unless a parent re-enters the parent gate.
- Sibling inclusion in a story is a separate permission from switching the active child profile.

Required parent gate:

- Entering Child Mode requires a parent action from an authenticated parent session.
- Returning from Child Mode to Parent Mode requires parent PIN, password re-authentication, or an equivalent parent gate.
- The parent gate must be required for billing, plan upgrade, account settings, child profile editing, public publishing, and destructive actions.
- The gate should be requested at the moment of action, not only during initial app load.
- Payment endpoints must enforce the same rule server-side with `requireParentSession`, including subscription checkout, bundle checkout, customer portal, plan changes, and future refund/cancellation actions.

Required locked-feature and CTA behavior:

- Keep existing locked feature blocks such as "choose a higher plan to use this".
- In Parent Mode, locked paid-feature CTAs can open checkout or plan selection normally.
- In Child Mode, the same blocks can stay visible, but any CTA must first request a parent session through the parent gate.
- If the parent gate succeeds, continue in Parent Mode to the relevant plan/checkout/settings flow.
- If the parent gate fails or is canceled, return to the child-safe screen without exposing prices, checkout, customer portal, or account settings.
- Child Mode must never call Stripe checkout, bundle checkout, customer portal, or plan-change APIs directly.
- API routes must reject child sessions for all billing and subscription actions even if a child manually triggers the request.

Acceptance criteria:

- A child session cannot change billing, subscription, legal consent, or public visibility.
- A child session cannot buy or upgrade.
- A child session cannot open checkout, bundle checkout, customer portal, or plan-change APIs.
- `/api/v1/billing/bundle-checkout` and all other billing endpoints reject child sessions even if called directly.
- Locked paid-feature CTAs in Child Mode open the parent gate, not checkout.
- A child cannot exit to Parent Mode without parent gate success.
- A child cannot switch to another active child profile without parent gate success.
- Child-created stories are marked with `created_by_mode=child` and `created_by_child_profile_id`.
- Parent review state is stored for child-created stories when review is required.
- When limits are reached, the child sees a safe "ask an adult" state.
- Parent can revoke child access.

### 7. Safety and Moderation

Status on 2026-05-01: Mostly ready for closed-beta verification.

Done:

- Unsafe user prompts are blocked before expensive story jobs are queued.
- Generated story validation now fails closed on provider/content-policy failures.
- Generated image validation blocks failed/low-score assets before they become child-facing assets.
- Uploaded photo/drawing inputs must be owned WonderTales assets and match allowed photo types.
- Public publishing is blocked unless story, image, visibility, and consent safety checks pass.
- Raw image validation debug routes are admin-only.

Remaining:

- Support-facing moderation review logs/workflows are not fully productized.
- Fallback behavior for failed generated moderation is partly fail-safe/blocked, but not a polished rewrite/regenerate/refusal UX across every path.
- Continue live provider testing for edge cases around vision/text moderation failures.

Required work:

- Moderate user prompts before generation.
- Moderate generated story text before showing/saving.
- Moderate generated images before showing/saving.
- Block unsafe child photo/drawing use cases.
- Avoid public publishing until content passes checks.
- Log moderation decisions for support review without exposing unnecessary child data.
- Create fallback behavior for failed moderation: rewrite, regenerate, or safe refusal.

Acceptance criteria:

- Unsafe prompts do not enqueue expensive jobs.
- Unsafe text/images are not shown to children.
- Failed scenes are regenerated or clearly fail safe.
- Public stories are never published before passing moderation.

### 8. Data Deletion and Retention

Status on 2026-05-01: Core deletion behavior, support/admin request intake, admin export package generation, orphan-file dry-run scanning, and the disabled-by-default scheduled cleanup job are ready; export delivery policy and production cleanup apply-mode approval remain.

Done:

- Story deletion removes generated storage files and validation/debug image paths tied to the story.
- Account deletion removes user-owned storage files and owned data that should not be retained.
- Child profile deletion hard-deletes unused profiles and anonymizes used profiles while scrubbing child-specific fields/assets.
- Child profile deletion revokes active sessions attached to that child profile.
- Deletion tests exist for story, account, and child profile behavior.
- Parent-only data privacy request endpoints now let users create/list export or deletion requests.
- Admin-only privacy request endpoints now let support list/filter and mark requests `open`, `in_review`, `fulfilled`, `rejected`, or `canceled`.
- Web admin now includes `/admin/privacy-requests` for filtering, reviewing, and updating export/deletion support requests.
- Admin-only export package generation returns JSON for `export` privacy requests while omitting password hashes, OAuth/session/reset tokens, story share tokens, and signed asset URLs.
- `scanOrphanStorageFiles.ts` can dry-run local storage, compare files against DB-referenced asset paths, and only deletes with explicit `--apply`.
- Scheduled orphan-file cleanup now starts from API lifecycle only when `ORPHAN_STORAGE_CLEANUP_ENABLED=true`, defaults to dry-run, and requires an age gate before any apply-mode deletion.

Remaining:

- Secure delivery of generated export packages is still a manual support operation after admin review.
- Production cleanup apply mode is not enabled yet; deletion policy, dry-run review, and operator approval are still required before using `--apply` or `ORPHAN_STORAGE_CLEANUP_APPLY=true`.
- Billing-record retention needs final legal/operator confirmation before paid launch.

Required work:

- Deleting a story deletes associated generated images, audio, thumbnails, and derived files.
- Deleting a child profile deletes or anonymizes associated child-specific data according to policy.
- Deleting an account deletes user data and storage files except legally required billing records.
- Provide support/admin process for deletion and export requests.
- Run scheduled background cleanup for orphaned files in dry-run first, then enable apply mode only after production dry-run review and retention approval.

Acceptance criteria:

- Account deletion removes DB records and local storage files that should not be retained.
- Story deletion removes generated assets.
- Retained billing records are documented in Privacy/Retention policy.
- Deletion behavior is tested.

### 9. Production Security Baseline

Status on 2026-05-02: Ready for closed-beta verification; production TLS, HTTPS, CORS, headers, protected health/admin routes, localhost-only API/Postgres binding, and sensitive auth response filtering have been verified.

Done:

- Credentialed CORS is restricted to approved origins.
- Helmet/CSP security headers are enabled.
- The production webapp nginx config now serves the exported SPA with a reviewed CSP/security header allowlist for self-hosted assets, PostHog subresource calls, media/CDN assets, and redirect-only Stripe/OAuth flows.
- Session cookies are HttpOnly, SameSite=Lax, and secure in production.
- Rate limits cover auth, OAuth, password reset, story writes, billing, uploads, feedback, and public ratings.
- Uploads are parent-session protected, size-limited, and restricted to JPEG/PNG/WebP/HEIC/HEIF with explicit 400/413 errors.
- Detailed health, queue, rate limiter, image validation debug, admin, and sensitive routes are protected.
- `pnpm launch:scan-client-secrets` scans the exported web client bundle for server-side secret markers and now runs inside `pnpm launch:gate`.
- `pnpm launch:check-security-headers` validates the production webapp CSP/security header include, deployment mounts, Dockerfile copy, and API Helmet connect-src shape; it now runs inside `pnpm launch:gate`.
- `www.wondertales.art` has valid certificate coverage and redirects to `wondertales.art`.
- Production smoke confirms arbitrary untrusted `Origin` requests do not receive credentialed CORS access.
- Production auth/current-user responses were hardened and smoke-tested to omit sensitive user fields.

Remaining:

- Capture and archive deployed CSP/security headers for `wondertales.art` and `www.wondertales.art` after release deploy.
- Run and record the same secrets scan against the exact deployed production artifact after release deploy.

Required work:

- Restrict CORS to approved production origins.
- Fix `www.wondertales.art` TLS or redirect safely to apex.
- Keep HTTPS redirect working.
- Keep security headers enabled.
- Keep CSP restricted to required subresource sources only.
- Ensure cookies/tokens use secure settings.
- Add rate limits for auth, generation, billing, upload, and public share/rating endpoints.
- Ensure upload size/type validation.
- Ensure no secrets are exposed in client bundles.
- Close debug/test routes or protect them.

Acceptance criteria:

- Requests with arbitrary `Origin` do not receive credentialed CORS access.
- `https://www.wondertales.art/` does not show a certificate error.
- Security headers pass a basic production review.
- Uploads and generation endpoints have abuse controls.

### 10. Build and CI Health

Status on 2026-05-01: Local build/type-check is ready; deploy CI now has a launch gate before production deployment.

Done:

- `pnpm --filter wondertales-api build` passed after the P0 changes.
- `pnpm --filter wondertales-universal-app type-check` passed.
- `pnpm --filter wondertales-universal-app build:web` passed.
- Critical targeted tests were run for quota, bundles, legal/consent, assets, deletion, moderation, parent sessions, upload validation, and admin guards.
- The original `StoryCard.tsx` `textWrap` type-check blocker is fixed.
- `pnpm launch:gate` now runs shared build, critical API tests, static migration safety checks, API build, web type-check, web export, client-bundle secret scan, and security-header checks.
- GitHub deploy workflow now requires the launch gate before the remote deploy job.
- GitHub deploy workflow now applies tracked SQL migrations with `runAllMigrations.ts` instead of forcing a Drizzle schema push.

Remaining:

- Live replay of the full historical migration folder on a fresh database is not yet clean because early baseline migrations overlap; production deployment now uses the tracked migration runner against the existing deployment database.
- Run migration checks against the exact deployment database before release.

Historical local finding, now fixed and kept as regression context:

- Web type-check fails in `apps/universal-app/src/components/StoryCard.tsx` because `textWrap` is not a valid React Native style property.

Required work:

- Fix web type-check.
- Ensure API build passes.
- Ensure web build passes.
- Add or update launch-critical tests.
- Run migration checks before deploy.

Acceptance criteria:

- `pnpm --filter wondertales-api build` passes.
- `pnpm --filter wondertales-universal-app type-check` passes.
- Critical API tests for quota, bundles, legal routes, assets, and deletion pass.
- Release branch cannot deploy with failing build/type-check.

## P1 - Public Web Beta Blockers

### 1. Public SEO Routing and Pricing Ownership

Current code findings:

- `/pricing` and `/{locale}/pricing` are already routed through API SSR in `nginx/includes/common-ssr-routes.conf`.
- `services/api/src/ssr/renderPricingHtml.ts` renders an indexable pricing document with canonical and alternate links.
- Public landing/pricing SSR locale ownership is path-based: `/` and `/pricing` resolve to default `uk`, while `/en/` and `/en/pricing` resolve to `en`; browser `Accept-Language` no longer changes canonical ownership for those public SEO URLs.
- Public landing/pricing ETags now hash the rendered HTML, so SEO metadata changes cannot stay hidden behind stale `304 Not Modified` responses.
- Public pricing SSR now has a bounded plan-data load and a static launch-plan fallback, so `/pricing` can still return complete indexable pricing HTML when plan data is slow or temporarily unavailable.
- `apps/universal-app/src/screens/plans/PlansScreen.tsx` remains the authenticated billing/plans UI, but feature order, hidden-feature rules, price formatting, feature labels, and usage highlight rules now come from shared pricing presenter helpers.
- React Navigation maps the authenticated app `Plans` screen to `/billing/plans`, while `/pricing` and `/{locale}/pricing` stay owned by API SSR.
- Authenticated app deep links now wait for persisted auth-store hydration before protected-route guards can redirect to `/welcome`.
- `packages/shared/src/utils/routeOwnership.ts` now defines the launch SEO locales, public route contracts, app route paths, app-only noindex prefixes, and sitemap static SEO paths; sitemap generation and React Navigation consume this shared contract.
- `services/api/src/ssr/__tests__/routeOwnership.test.ts` now runs in `pnpm launch:gate` and verifies the shared route contract against sitemap output plus dev/prod nginx route ownership/noindex guardrails.
- Bundle catalog data is now cached client-side by current plan slug and invalidated after subscription checkout, bundle checkout, portal return, plan upgrade/downgrade, and billing success.
- Exact `/stories` and `/en/stories` are now API SSR catalog pages with canonical/hreflang metadata, lightweight hydration data, and sitemap entries.
- `/stories/:slug` is correctly routed to API SSR and should remain indexable only for intentionally published stories.
- `/u/:token` is routed to SSR with `noindex,nofollow` response/header handling and remains out of the sitemap.
- `/authors/:authorId` is now routed through API SSR from nginx for authors with at least one public catalog story; missing, invalid, or zero-public-story authors return 404 with `noindex,nofollow`.
- Public author avatar files can be served without auth only when the requested profile image matches the author's public avatar and the author has at least one public catalog story.
- `sitemap.xml` now includes default-locale `/authors/:authorId` URLs derived only from the same public catalog story rows used for `/stories/:slug`.
- `/terms`, `/privacy`, `/en/terms`, and `/en/privacy` are path-owned API SSR legal pages with canonical/hreflang metadata; only `en` and `uk` legal alternates are exposed.
- Local Docker logs after route checks show successful public/app responses; dev nginx now resolves Metro with IPv6 disabled to avoid noisy `host.docker.internal:8082` fallback warnings.
- Production smoke now covers the direct SPA screen route surface with `noindex,nofollow`, including localized app-only prefixes such as `/en/settings/language` and `/ru/settings/language`, admin route shells, billing success, Child Mode, unknown public 404s, and unsupported non-launch public locale routes such as `/ru/pricing`.

Required public route contract:

- Public indexable SSR routes:
  - `/`;
  - `/{locale}/` for launch-ready locales only;
  - `/pricing`;
  - `/{locale}/pricing` for launch-ready locales only;
  - `/terms`;
  - `/privacy`;
  - `/stories` only after an SSR catalog exists;
  - `/stories/:slug` only for published stories that passed parent approval and moderation;
  - `/authors/:authorId` only for authors with at least one public catalog story.
- Public accessible but not indexable routes:
  - `/u/:token` unlisted share links;
  - `/welcome`;
  - `/register`;
  - `/auth/*`;
  - `/billing/success`.
- App-only noindex routes:
  - `/dashboard`;
  - `/wizard`;
  - `/me/*`;
  - `/children`;
  - `/characters`;
  - `/profile`;
  - `/settings/*`;
  - `/admin/*`;
  - the authenticated billing/plans screen.

Required code changes:

- Keep the authenticated app `Plans` route on the app-only `/billing/plans` path.
- Keep `/pricing` and `/{locale}/pricing` owned only by API SSR.
- Rename or conceptually separate `PlansScreen` into an authenticated billing/plans screen; it may still be reached from paywalls, profile, billing success, and child-mode parent gates, but not via the public `/pricing` URL.
- Keep public pricing CTA links pointing to `/welcome` or `/register` with an optional selected plan parameter, not to the authenticated app billing screen.
- Keep bundle pricing data plan-aware in the client cache by including the current plan slug in the query key and invalidating bundles on any plan/subscription mutation.
- Keep pricing display helpers in the shared package so SSR and React do not duplicate feature sorting, hidden-feature rules, price labels, and usage highlight text. CTA behavior remains UI-specific because public SSR links to `/welcome` while authenticated billing opens upgrade/checkout flows.
- Keep the shared route ownership manifest for SEO/public/app-only paths wired into sitemap generation, React linking, and launch-gate nginx/sitemap tests.
- Keep the SSR `/stories` catalog indexable and in the sitemap now that it has API-rendered HTML.
- Keep `/u/:token` rendered with `noindex,nofollow` and out of sitemap.
- Keep `/authors/:authorId` SSR routed from nginx and include only eligible default-locale author URLs in sitemap.
- Public story SSR and React pages link the author name/avatar to `/authors/:authorId` when `author.id` is present.
- Author pages must list only public catalog stories, never private, draft, hidden, child-review-pending, or unlisted stories.
- Author pages with zero public catalog stories should return 404 or `noindex,nofollow`.
- Sitemap includes author pages only for authors with at least one public catalog story.
- Add `X-Robots-Tag: noindex,nofollow` for app-only route prefixes at nginx or app-server level.
- Keep real `404` plus `X-Robots-Tag: noindex,nofollow` for unknown public routes instead of serving the SPA shell with HTTP 200.
- Split public SEO locales from app-supported story languages. Sitemap, alternate links, and nginx localized SSR routes must use only launch-ready SEO locales.
- Current launch SEO locale set is `uk` default plus `en`; app/story languages can remain broader without becoming indexable public SEO locales.
- Keep public SSR route locale resolution path-based rather than `Accept-Language`-based, so canonical URLs stay deterministic.

Acceptance criteria:

- `curl https://wondertales.art/pricing` returns SSR HTML with pricing content, canonical URL, alternate links, and `index,follow`.
- `curl https://wondertales.art/authors/:authorId` returns SSR HTML with author metadata and public story links for authors with public stories.
- Opening the authenticated plans screen from inside the app uses an app-only URL such as `/billing/plans`, not `/pricing`.
- There is one shared pricing display source of truth for feature order, labels, hidden features, usage highlights, and price formatting.
- Bundle prices shown in the authenticated billing/plans screen always match the user's current plan after checkout, portal return, upgrade, downgrade, or billing success.
- Sitemap includes only indexable SSR-backed pages, including `/stories`, `/en/stories`, and eligible default-locale author pages.
- `/u/:token`, `/welcome`, `/register`, `/auth/*`, `/billing/success`, `/dashboard`, `/wizard`, `/me/*`, `/children`, `/characters`, `/profile`, `/settings/*`, and `/admin/*` are not indexable.
- Unknown public URLs do not return a successful indexable SPA shell.

### 2. Pricing and Billing UX

Current bundle purchase review findings:

- Public pricing SSR now renders four static launch-plan cards if plan data times out or fails, and the usage highlight copy uses plural-aware story/audio labels across visible locales.
- Bundle checkout cancel URL now points to `/billing/plans`; DevTools verified cancel returns from hosted Stripe back to the authenticated billing screen.
- Public SSR pricing and authenticated billing/plans now explain monthly auto-renewal, cancellation via billing portal where available, support-reviewed refunds, and bundle non-rollover/current-period behavior.
- Public SSR pricing and the app plans screen now suppress paid CTAs when real payments are disabled, while keeping free access available.
- Production smoke creates Stripe test-mode subscription and bundle Checkout Sessions successfully; bundle checkout now falls back to inline Stripe `price_data` when no static bundle Price ID is configured.
- DevTools verified hosted Stripe checkout loads for subscription and bundle sessions with sandbox UI, line item details, prefilled QA email, and card form.
- DevTools completed a Stripe sandbox bundle payment; the app returns to `/billing/success?kind=bundle&session_id=...`, shows bundle-specific success copy, and primary navigation returns to billing/plans.
- Stripe checkout success/cancel URLs and Customer Portal return URLs now preserve the authenticated user's app `preferredLocale`, so non-default locales return to paths such as `/ru/billing/success`, `/ru/billing/plans`, and `/ru/profile`.
- DevTools completed a Stripe sandbox subscription payment for the `silver` plan; the app returns to `/billing/success?kind=subscription&session_id=...`, usage reflects paid limits, and the profile shows the paid plan.
- DevTools verified Stripe Customer Portal opens from profile, shows the active subscription, payment method, invoice history, and cancellation flow.
- Customer Portal cancellation now updates local subscription state through `customer.subscription.updated`; the profile shows `cancelAtPeriodEnd` copy after webhook processing.
- Non-Stripe subscription periods now roll forward before usage/quota/bundle calculations; Stripe-backed expired periods are not auto-extended without webhook data.

Required work:

- Show plan limits clearly:
  - stories per month;
  - audio stories per month;
  - illustrations per story;
  - child profile limits;
  - premium voices;
  - story-from-drawing;
  - sharing/publishing;
  - PDF/video export if visible.
- Keep auto-renewal, cancellation, refund policy, and non-rollover behavior visible on public SSR pricing and authenticated billing/plans.
- Keep paid CTAs hidden or non-clickable if real payments are disabled.
- Keep locked paid-feature blocks visible where they help explain availability, including in Child Mode.
- In Child Mode, locked-feature CTAs must open the parent gate before any plan, pricing, checkout, or settings flow.
- Show current plan and usage in the authenticated billing/plans screen.
- Make Stripe success and cancel URLs deterministic and locale-aware:
  - bundle checkout cancel returns to the correct pricing/billing screen, not `/plans`;
  - success returns to a route that refreshes subscription usage and bundle state;
  - public pricing links preserve the active public locale;
  - authenticated billing links preserve the user's selected app language.
- Invalidate or refetch bundle catalog data after subscription checkout, bundle checkout, portal return, plan upgrade/downgrade, and billing success.

Acceptance criteria:

- A user can understand price and limits before sign-up.
- Stripe checkout opens only for real purchasable plans.
- Stripe checkout never opens directly from a child session.
- Canceling Stripe bundle checkout returns the user to the expected pricing/billing route.
- Changing plan never leaves stale bundle prices or stale bundle availability visible.
- Stripe portal works for cancellation and billing management.
- Public SSR pricing copy and authenticated billing/plans copy match actual API enforcement.

### 3. Stripe End-to-End Verification

Verified so far on 2026-05-02:

- Production test-mode subscription Checkout Session creation for the `silver` plan returns a `cs_test_*` session and hosted Stripe URL.
- Production test-mode bundle Checkout Session creation for the first active bundle returns a `cs_test_*` session and hosted Stripe URL.
- Hosted Stripe checkout pages loaded in DevTools for subscription and bundle flows.
- Bundle checkout cancel return was verified in DevTools and lands on `/billing/plans`.
- Bundle checkout success return was verified in DevTools and lands on `/billing/success?kind=bundle&session_id=...`.
- Stripe test webhook endpoint is configured for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`.
- A real Stripe test-mode bundle payment completed with card sandbox data; production API logs show `checkout.session.completed` followed by `Recorded user_bundle_grant from Stripe bundle checkout`.
- Authenticated usage API showed the expected bundle grant after webhook processing: `+5` stories and `+2` audio for the current billing period.
- A real Stripe test-mode subscription payment completed with card sandbox data; production API logs show `checkout.session.completed` and the authenticated usage API showed `silver` plan limits plus the existing bundle bonus.
- Subscription checkout cancel return was verified in DevTools and lands back on `/billing/plans`.
- Production DevTools re-verified subscription checkout cancel/success for the `golden` plan and caught a client response-normalization gap where bundle credits were included in usage totals but not shown as `plan + bundle`; subscription usage now normalizes the API's snake_case usage fields before rendering without changing dynamic pricing feature slug maps.
- After the response-normalization fix, `/billing/plans` shows plan limits and bundle credits separately instead of folding bundle credits into the plan limit.
- Stripe Customer Portal opened from the production profile, showed the `silver` subscription, card, invoice, and cancellation action, and returned to `/profile`.
- Customer Portal cancellation was verified; API usage now reports `cancelAtPeriodEnd: true`, and the profile shows the cancellation-pending state through the period end.
- The Stripe webhook handler now accepts both top-level subscription period timestamps and the newer item-level period timestamps sent by `customer.subscription.updated` events.
- A signed production `invoice.payment_failed` test webhook marks the local subscription `past_due`, keeps paid-period limits available, and surfaces payment-issue copy in the profile.
- A fresh `customer.subscription.updated` event restores the local subscription back to `active` after the payment-failure smoke, keeping the QA account in its cancel-at-period-end state.
- `docs/runbooks/stripe-test-mode.md` records the repeatable test-mode verification process.
- Production API logs show expected checkout session creation and webhook events with no matching error/warn lines after smoke and after the subscription update retry.
- Production smoke now creates Stripe test-mode subscription and bundle checkout sessions and can load the hosted Stripe checkout HTML after session creation.
- A fresh production Stripe sandbox bundle payment completed on 2026-05-02; the app returned to `/billing/success?kind=bundle&session_id=...`, usage showed the expected `+5` story and `+2` audio bundle bonuses, and API logs recorded the Stripe webhook plus `user_bundle_grant`.

Still required:

- Decide whether to keep the test webhook endpoint active for beta or replace it during live-mode setup.

Required work:

- Keep subscription and bundle checkout success/cancel covered in recurring smoke.
- Verify webhook signature verification.
- Keep subscription created/updated/canceled covered in recurring smoke.
- Keep payment failed behavior covered in recurring smoke.
- Keep customer portal and bundle/credit purchases covered in recurring smoke.
- Keep refund/support policy path covered in production smoke.
- Verify test mode before live mode.

Acceptance criteria:

- Stripe test-mode runbook exists.
- Webhook events update local subscription state.
- User cannot receive paid limits without successful payment event.
- User does not lose paid access incorrectly during webhook delay.

### 4. Localization Gate

Current risk:

- Sitemap exposes `uk`, `ru`, `en`, `es`, `de`, `fr`, and `pl`.
- The app has known missing translation coverage in several locales.
- Legal markdown exists only for `uk` and `en`.
- Localized public pages must not mix URL locale, rendered text locale, canonical URL, hreflang links, and app language state.

Completed locally:

- Public SEO locale ownership is path-based for landing, pricing, stories catalog, and legal pages.
- Default legal URLs `/terms` and `/privacy` render Ukrainian legal markdown with default canonical URLs.
- English legal URLs `/en/terms` and `/en/privacy` render English legal markdown with English canonical URLs.
- Legal pages expose only `uk`, `en`, and `x-default` alternates; unsupported locales such as `ru`, `es`, `de`, `fr`, and `pl` remain outside indexed legal routes.
- Public SSR footers now preserve the active public SEO locale for home, pricing, stories, terms, and privacy links.
- Public SSR footers now include a language dropdown for launch-ready SEO locales only (`uk` and `en`) on landing, pricing, stories catalog, terms, and privacy pages.
- The public language dropdown switches to the equivalent localized URL for the current route instead of sending users to the app shell or a different public page.
- The hydrated public stories catalog now keeps a `uk`/`en` language dropdown after React hydration and syncs default public SEO routes such as `/stories` back to the default `uk` UI locale.
- Production DevTools screen sweep found and fixed visible Ukrainian UI fallbacks in the authenticated web app: photo upload controls, library empty/loading/error states, library view-toggle accessibility label, billing portal wording, and profile pseudonym spelling.
- Production DevTools re-check verified `/wizard`, `/me/stories`, and `/billing/plans` render the fixed Ukrainian copy after deploy.
- Production smoke now crawls `/`, `/en`, `/pricing`, `/en/pricing`, `/stories`, `/en/stories`, `/terms`, `/en/terms`, `/privacy`, and `/en/privacy` and verifies `html[lang]`, canonical URLs, `uk`/`en` hreflang alternates, `x-default`, and absence of incomplete locale alternates.
- DevTools verified live English `/en/pricing` content, footer links, and the `uk`/`en` language selector.
- Authenticated language changes now persist locally, update the server-side `preferredLocale`, and rewrite the current web URL locale prefix in place.
- Successful email/password, registration, OAuth, and parent-gate auth responses now apply the user's stored `preferredLocale` to i18n/local storage and the web URL prefix.
- Auth, billing, and quota-style API errors now map server error codes to localized app copy across visible app locales instead of surfacing English API messages.
- OAuth callback completion now uses localized loading/error copy and applies the user's stored `preferredLocale` before entering the app.
- Production DevTools verified the Russian invalid-login flow on `/ru/welcome`: the form keeps user input, shows localized copy (`Неверный email или пароль`), and no longer emits raw React Query `HTTP Error 401` logs for the expected `401`.
- Production DevTools and Stripe API verification confirmed billing checkout and Customer Portal return paths preserve the user's `preferredLocale` for app-only routes.

Remaining work:

- Decide launch UI locales.
- Extend the public language dropdown to any additional localized public SSR route before that route is indexed.
- Continue monitoring for accidental language drift in newly added internal links, CTAs, auth return URLs, and share links.

Acceptance criteria:

- No visible locale shows raw translation keys.
- No visible locale falls back to an unexpected language.
- Sitemap, canonical links, and alternate links include only launch-ready SEO locale pages.
- Search engines can discover localized equivalents through `hreflang`.
- Users can intentionally switch language through a language dropdown and stay in that language while navigating public pages.
- A user following a normal CTA or internal public link does not accidentally land in a different language.

### 5. Public Website Trust Layer

Required work:

- Add footer to landing pages.
- Add support/contact email.
- Add Terms/Privacy/Cookies/Pricing links.
- Keep clear "private by default" and parent-owned account copy visible on public landing pages.
- Keep child self-use copy aligned with the shipped Child Mode controls and parent review flow.
- Add real sample stories in English when content is ready.
- Fix PWA manifest from `Kazka+` to `WonderTales`.
- Keep structured data for software/pricing/FAQ aligned with public copy and plan data.

Completed locally:

- PWA manifest source and exported web manifest now use WonderTales branding instead of `Kazka+`.
- Public SSR head assets now include `/manifest.json`, so landing, pricing, legal, support, story catalog, author, and story pages expose the same install metadata as the SPA shell.
- `pnpm launch:gate` now checks the source and exported web manifests for stale brand names, required icons, `start_url`, standalone display mode, and index.html manifest links.
- Landing SSR now exposes SoftwareApplication and FAQPage JSON-LD with localized pricing URLs.
- Public pricing SSR now exposes Product/OfferCatalog JSON-LD generated from the rendered plan list.
- English landing pricing CTAs and FAQ pricing links now preserve `/en/pricing` instead of falling back to `/pricing`.
- Dev and production nginx configs now route nested `/landing/*` image assets so SSR landing pages do not fall through to unknown-route 404s for visible trust imagery.
- Landing SSR now has a public trust section for `uk` and `en` that explains parent-owned accounts, private-by-default stories and child data, Child Mode boundaries, and support/deletion paths.
- `pnpm launch:gate` now includes a regression test for landing trust copy and localized privacy/support links.
- Empty English landing story examples are hidden until real English public examples exist, and the populated English examples CTA now preserves `/en/stories`.

Acceptance criteria:

- A new visitor can answer: who is this for, what does it cost, is it safe, what data is used, how to delete data, how to contact support.
- No visible stale brand names remain.

### 6. Public Sharing Controls

Current code-backed visibility model:

- Private/draft story:
  - `is_published=false` or `NULL`;
  - `published_slug=NULL`;
  - `share_token=NULL`;
  - visible only to the owner in authenticated library/story routes;
  - never appears in public catalog, author pages, sitemap, SSR story routes, or public APIs.
- Public catalog story:
  - `is_published=true`;
  - `visibility='public'`;
  - `published_slug` is not null;
  - `share_token=NULL`;
  - visible at `/stories/:slug`;
  - eligible for `/stories`, `/authors/:authorId`, sitemap, search indexing, ratings, share cards, and landing-page curation.
- Unlisted story:
  - `is_published=true`;
  - `visibility='unlisted'`;
  - `share_token` is not null;
  - `published_slug=NULL`;
  - visible only at `/u/:token`;
  - public to anyone with the link, but not eligible for catalog, author page, sitemap, or indexing.
- Home-page featured story:
  - subset of public catalog stories only;
  - `show_on_home_page=true`;
  - controlled by admin/support, never allowed for unlisted or private stories.
- Hidden/deleted story:
  - must not appear in owner library, public catalog, author pages, sitemap, SSR pages, or public APIs;
  - if the row is retained with `hidden=true`, public queries must explicitly filter it out.

Required work:

- Define visibility states:
  - private;
  - unlisted link;
  - public catalog;
  - unpublished/archived.
- Parent-only action for public publishing.
- Confirmation dialog before making a story public.
- Remove child-created story from public catalog until parent approval.
- Keep unpublish action returning stories to the private visibility state.
- Keep a visible report story action for public catalog and unlisted story pages.
- Make `/api/v1/public/stories`, `/api/v1/public/authors/:authorId`, SSR story routes, SSR author routes, and sitemap use the same public predicate: `is_published=true`, `visibility='public'`, `published_slug IS NOT NULL`, `hidden=false`, moderation passed, and parent review approved when applicable.
- Make `/api/v1/public/u/:token` and `/ssr/u/:token` use the unlisted predicate: `is_published=true`, `visibility='unlisted'`, `share_token IS NOT NULL`, `hidden=false`, moderation passed, and parent review approved when applicable.
- Remove or deprecate older duplicate public endpoints that do not return the same shape or predicate as `/api/v1/public/stories`.
- Ensure public author metadata exposes only safe fields: public author id, pseudonym/display name, avatar, about text, and public story count. Never expose email, account settings, child profile data, private story count, or unlisted story count.

Completed locally:

- Visibility states are documented in this roadmap as private/draft, public catalog, unlisted, home-page featured, and hidden/deleted behavior.
- Public publishing/unpublishing remains guarded by `requireParentSession`, so child sessions cannot directly publish or unpublish stories.
- Child-created stories remain blocked from public/unlisted sharing until parent review is approved; launch-gate coverage exists in story publish safety and parent review tests.
- Public and unlisted story predicates now share backend policy helpers for moderation and parent review.
- `/api/v1/public/stories`, `/api/v1/public/authors/:authorId`, public SSR story routes, SSR author routes, sitemap author/story eligibility, and older `/api/v1/stories/published` endpoints all flow through `StoryRepository` public catalog predicates.
- `/api/v1/public/u/:token`, `/ssr/u/:token`, share-card lookup, and direct unlisted story assets now require the same unlisted predicate plus the matching share token where appropriate.
- Direct public story asset access now also requires `policy_checks.textValidated=true` and parent review status `not_required` or `approved`; owner/admin and signed private preview paths remain available for non-public access.
- Public predicate tests are included in `scripts/launch-gate.sh`.
- Unpublishing now clears `visibility` back to `null`, removes public/unlisted share fields, and clears home-page featuring when present.
- `pnpm launch:gate` now includes a publish service regression test for the unpublish private-state patch.
- Public and unlisted story pages now expose an explicit report story button that opens the existing feedback workflow with `published_story` context.
- Feedback API and admin feedback context now accept `published_story` as a reported screen, with launch-gate coverage.
- Legacy `/api/v1/stories/published` and `/api/v1/stories/published/:slug` endpoints now emit standard deprecation headers pointing clients to `/api/v1/public/stories` successors, with launch-gate coverage.
- Public author API metadata is now built through a safe-field helper that only returns public id, display name, avatar, and about text; regression coverage guards against email, role, billing, private story count, unlisted story count, and child profile leaks.
- Publishing confirmation UI now shows an explicit public-catalog warning when `public` visibility is selected, with localized copy for app-supported locales.
- Public Sharing Controls are production-smoke verified: public story/author SSR and APIs return expected responses, public APIs omit sensitive fields, legacy endpoints emit successor deprecation headers, invalid unlisted routes return 404, sitemap excludes `/u/`, story share-card returns JPEG, and DevTools confirmed the public story report modal opens with public-story context.

Acceptance criteria:

- Stories are private by default.
- Public catalog contains only intentionally published stories.
- Author pages contain only public catalog stories by that author.
- Unlisted stories are reachable only by token and return `noindex,nofollow`.
- Unpublishing removes story from catalog, sitemap, and public asset access.

### 7. Operational Readiness

Status on 2026-05-02: Core production operations checks are now repeatable and verified on the droplet. `scripts/check-production-ops.sh --backup-smoke` passed with `0` failures and `0` warnings after validating containers, localhost-only API/Postgres bindings, health endpoints, disk thresholds, production volumes, required env presence, recent API logs, and a real `pg_dump -Fc` backup readable by `pg_restore -l`. The deploy/backup/restore/rollback runbook is documented in `docs/runbooks/production-operations.md`.

Completed locally and in production:

- Required migrations are run through the tracked deploy flow.
- Production env presence is checked without printing secret values.
- Manual database backup smoke creates a custom-format dump in the production backup mount and validates archive readability.
- Upload and log volumes are checked for readability and current size.
- Disk thresholds are checked for root, Docker, and project filesystems.
- API and Postgres localhost-only bindings are checked.
- Recent API logs are scanned for error/warn/failed lines.
- Admin/support access is covered by production smoke, admin dashboard, and support feedback checks.
- Deploy, rollback, backup, and restore guidance is documented in a runbook.
- Production smoke now accepts both expected series entitlement outcomes: a `SERIES_ACCESS_REQUIRED` gate for free QA users or an empty/successful series list when the mutable QA account has paid-series access.

Remaining work:

- Configure recurring/offsite database backup retention before relying on paid production data.
- Configure recurring/offsite upload-volume backup retention before relying on paid production media.
- Add external disk/error monitoring alerts if beta traffic grows beyond manual checks.

Completed locally:

- Public story SSR Redis cache runtime dependency is now declared in the API package.
- Dev API image was rebuilt and verified to initialize Redis successfully after an SSR story request.
- Docker log checks are now part of the local launch verification loop for each batch.

Acceptance criteria:

- Restore plan exists for database and uploaded/generated files.
- Failed jobs and payment webhook failures are visible to the team.
- There is a documented deploy/rollback path.

## P2 - Paid Launch and First Active Usage

### 1. Owner Operating Structure and Tax Position

Current owner context:

- The owner has a main employment contract in Spain.
- The owner is on the Spanish Beckham regime.
- The main Spanish salary is expected to remain the income used to live in Spain.
- A Ukrainian FOP may be used only as a small side-business bridge for early validation.

Launch position:

- Ukrainian FOP is acceptable only as a temporary structure for a small beta or first low-volume paid validation.
- Ukrainian FOP is not the target structure for a full public paid launch.
- FOP income must be treated as active personal business income, not passive foreign income.
- The product, Terms, Privacy, invoices, and payment provider records must consistently name the real operator.
- If revenue becomes recurring, material, or public acquisition starts, move to a more durable structure before scaling: Ukrainian TOV, Spanish SL/autonomo, Merchant of Record structure, or another adviser-approved setup.

Risk controls while using Ukrainian FOP:

- Keep clear evidence that the main economic activity and living income come from the Spanish employment contract.
- Keep FOP revenue small relative to the Spanish salary during the validation stage.
- Pay and document Ukrainian FOP taxes correctly.
- Keep invoices, bank statements, FOP filings, payment provider records, and support/legal records.
- Do not describe FOP revenue as passive income in internal or legal documentation.
- Do not use FOP for a large-scale subscription launch without written review by a Spanish gestor/tax adviser familiar with Beckham regime.
- Re-check the structure before enabling broad EU paid traffic, paid ads, annual plans, or high monthly recurring revenue.

Acceptance criteria:

- The current legal operator is named consistently across public legal pages, payment records, invoices, support templates, and internal runbooks.
- There is a written owner decision for the current stage: free beta, FOP bridge, TOV/company, Spanish structure, or Merchant of Record.
- If FOP is used, the roadmap marks it as temporary and defines the trigger for migration.
- Before full paid launch, the owner has adviser confirmation that the chosen structure does not create unacceptable Beckham/RETA/tax risk.

### 2. Support and Incident Process

Status on 2026-05-02: Core support intake now exists through the existing feedback/admin workflow, with support topics for billing, refunds, unsafe content, failed generation, and account/privacy. Operator templates and incident checklists are documented in `docs/runbooks/support-incident-process.md`. Production smoke confirmed billing-page feedback topic UI, refund-topic submission, admin feedback filtering/display, and API docker log recording.

Completed locally:

- Feedback submissions can include a `supportTopic` in JSON context without changing the existing `user_feedback.category` database constraint.
- Feedback modal defaults relevant screens to support topics: plans/profile to billing, public stories to unsafe content, and story creation to generation failed.
- Admin feedback shows support topic metadata and can filter by support topic.
- Stripe runbook now includes the refund/support review path.
- Launch-gate feedback regression covers required support topics.
- Production `/billing/plans` and `/admin/feedback` DevTools smoke verified the support topic path after deploy.

Required work:

- Confirm the support email inbox is actually receiving external mail.
- Assign an incident owner/escalation contact for launch operations.

Acceptance criteria:

- A support request can be handled without direct ad-hoc database spelunking for common cases.
- Critical incidents have an owner and response steps.

### 3. Usage Transparency

Status on 2026-05-02: Usage transparency is deployed for the launch flows. Billing plans, profile subscription state, both parent story creation modes, and Child Mode now show story/audio remaining or child-safe story chances from the server-side usage endpoint. Production DevTools smoke confirmed the usage card on `/billing/plans`, `/profile`, and `/wizard`; API docker logs after the sweep had no usage-related errors.

Completed locally:

- Added a reusable web usage summary card backed by `useSubscriptionUsage`.
- `/billing/plans` shows usage before bundle purchase options.
- `/profile` shows usage inside the subscription section without nesting extra cards.
- `/wizard` and Instant Wizard show usage before generation.
- The usage card shows reset/current period, stories remaining, audio stories remaining, plan limits, and active bundle credits when present.
- Locked plan features on `/billing/plans` now explain which plan unlocks the feature, and locked premium voices explain that the Fairy World plan is required.
- Child Mode now explains story limits with child-safe "story chances" copy and routes exhausted-credit help through the parent gate instead of billing or account settings.
- Usage copy is localized for `uk`, `en`, `ru`, `es`, `fr`, `de`, and `pl`.
- Production smoke verified the deployed UI, browser console, and API docker logs.

Required work:
- Production Child Mode smoke still needs a real child-profile fixture; the current deployment can be render-checked with a simulated child session in DevTools.

Acceptance criteria:

- Users understand why a generation is blocked.
- Children can ask for parent help without gaining access to payment or account controls.
- Support tickets about "where did my credits go" can be answered from logs.

### 4. Cost Controls

Status on 2026-05-02: Admin-visible cost guardrails, live queue pressure, unusual-usage alerts, and per-user throttles for provider-costly generation routes are now deployed. The dashboard tracks generation cost per story, retry/failure cost signals, high-cost story count, unpriced AI usage events, projected monthly spend, top-user 24h spend, text/image/audio/legacy queue depth, and actionable warning/critical cost alerts. Production smoke confirmed the API fields, dashboard rendering, browser console, and Docker logs.

Completed locally:

- Cost-control thresholds are configurable through environment variables with conservative defaults.
- Admin dashboard data includes daily average spend, projected monthly spend, max story cost, high-cost story count, unpriced AI event count, and top-user 24h spend.
- Admin dashboard data includes live queue health for text, image, audio, and legacy queues.
- Admin UI shows cost guardrail status and queue backlog status with healthy/warning/critical bands.
- Admin dashboard API now returns actionable cost-control alerts for projected monthly spend, daily average spend, top-user 24h spend, high-cost stories, max story cost, and unpriced AI events.
- Admin UI renders the active warning/critical alert queue, with operator action text and review destinations; healthy periods show an explicit empty state.
- Launch gate now runs the focused cost-control service regression.
- Production `/admin/dashboard` DevTools smoke verified the new dashboard sections after deploy.
- High-cost story generation, child-mode generation, instant generation, image retry/regeneration, continuation, audio, legacy TTS, and alignment routes now have a per-owner hourly limiter after authentication.
- The expensive-generation limiter keys child sessions by parent owner id, with real-IP fallback only when user context is missing.
- Launch gate now includes focused rate-limiter key regression coverage.

Remaining work:

- Add external notification/escalation workflows for repeated per-user abuse signals and sustained critical dashboard alerts if beta traffic grows beyond manual dashboard checks.

Acceptance criteria:

- A single user cannot create unbounded AI cost.
- The team can see if plan pricing is underwater.

### 5. Content Quality and Safety Review Loop

Status on 2026-05-02: The admin dashboard now exposes a quality/safety review loop for beta operations. It aggregates unsafe-content reports, moderation-like failures, generation-failure reports, image validation retry pressure, public story reports, and public sample candidates, with status thresholds and a weekly runbook. Deployed to production and verified with API smoke, DevTools, production smoke, and docker logs.

Completed locally:

- Added `qualityReview` to `/api/v1/admin/dashboard` without adding new tables or migrations.
- Added dashboard UI for quality review status, review queues, failed request rate, image retry rate, unsafe reports, moderation failures, generation-failure reports, public story reports, and sample candidates.
- Added launch-gate coverage for quality review status classification.
- Documented the weekly operator process in `docs/runbooks/content-quality-review.md`.
- Production verified `/api/v1/admin/dashboard`, `/admin/dashboard`, broad production smoke with Stripe checkout creation, and nginx/webapp/api logs.

Required work:

- Keep reviewing failed moderation cases weekly and immediately after unsafe reports.
- Keep reviewing poor generation cases and repeated image validation retries.
- Improve prompts and retry strategy as review patterns emerge.
- Curate sample stories before adding them to landing-page examples.
- Keep public story report/removal path verified in production smoke.

Acceptance criteria:

- There is a weekly process for reviewing quality/safety failures.
- Public examples stay high quality.

### 6. Analytics with Consent

Status on 2026-05-02: Web analytics now requires an explicit opt-in before PostHog initializes or analytics events are captured. The consent banner is localized across visible app locales, and analytics identity/event payloads no longer include email, display name, story title, raw error messages, prompts, photos, child names, story text, or narration. Deployed to production and verified with DevTools in fresh accept/decline browser contexts.

Completed locally:

- Added a web-only analytics consent banner with accept/decline persistence.
- Gated PostHog web initialization behind granted analytics consent.
- Kept analytics calls as no-ops before consent or after decline.
- Re-identifies the signed-in user after consent changes without sending email or display name.
- Removed story title and raw generation error message properties from analytics events.
- Disabled PostHog autocapture, replay, surveys, product tours, dead-click capture, heatmaps, remote flags, and external dependency loading on the web client.
- Added a `before_send` scrubber for high-risk analytics property names.
- Localized consent copy for `uk`, `en`, `ru`, `es`, `fr`, `de`, and `pl`.
- Verified production accept/decline paths with DevTools and checked nginx/webapp/api docker logs after deployment.
- Added a web profile preference to change analytics consent later; disabling consent opts out and resets the initialized PostHog client.

Required work:

- Decide whether native app analytics should require the same explicit opt-in before mobile launch.
- Keep auditing future analytics events for product-safe payloads.

Acceptance criteria:

- Analytics does not collect child names, prompts, photos, or story text.
- Privacy policy matches actual tracking.

## P3 - Post-Launch Improvements

### Product

- Better onboarding for parents.
- Better child-friendly creation flow.
- More sample stories in every visible locale.
- Story series UX polish.
- PDF export polish.
- Video export if already promised by plan.
- More voices and voice previews.
- Better story library organization.
- Ratings/reviews moderation improvements.

### Platform

- S3/CDN migration if scaling beyond single server.
- Background media cleanup dashboard.
- More detailed admin tools.
- Data export self-service.
- More granular content moderation tooling.
- Automated legal document versioning UI.

### Mobile

- Revisit iOS/Android launch scope.
- Native auth callback handling.
- Native purchase model.
- App store privacy nutrition labels.
- App store age rating and child safety review.
- Native push notifications only after consent model is clear.

## Current Live-Site Snapshot

Observed on 2026-05-02 after the latest web/API deployment and production verification refresh:

- `./scripts/check-production-smoke.sh` with authenticated QA user, admin read-only checks, and Stripe test checkout creation passed with `0` failures and `0` warnings.
- Ukrainian and English SSR landing, pricing, stories catalog, terms, and privacy pages return 200 with deterministic `html[lang]`, canonical URLs, `uk`/`en` hreflang alternates, and no incomplete locale alternates.
- `/support` returns SSR HTML with the support address and `noindex,follow`.
- App-only and auth routes return SPA HTML with `noindex,nofollow`.
- Public stories, public author pages, share cards, sitemap entries, legacy public endpoint deprecation headers, and missing unlisted routes passed the production smoke.
- CORS no longer reflects an untrusted `Origin`.
- Public and authenticated API smoke checks passed for `/api/v1`, plans, dictionaries, `/api/v1/me`, library, subscription usage, privacy requests, children, characters, entitlements, bundles, and voices.
- Admin read-only API smoke checks passed for detailed health, queue health, image rate limiter, dashboard, stories, users, feedback, privacy requests, voices, image validations, and content config.
- Production DevTools screen sweep rendered the main authenticated screens, public stories catalog, and admin screens without runtime console errors.
- Public pricing SSR now renders with a bounded plan-data load, has a static launch-plan fallback, and production `/en/pricing` DevTools/curl verification showed plural-correct usage copy.
- A Stripe sandbox bundle payment completed through hosted Checkout, returned to `/billing/success?kind=bundle&session_id=...`, and the webhook recorded a `user_bundle_grant`.
- Production logs for the payment flow show the expected Stripe checkout/webhook/grant sequence. Remaining log noise is nginx temporary-buffer warnings for large static/media responses.

## Recommended Launch Gates

### Gate A - Internal Dogfood

Can proceed when:

- API build passes.
- Web type-check passes.
- Team can create a story, generate images, generate audio, and delete test data.
- Production deploy can be rolled back.

### Gate B - Closed Beta

Can proceed when all P0 items are complete:

- Legal pages are real.
- Parent consent is captured.
- Child data is private by default.
- Quotas are server-enforced.
- Auth and password reset work.
- Child Mode cannot access billing/settings.
- Data deletion removes files.
- CORS and `www` TLS are fixed.
- Pricing does not show broken links.

### Gate C - Public Web Beta

Can proceed when all P1 items are complete:

- Public routes and sitemap are clean.
- Public SEO pages are SSR-owned and app-only pages are noindex.
- Public `/pricing` is separate from the authenticated billing/plans screen.
- Pricing and plan copy match actual limits.
- Visible locales are ready.
- Support/contact exists.
- Public sharing controls are safe.
- Backups, monitoring, and deploy runbooks are in place.

### Gate D - Paid Launch

Can proceed when:

- Legal operator and owner operating structure are confirmed for paid launch.
- Ukrainian FOP, if used, is still explicitly limited to small validation and has a defined migration trigger.
- Stripe test-mode end-to-end flow passes.
- Webhook handling is verified.
- Refund/cancellation/support policy is live.
- Usage and billing state are visible to users.
- Payment failure and subscription cancellation behavior is tested.
- Cost alerts are in place.

## Explicit Non-Blockers

These should not delay the first web launch unless they are directly promised on public pages:

- Native iOS/Android apps.
- Native in-app purchase support.
- Offline mode.
- Full S3/CDN storage migration for a single-server beta.
- Advanced creator/community marketplace.
- Perfect translation coverage for hidden locales.
- Rich admin UI beyond support-critical actions.
- Full marketing blog/content engine.
