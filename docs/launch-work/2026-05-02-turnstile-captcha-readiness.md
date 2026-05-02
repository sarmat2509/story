# Turnstile CAPTCHA Readiness

Date: 2026-05-02

## Context

Closed beta can run on strict rate limits plus safe abuse-signal logs, but public acquisition should have a stronger bot-control option ready for auth, password reset, and anonymous support paths.

## Changes

- Added feature-flagged Cloudflare Turnstile verification on the API.
- Added optional web token acquisition through `EXPO_PUBLIC_TURNSTILE_SITE_KEY`.
- Added API support for CAPTCHA tokens on:
  - email/password login;
  - email/password registration;
  - forgot-password;
  - feedback submission.
- CAPTCHA enforcement is controlled by `CAPTCHA_REQUIRED_ACTIONS`.
  - Supported values: `login`, `register`, `password_reset`, `feedback`.
  - Example: `CAPTCHA_REQUIRED_ACTIONS=register,password_reset,feedback`.
- `TURNSTILE_SECRET_KEY` is required at API startup when any CAPTCHA action is configured.
- Production web CSP now allows only the Cloudflare Turnstile challenge origin in addition to the existing self/PostHog sources.
- Added launch-gate coverage for Turnstile verification behavior.

## Activation Notes

To turn this on later:

```bash
EXPO_PUBLIC_TURNSTILE_SITE_KEY=<public-site-key>
TURNSTILE_SECRET_KEY=<secret-key>
CAPTCHA_REQUIRED_ACTIONS=register,password_reset,feedback
```

Do not enable `login` until the login UX is checked with real users; start with registration, password reset, and anonymous feedback if abuse signals appear.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/captchaService.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:check-security-headers`

## Result

The CAPTCHA path is ready but inactive by default, so current closed-beta flows stay unchanged. Public acquisition can enable Turnstile by environment configuration without another code path rewrite.
