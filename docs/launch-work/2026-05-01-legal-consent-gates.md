# Legal consent gates

## Scope

- Added `user_consent_records` migration and Drizzle schema/repository support.
- Added versioned consent records for:
  - Terms of Service;
  - Privacy Policy;
  - adult parent/legal guardian confirmation;
  - child data processing consent.
- Email registration now rejects missing Terms, Privacy, or adult guardian confirmation with `CONSENT_REQUIRED`.
- Successful email registration records the current document versions with timestamp, user id, IP, user agent, and source context.
- Child photo upload, child photo analysis, and child profile creation now require current child-data consent or an explicit consent flag in the request.
- Register UI now requires parent/legal guardian, Terms, and Privacy checkboxes before submit.
- Child profile UI now requires parental child-data consent before uploading child photos or creating a child profile.

## Verification

- Applied migration `0084_user_consent_records.sql` in dev with `runAllMigrations.ts`.
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/consentService.test.ts` passed.
- `pnpm --filter wondertales-api build` passed.
- `pnpm --filter wondertales-universal-app type-check` passed.
- `pnpm --filter wondertales-universal-app build:web` passed.
- Parsed all shared i18n JSON files successfully.
- Live API smoke:
  - registration without consent returns `400` and `CONSENT_REQUIRED`;
  - registration with all three consent flags creates `adult_guardian`, `privacy_policy`, and `terms_of_service` records for version `2026-05-01`;
  - child photo analysis without child-data consent returns `403` and `CHILD_DATA_CONSENT_REQUIRED`.
- In-app browser smoke on `/register` confirmed the consent checkboxes render with Terms/Privacy links and no console errors.

## Remaining

- OAuth sign-up still needs a consent interstitial before first account completion.
- Real legal markdown content and operator disclosure still need product/legal input before public launch.

