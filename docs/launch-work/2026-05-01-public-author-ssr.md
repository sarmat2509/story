# Public Author SSR

## What Changed

- Added API SSR rendering for `/authors/:authorId` through `services/api/src/routes/ssrAuthors.ts` and `services/api/src/ssr/renderPublicAuthorHtml.ts`.
- Routed nginx `/authors/` traffic to the API SSR author endpoint in shared, dev, and production nginx configs.
- Limited author SSR indexing to authors with at least one public catalog story; missing, invalid, or zero-public-story authors return 404 with `X-Robots-Tag: noindex,nofollow`.
- Hardened public author lookup against invalid UUID values before hitting Postgres.
- Allowed public profile avatar reads only when the requested file is the exact public author avatar and the author has public catalog stories.
- Updated published story SSR to link the author name to `/authors/:authorId` when an author id is present.
- Added launch-gate coverage for the new author SSR renderer.

## Verification

- `pnpm --filter @wondertales/shared build`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderPublicAuthorHtml.test.ts`
- `pnpm --filter wondertales-api build`
- `curl -I http://localhost:8081/authors/23a825d6-d750-4297-bf17-5e2452d112aa`
- `curl -I http://localhost:8081/authors/nonexistent-author`
- `curl -I http://localhost:8081/api/v1/assets/development/23a825d6-d750-4297-bf17-5e2452d112aa/photos/profile/1774734791213.jpg`
- Chrome DevTools live check on `http://localhost:8081/authors/23a825d6-d750-4297-bf17-5e2452d112aa`.
- Docker logs checked for `api` and `nginx`; API stayed clean, author/avatar requests returned successfully, and dev nginx still has the known non-fatal IPv6 fallback warnings when proxying Metro assets.

## Remaining Follow-Up

- Add eligible author pages to `sitemap.xml` after implementing a shared author eligibility query.
- Add localized `/en/authors/:authorId` SSR ownership if localized author pages remain in the launch SEO contract.
- Remove or quiet the dev nginx `host.docker.internal:8082` IPv6 fallback warning path.
