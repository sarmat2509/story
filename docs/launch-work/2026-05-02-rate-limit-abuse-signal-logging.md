# Rate Limit Abuse Signal Logging

Date: 2026-05-02

## Summary

- Added a shared rate-limit handler that logs every exceeded API limiter with
  `abuseSignal=true`.
- The log context is intentionally coarse: limiter name, method, mounted route
  base, user id when authenticated, hashed client IP, and the limiter state.
- Raw IP addresses, full URLs, query strings, OAuth codes, reset tokens, emails,
  prompts, child data, and request bodies are not logged by this handler.
- Applied the handler to global, auth, OAuth, password reset, rating, story
  write, expensive generation, upload, billing, API, and feedback limiters.
- Added `scripts/check-production-abuse-signals.sh` to scan recent production
  API Docker logs for rate-limit and abuse-signal lines without mutating the
  server.

## Operational Use

Use production API logs to look for:

```text
Rate limit exceeded
abuseSignal=true
limiterName=...
```

or run:

```bash
./scripts/check-production-abuse-signals.sh
LOG_SINCE=6h ./scripts/check-production-abuse-signals.sh
```

Recommended beta handling:

- A small number of `password_reset`, `auth`, or `oauth` events is expected and
  can be handled manually.
- Repeated `password_reset` or `auth` events from the same `clientIpHash` should
  be reviewed before public acquisition campaigns.
- Repeated `expensive_generation` events with the same `userId` should be paired
  with admin dashboard cost controls and support history.
- Repeated anonymous `upload`, `rating`, or `feedback` events from one
  `clientIpHash` are a good signal to add WAF/CAPTCHA before scaling traffic.

## CAPTCHA/WAF Decision

For closed beta, the current approach is acceptable:

- strict auth/password-reset/OAuth IP limits,
- authenticated owner-keyed expensive-generation limits,
- upload/billing/story-write route limits,
- production logs with safe abuse markers,
- manual support/admin review.

Before public acquisition or broad paid launch, add one of:

- Turnstile/hCaptcha on registration, password reset, and anonymous feedback; or
- provider-side WAF rules for repeated 429s by IP/country/ASN; or
- both, if production logs show repeated scripted traffic.

Update on 2026-05-02: a feature-flagged Cloudflare Turnstile path now exists for
`login`, `register`, `password_reset`, and `feedback`. It remains inactive until
`EXPO_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and
`CAPTCHA_REQUIRED_ACTIONS` are configured.

## Verification

- `pnpm --filter wondertales-api exec tsx src/middleware/__tests__/rateLimiter.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-api run build:fast`
- `./scripts/deploy.sh --api`
- `curl -fsS https://wondertales.art/health`
- `./scripts/check-production-abuse-signals.sh`

Production read-only log scans before and after deploy found no rate-limit or
abuse-signal lines in the latest two-hour API log window. Fresh post-deploy API
Docker logs also had no error/warn/failed lines.

## Migration Notes

- No database migration was needed.
- No rate-limit thresholds were changed.
- No destructive operations were performed.
