# WonderTales Web Launch Roadmap

Last updated: 2026-05-01

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

### P0 Status Snapshot - 2026-05-01

Current overall state: backend launch guardrails are much stronger than the original roadmap baseline, but P0 is not fully green for external families until production-only checks and child-mode product controls are finished.

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
- API build, web type-check, and web export passed after the P0 fixes.

Remaining P0 bottlenecks:

- Production-only web checks are still required: `wondertales.art`, `www.wondertales.art`, HTTPS redirect, TLS certificate, real nginx/proxy behavior, and production SSR route status.
- Google OAuth and password-reset email must be verified against production callback URLs, sender domain/DNS, and real email delivery. Apple is hidden on web, but native/mobile Apple remains out of this web launch scope.
- Legal/operator details must be finalized before paid launch, and non-`en`/`uk` legal alternates must either receive real legal content or stay out of indexed launch routes.
- Child Mode is currently fail-closed for dangerous actions. A full scoped child-mode product implementation is still not done: parent gate UI, child-safe scopes, parent controls, child-created-story metadata, and review state need schema/API/UI work.
- CI/release gating is not yet proven: local builds/tests pass, but deployment should block on API build, web type-check/export, critical tests, and migration checks.

Solutions not yet applied:

- No complete parent-control policy engine for child sessions.
- No support/admin workflow for data export requests and no background orphan-file cleanup job.
- No production secrets/client-bundle scan has been recorded.
- No final CSP allowlist review against production analytics/payment/OAuth domains has been recorded.

### 1. Stabilize Public Web Routes

Status on 2026-05-01: Partially ready; local/server code fixes are done, production verification remains.

Done:

- `/pricing` and localized pricing ownership were separated from the React billing screen.
- `/terms` and `/privacy` now render real SSR legal content instead of placeholders.
- Unknown public routes and app-only routes received noindex/404 guardrails.
- `robots.txt` and sitemap behavior were tightened to avoid indexing API/app-only paths.
- Footer links now include legal, pricing, and support routes.

Remaining:

- Re-run production `curl -I` and browser checks after deploy for `/`, `/en/`, `/pricing`, `/en/pricing`, `/terms`, `/privacy`, `/stories`, sample story pages, and unknown routes.
- Confirm `www.wondertales.art` TLS/redirect behavior in production.
- Keep `/stories` non-indexable until an SSR catalog exists; this is also tracked under P1 SEO routing.

Historical production findings that triggered this work and must be re-checked after deploy:

- `https://wondertales.art/pricing` timed out / returned `504`.
- `https://wondertales.art/en/pricing` returned `502`.
- `https://wondertales.art/terms` returned `502` intermittently.
- `https://wondertales.art/privacy` rendered, but the body was `Content not available.`
- Unknown routes return the SPA shell with HTTP 200, creating soft-404s.
- `robots.txt` currently allows all paths.

Required work:

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

Remaining:

- Finalize the legal operator/entity/Merchant-of-Record disclosure before paid launch.
- Add real legal content for every indexed launch locale, or keep unsupported legal locale alternates out of indexing.
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
- Background orphan-file cleanup is still a retention hardening item under P0 deletion.

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
- Child-mode generation is fail-closed for now; scoped child quota controls still need the Child Mode implementation.

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

Status on 2026-05-01: Partially ready; production OAuth/email verification remains.

Done:

- Email/password registration and sign-in paths exist and were used repeatedly in local live smoke tests.
- Sign-up cannot complete without Terms, Privacy, and adult guardian consent.
- Auth, OAuth, and password reset endpoints have stricter rate limits.
- Apple sign-in is hidden on web (`WelcomeScreen` only renders it on iOS).
- Child-owned accounts are not part of the launch model; child sessions attach to parent-owned accounts.

Remaining:

- Verify Google OAuth on the production domain with the final callback URL.
- Verify password reset email in production with real Resend/API key, sender domain DNS, and deliverability.
- Confirm auth routes are noindexed in the deployed route stack.
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

Status on 2026-05-01: Safety fail-closed baseline is ready; full Child Mode product is not ready.

Done:

- Session schema supports explicit `parent` and `child` modes with parent/child context.
- `requireParentSession` blocks child sessions from account settings, billing, plan changes, entitlements, profile management, uploads, publishing, and story write/expensive generation routes.
- Billing endpoints, bundle checkout, customer portal, plan upgrade, and bundle catalog reject child sessions.
- Child profile deletion revokes active child sessions for that profile.
- Live smoke tests verified child sessions receive `PARENT_SESSION_REQUIRED` on plan/bundle and story-write routes.

Remaining:

- No child-safe generation endpoint/scoped authorization layer is implemented yet.
- No parent gate UI/API for returning from Child Mode to Parent Mode is implemented.
- No parent controls for daily/monthly caps, themes, languages, characters, free-text, audio, review, siblings, or shared-family viewing.
- Child-created stories are not yet marked with `created_by_mode`, `created_by_child_profile_id`, or parent review state.
- `/children` still needs the expanded family profile management UI for child-mode status, limits, and active sessions.

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

Status on 2026-05-01: Core deletion behavior is ready; support/export/orphan cleanup remains.

Done:

- Story deletion removes generated storage files and validation/debug image paths tied to the story.
- Account deletion removes user-owned storage files and owned data that should not be retained.
- Child profile deletion hard-deletes unused profiles and anonymizes used profiles while scrubbing child-specific fields/assets.
- Child profile deletion revokes active sessions attached to that child profile.
- Deletion tests exist for story, account, and child profile behavior.

Remaining:

- Support/admin process for data export requests is not implemented.
- Background cleanup for orphaned files is not implemented.
- Billing-record retention needs final legal/operator confirmation before paid launch.

Required work:

- Deleting a story deletes associated generated images, audio, thumbnails, and derived files.
- Deleting a child profile deletes or anonymizes associated child-specific data according to policy.
- Deleting an account deletes user data and storage files except legally required billing records.
- Provide support/admin process for deletion and export requests.
- Add background cleanup for orphaned files.

Acceptance criteria:

- Account deletion removes DB records and local storage files that should not be retained.
- Story deletion removes generated assets.
- Retained billing records are documented in Privacy/Retention policy.
- Deletion behavior is tested.

### 9. Production Security Baseline

Status on 2026-05-01: Many code-level controls are ready; production infrastructure verification remains.

Done:

- Credentialed CORS is restricted to approved origins.
- Helmet/CSP security headers are enabled.
- Session cookies are HttpOnly, SameSite=Lax, and secure in production.
- Rate limits cover auth, OAuth, password reset, story writes, billing, uploads, feedback, and public ratings.
- Uploads are parent-session protected, size-limited, and restricted to JPEG/PNG/WebP/HEIC/HEIF with explicit 400/413 errors.
- Detailed health, queue, rate limiter, image validation debug, admin, and sensitive routes are protected.

Remaining:

- Fix or verify `www.wondertales.art` TLS and redirect-to-apex behavior in production.
- Verify HTTPS redirect and security headers on the deployed domain.
- Review the final CSP allowlist against production analytics, payment, OAuth, asset, and API domains.
- Run and record a production/client-bundle secrets scan.
- Confirm arbitrary `Origin` requests get no credentialed CORS headers on the deployed stack.

Required work:

- Restrict CORS to approved production origins.
- Fix `www.wondertales.art` TLS or redirect safely to apex.
- Keep HTTPS redirect working.
- Keep security headers enabled.
- Review CSP for required sources only.
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

Status on 2026-05-01: Local build/type-check is ready; CI/release gate still needs enforcement.

Done:

- `pnpm --filter wondertales-api build` passed after the P0 changes.
- `pnpm --filter wondertales-universal-app type-check` passed.
- `pnpm --filter wondertales-universal-app build:web` passed.
- Critical targeted tests were run for quota, bundles, legal/consent, assets, deletion, moderation, parent sessions, upload validation, and admin guards.
- The original `StoryCard.tsx` `textWrap` type-check blocker is fixed.

Remaining:

- Add or verify a CI/release gate that blocks deploy unless API build, web type-check/export, critical tests, and migration checks pass.
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
- `apps/universal-app/src/screens/plans/PlansScreen.tsx` renders a separate React pricing/billing layout with its own feature order, hidden features, price formatting, bundles, and checkout behavior.
- React Navigation maps the app `Plans` screen to the public `pricing` path in `apps/universal-app/src/App.tsx`, so the same semantic route is owned by both SSR and the app.
- Bundle catalog data is cached client-side under `['bundles']` and is not invalidated after subscription checkout, portal return, or plan changes, so bundle prices can become stale after a user changes plan.
- `/stories` is currently included in the sitemap, but exact `/stories` is routed to the SPA catalog, not an SSR catalog.
- `/stories/:slug` is correctly routed to API SSR and should remain indexable only for intentionally published stories.
- `/u/:token` is routed to SSR but currently reuses the published story renderer with `index,follow`; unlisted links must be `noindex,nofollow`.
- `/authors/:authorId` is React-only today, but it is part of the intended public discovery flow from public story pages and must become an indexable SSR page before launch.
- `/terms` and `/privacy` are SSR, but only `en` and `uk` markdown files exist. Other launch locales must either get legal content or stay out of indexed/legal alternate routes.

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

- Move the authenticated app `Plans` route away from `pricing`; use an app-only path such as `/billing/plans` or `/account/plans`.
- Keep `/pricing` and `/{locale}/pricing` owned only by API SSR.
- Rename or conceptually separate `PlansScreen` into an authenticated billing/plans screen; it may still be reached from paywalls, profile, billing success, and child-mode parent gates, but not via the public `/pricing` URL.
- Keep public pricing CTA links pointing to `/welcome` or `/register` with an optional selected plan parameter, not to the authenticated app billing screen.
- Make bundle pricing data plan-aware in the client cache, for example by including the current plan slug in the query key or by always invalidating bundles on any plan/subscription mutation.
- Extract a single pricing presenter so SSR and React do not duplicate feature sorting, hidden-feature rules, price labels, highlight text, and CTA labels. Acceptable options:
  - extend `buildPlansWithFeatures` to return display-ready fields consumed by both SSR and React;
  - or move pricing display helpers into a shared package and use them from both `renderPricingHtml` and `PlansScreen`.
- Create one route ownership manifest for SEO/public/app-only paths and use it consistently in sitemap generation, nginx route comments/config, React linking, and tests.
- Add SSR for `/stories` catalog if it remains in sitemap. Otherwise remove `/stories` from sitemap until the SSR catalog exists.
- Render `/u/:token` with `noindex,nofollow` and keep it out of sitemap.
- Add SSR for `/authors/:authorId` and route it from nginx before adding author pages to sitemap.
- Public story SSR and React pages should link the author name/avatar to `/authors/:authorId` when `author.id` is present.
- Author pages must list only public catalog stories, never private, draft, hidden, child-review-pending, or unlisted stories.
- Author pages with zero public catalog stories should return 404 or `noindex,nofollow`.
- Sitemap may include author pages only for authors with at least one public catalog story.
- Add `X-Robots-Tag: noindex,nofollow` for app-only route prefixes at nginx or app-server level.
- Return real 404/noindex for unknown public routes instead of serving the SPA shell with HTTP 200.
- Split public SEO locales from app-supported story languages. Sitemap, alternate links, and nginx localized SSR routes must use only launch-ready SEO locales.

Acceptance criteria:

- `curl https://wondertales.art/pricing` returns SSR HTML with pricing content, canonical URL, alternate links, and `index,follow`.
- `curl https://wondertales.art/authors/:authorId` returns SSR HTML with author metadata and public story links for authors with public stories.
- Opening the authenticated plans screen from inside the app uses an app-only URL such as `/billing/plans`, not `/pricing`.
- There is only one pricing display source of truth for feature order, labels, hidden features, and price formatting.
- Bundle prices shown in the authenticated billing/plans screen always match the user's current plan after checkout, portal return, upgrade, downgrade, or billing success.
- Sitemap includes only indexable SSR-backed pages, including eligible author pages.
- `/u/:token`, `/welcome`, `/register`, `/auth/*`, `/billing/success`, `/dashboard`, `/wizard`, `/me/*`, `/children`, `/characters`, `/profile`, `/settings/*`, and `/admin/*` are not indexable.
- Unknown public URLs do not return a successful indexable SPA shell.

### 2. Pricing and Billing UX

Current bundle purchase review findings:

- Bundle checkout cancel URL currently points to `/plans`, but the public web pricing route is `/pricing` and the authenticated app billing screen must become an app-only route.

Required work:

- Make pricing page SSR/static enough to load even if app API is temporarily slow.
- Show plan limits clearly:
  - stories per month;
  - audio stories per month;
  - illustrations per story;
  - child profile limits;
  - premium voices;
  - story-from-drawing;
  - sharing/publishing;
  - PDF/video export if visible.
- Explain auto-renewal, cancellation, refund policy, and non-rollover behavior.
- Hide paid CTAs if real payments are disabled.
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

Required work:

- Verify subscription checkout.
- Verify checkout success return.
- Verify checkout cancel return for subscriptions and bundles.
- Verify webhook signature verification.
- Verify subscription created/updated/canceled.
- Verify payment failed behavior.
- Verify customer portal.
- Verify bundle/credit purchases.
- Verify refund/support policy path.
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

Required work:

- Decide launch UI locales.
- Decide launch SEO locales separately from app-supported story languages.
- Hide incomplete UI locales from selectors, sitemap, SSR alternate links, and nginx localized SEO routes.
- Ensure every launch SEO locale has real translations for public SSR entry points:
  - landing;
  - pricing;
  - legal pages;
  - public story chrome;
  - public author pages;
  - public stories catalog, if indexed.
- Ensure legal pages exist for every visible public SEO locale. If a legal page falls back to English, this must be explicit in the page copy and that fallback locale should not be advertised as fully localized.
- Ensure pricing and billing copy is localized where visible.
- Ensure app error messages for auth/billing/quota are localized.
- Define canonical localized URL rules:
  - default locale may live at `/`, `/pricing`, `/terms`, `/privacy`, `/stories`, `/authors/:authorId`;
  - non-default locales live at `/{locale}/`, `/{locale}/pricing`, `/{locale}/terms`, `/{locale}/privacy`, `/{locale}/stories`, `/{locale}/authors/:authorId`;
  - public links generated from an SSR page preserve the active locale unless intentionally switching language;
  - authenticated app links preserve the user's selected UI language.
- Add SSR entry points for every indexable route in every launch SEO locale.
- Add `hreflang` alternates for every localized public page, including `x-default`.
- Add localized canonical links that match the current page language and URL.
- Add a public language dropdown that lists only launch-ready public locales.
- The language dropdown should switch to the equivalent localized URL where one exists, not to the app shell or a different route.
- Persist the selected UI language for authenticated users and keep it in sync with localized URL prefixes on web.
- Prevent accidental language drift: internal links, CTAs, redirects, auth return URLs, checkout success URLs, and share links must not unexpectedly switch the user to another language.
- Add tests or smoke checks that crawl public SSR pages and verify `html[lang]`, canonical, hreflang, visible language, and internal links agree.

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
- Add clear "private by default" section.
- Add parent-owned account explanation.
- Add child self-use explanation only if Child Mode is ready.
- Add sample stories in English or hide the empty English examples section.
- Fix PWA manifest from `Kazka+` to `WonderTales`.
- Add structured data for software/pricing/FAQ if not already present.

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
- Add unpublish action.
- Add report story action if public catalog remains enabled.
- Make `/api/v1/public/stories`, `/api/v1/public/authors/:authorId`, SSR story routes, SSR author routes, and sitemap use the same public predicate: `is_published=true`, `visibility='public'`, `published_slug IS NOT NULL`, `hidden=false`, moderation passed, and parent review approved when applicable.
- Make `/api/v1/public/u/:token` and `/ssr/u/:token` use the unlisted predicate: `is_published=true`, `visibility='unlisted'`, `share_token IS NOT NULL`, `hidden=false`, moderation passed, and parent review approved when applicable.
- Remove or deprecate older duplicate public endpoints that do not return the same shape or predicate as `/api/v1/public/stories`.
- Ensure public author metadata exposes only safe fields: public author id, pseudonym/display name, avatar, about text, and public story count. Never expose email, account settings, child profile data, private story count, or unlisted story count.

Acceptance criteria:

- Stories are private by default.
- Public catalog contains only intentionally published stories.
- Author pages contain only public catalog stories by that author.
- Unlisted stories are reachable only by token and return `noindex,nofollow`.
- Unpublishing removes story from catalog, sitemap, and public asset access.

### 7. Operational Readiness

Required work:

- Commit and deploy all required migrations.
- Verify production environment variables:
  - database;
  - JWT/auth secrets;
  - encryption key;
  - AI provider keys;
  - TTS provider keys;
  - Stripe keys;
  - Stripe webhook secret;
  - email provider keys;
  - web app URL / callback URLs.
- Verify database backups.
- Verify upload volume backups.
- Verify disk monitoring.
- Verify logs and error monitoring.
- Verify admin/support access.

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

Required work:

- Support email inbox ready.
- Templates for payment issues, deletion requests, unsafe content reports, failed generation, and refund requests.
- Admin process for finding user, subscription, story, job, and assets.
- Incident checklist for outage, payment failure, unsafe generation, data leak, and queue backlog.

Acceptance criteria:

- A support request can be handled without direct ad-hoc database spelunking for common cases.
- Critical incidents have an owner and response steps.

### 3. Usage Transparency

Required work:

- Show remaining stories/audio clearly.
- Show when limits reset.
- Show active bundle credits.
- Show why a feature is locked.
- In Child Mode, explain locked features in child-safe language and route CTAs through the parent gate.
- Do not expose checkout, customer portal, billing settings, or adult account settings directly in Child Mode.

Acceptance criteria:

- Users understand why a generation is blocked.
- Children can ask for parent help without gaining access to payment or account controls.
- Support tickets about "where did my credits go" can be answered from logs.

### 4. Cost Controls

Required work:

- Track generation cost per story.
- Track failed/retry cost.
- Alert on unusual usage.
- Rate-limit high-cost endpoints.
- Add queue depth monitoring.
- Add per-user abuse detection.

Acceptance criteria:

- A single user cannot create unbounded AI cost.
- The team can see if plan pricing is underwater.

### 5. Content Quality and Safety Review Loop

Required work:

- Review failed moderation cases.
- Review poor generation cases.
- Improve prompts and retry strategy.
- Add sample story curation.
- Add public story report/removal path.

Acceptance criteria:

- There is a weekly process for reviewing quality/safety failures.
- Public examples stay high quality.

### 6. Analytics with Consent

Required work:

- Decide analytics stack.
- Add cookie/analytics consent banner where required.
- Disable non-essential tracking before consent.
- Track only product-safe events.
- Avoid collecting child-identifying details in analytics.

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

Observed on 2026-05-01:

- Landing page at `https://wondertales.art/` returns 200 and renders Ukrainian SSR content.
- English landing page at `https://wondertales.art/en/` returns 200 and renders English SSR content.
- Public sample story pages return SSR content with Open Graph metadata.
- `robots.txt` currently allows all paths.
- `sitemap.xml` includes all public locales, pricing routes, story catalog, and sample stories.
- `/privacy` body is `Content not available.`
- `/terms` is unstable and content is not available when it renders.
- `/pricing` and `/en/pricing` are unstable or broken.
- Auth routes return SPA shell with generic metadata.
- Unknown routes return SPA shell with HTTP 200.
- `www.wondertales.art` has a TLS certificate mismatch.
- CORS reflects arbitrary origins with credentials.
- PWA manifest still uses `Kazka+`.

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
