# Store Privacy And Data Safety Drafts

Last updated: 2026-05-10

These are implementation-based drafts for App Store Connect App Privacy and
Google Play Data safety. They are not legal advice. Final answers must be
approved by the account owner and must match the exact production SDKs,
analytics settings, storage, support workflows, and submitted binary.

## Data Collected

- Account data: parent email, display name, login/auth identifiers, locale, and account settings.
- Child profile data: child name/nickname, birth date/age settings, language and story preferences, access limits, profile status, and optional author profile copy.
- User content: child profile photos, character reference photos, generated stories, generated story images, narration/audio assets, story settings, public/unlisted story metadata, and support screenshots when submitted.
- Purchases: subscription state, plan entitlement, purchase provider identifiers, renewal/cancellation state, and limited billing status metadata.
- Support and reports: feedback messages, unsafe-content reports, privacy requests, account deletion/export requests, report category, reported story identifiers, and admin review status.
- Usage and diagnostics: app interactions and diagnostic events only when the relevant analytics/diagnostic SDK is enabled and consent rules allow it.

## Data Not Intended For Current Release

- Precise location
- Contacts
- SMS or call logs
- Health or fitness data
- Advertising ID
- Third-party ads
- Camera capture in the current release
- Microphone recording in the current release

## Apple App Privacy Draft

Data linked to the user:

- Contact Info: email address
- User Content: photos, generated story content, support messages, feedback screenshots
- Identifiers: user/account id, RevenueCat/customer identifiers, provider auth ids
- Purchases: purchase history/subscription status
- Usage Data: product interaction, only when analytics consent applies
- Diagnostics: crash/performance diagnostics if enabled by production SDKs

Data used for:

- App functionality
- Account management
- Personalization
- Customer support
- Safety, moderation, and fraud prevention
- Analytics, only when enabled and consented

Data not used for:

- Third-party advertising
- Cross-app tracking
- Selling user data

Account deletion:

- In-app account deletion request/action exists in Profile.
- Child data deletion request exists for authenticated parents.
- Support fallback: support@wondertales.art.

## Google Data Safety Draft

Data types likely disclosed:

- Personal info: email address, name/display name
- Photos and videos: uploaded reference photos and support screenshots
- Audio files: generated narration/audio files
- Files and docs: generated story assets and exports, if applicable
- App activity: app interactions and in-app search/story setup, if analytics enabled
- App info and performance: diagnostics/crash data if enabled
- Financial info: purchase history/subscription status, not raw card data
- User IDs: app account id, RevenueCat/customer ids, provider auth ids

Purposes:

- App functionality
- Personalization
- Account management
- Developer communications and support
- Fraud prevention, security, and compliance
- Analytics, where consented

Security and user controls:

- Data is transmitted over HTTPS.
- Parent/legal guardian consent gates exist for account creation and child data.
- Photo upload requires image rights confirmations.
- Public sharing is controlled by parent settings.
- Generated content can be reported in app.
- Account export/deletion and child data deletion requests are available.

## Target Audience / Families Recommendation

Safest launch framing:

- Target adults / parents as the primary audience.
- Do not submit as Kids Category / Designed for Families unless the owner
  intentionally accepts the stricter child-directed requirements and verifies
  every SDK, link, purchase flow, data practice, and moderation process against
  those rules.

Rationale:

- Account setup, child profiles, image uploads, purchases, sharing, privacy
  requests, and deletion are parent-managed.
- Children may use Child Mode, but only inside parent-configured boundaries.

## IARC / Age Rating Draft

Likely answers to verify in the store questionnaires:

- Violence: none or very mild fantasy content only, generated stories should be
  safe for children.
- Fear/horror: none or mild fantasy themes if user-selected story themes allow it.
- Sexual content/nudity: none.
- Profanity: none.
- Controlled substances: none.
- Gambling: none.
- User interaction: yes, public/unlisted story sharing and report flow exist.
- User-generated content: yes or equivalent, because users can publish/share
  generated stories and reports are reviewed.
- Location sharing: no.
- Purchases: yes, subscriptions.
- AI-generated content: yes, fictional illustrated story content and narration.

Review before submission if new story themes, public community features, chat,
ads, or external links are added.

