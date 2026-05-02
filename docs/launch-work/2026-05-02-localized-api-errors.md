# Localized API Error Messages

## Summary

- Added a shared frontend helper that maps stable API error codes to localized app copy instead of showing raw server `message` text.
- Applied the helper to email login, registration, forgot/reset password, plan upgrade, and bundle checkout errors.
- Marked auth `401` mutations as handled client-side so invalid login/OAuth-token errors do not clear the app session before localized copy can render.
- Suppressed expected handled `4xx` mutation errors from the global React Query console logger while preserving `5xx`/unknown error logging.
- Localized auth, billing, and quota-style API error codes for `uk`, `en`, `ru`, `es`, `fr`, `de`, and `pl`.
- OAuth callback now shows localized loading/error copy, avoids logging the fetched user response, and applies the stored `preferredLocale` before entering the app.
- Added stable web IDs and autofill hints to auth email/password inputs.
- Added launch-gate coverage to ensure the API-error and OAuth callback i18n keys exist in every visible app locale.

## Files Changed

- `apps/universal-app/src/utils/localizedApiError.ts`
- `apps/universal-app/src/App.tsx`
- `apps/universal-app/src/api/auth.ts`
- `apps/universal-app/src/screens/public/WelcomeScreen.tsx`
- `apps/universal-app/src/screens/auth/RegisterScreen.tsx`
- `apps/universal-app/src/screens/auth/ForgotPasswordScreen.tsx`
- `apps/universal-app/src/screens/auth/ResetPasswordScreen.tsx`
- `apps/universal-app/src/screens/auth/OAuthCallbackScreen.tsx`
- `apps/universal-app/src/screens/plans/PlansScreen.tsx`
- `packages/shared/src/i18n/*.json`
- `services/api/src/ssr/__tests__/appErrorI18n.test.ts`
- `scripts/launch-gate.sh`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `cd services/api && pnpm exec tsx src/ssr/__tests__/appErrorI18n.test.ts`
- `pnpm launch:gate`
- `./scripts/deploy.sh --web`
- Chrome DevTools production check on `https://wondertales.art/ru/welcome`: invalid email/password login keeps the form state and renders `Неверный email или пароль`; network shows expected `POST /api/v1/auth/sessions` `401`.
- Chrome DevTools console check after the invalid-login flow: raw `Query error` / `HTTP Error 401` app logs are gone; remaining noise is the browser's expected `Failed to load resource` entry for the deliberate `401` plus a verbose Chrome form-structure hint.
- Production docker logs checked for `api`, `nginx`, and `webapp` after deploy: the new web bundle served correctly, `POST /api/v1/auth/sessions` returned the expected `401`, and no API exceptions were present. The only notable warning was the known nginx temporary-buffer message for the large JS bundle.

## Migration Notes

- No database migration was required.
- No destructive operation was used.
