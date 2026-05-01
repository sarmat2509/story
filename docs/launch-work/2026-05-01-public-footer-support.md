# Public Footer And Support Route

Date: 2026-05-01

## What changed

- Added a shared SSR public footer with links to Home, Pricing, Stories, Terms, Privacy, and Support.
- Rendered the footer on public landing, pricing, terms, privacy, and support pages.
- Added a public `/support` SSR page with a support email link.
- Added `SUPPORT_EMAIL` config with `support@wondertales.art` as the current default.
- Routed `/support` through API SSR in dev/prod nginx configs and the shared SSR nginx include.
- Kept `/support` out of sitemap and marked it `noindex,follow`.

## Verification

- `pnpm --filter wondertales-api build`
- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -t`
- Prod nginx syntax check with a temporary dummy certificate and `--add-host api/webapp`.
- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -s reload`
- `curl -I http://localhost:8081/support` returns `200` with `X-Robots-Tag: noindex,follow`.
- `curl http://localhost:8081/`, `/pricing`, `/terms`, and `/privacy` show footer links for pricing/stories/legal/support.
- In-app browser smoke opened `/support`, found the Support heading and mailto link, with zero console errors.

## Follow-up

- Replace placeholder legal markdown with launch-ready Terms, Privacy, child privacy, cookie, refund, deletion, AI content, and public sharing policy text.
- Confirm the final legal operator identity before external beta.
