# CORS origin restriction

## Scope

- Replaced credentialed arbitrary-origin CORS reflection with an explicit browser origin allowlist.
- Added `CORS_ALLOWED_ORIGINS` as a comma-separated production allowlist.
- Kept requests without an `Origin` header allowed for server-to-server clients, mobile runtimes, curl, and health checks.
- Kept local web development ergonomic by allowing `localhost`, `127.0.0.1`, and `::1` origins outside production.

## Verification

- `pnpm --filter wondertales-api build` passed.
- `curl -i -H 'Origin: http://localhost:8081' http://localhost:3000/health` returns `Access-Control-Allow-Origin: http://localhost:8081` and `Access-Control-Allow-Credentials: true`.
- `curl -i -H 'Origin: https://evil.example' http://localhost:3000/health` returns no `Access-Control-Allow-Origin`.
- Allowed preflight to `/api/v1/plans` returns `204` with the expected CORS headers.
- Disallowed preflight to `/api/v1/plans` returns no CORS headers, so the browser blocks credentialed cross-origin access.
