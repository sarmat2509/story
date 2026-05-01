# Private asset access

## Scope

- Replaced raw public story asset delivery with a story-aware access decision.
- Public catalog story assets remain public only when the story is currently published, visible as `public`, has a published slug, and is not hidden.
- Unlisted story assets now require the matching `shareToken` query parameter.
- Private story assets require an owner or admin session and are served with private cache headers.
- Signed asset URLs remain supported for backward compatibility, except hidden stories and rejected/debug assets do not become public through raw paths.
- Rejected image/debug files under `rejected/` are no longer public; they require private owner/admin access.
- Public story predicates now exclude hidden stories and require unlisted visibility for share-token routes.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/assetAccessService.test.ts` passed.
- `pnpm --filter wondertales-api build` passed.
- `docker compose -f docker-compose.dev.yml exec -T api pnpm exec tsx src/scripts/testSecurityFixes.ts` passed.
- Live dev API checks:
  - raw private asset request without auth returns `401`;
  - the same private asset with an owner bearer session returns `200` and `Cache-Control: private`;
  - public catalog asset request returns `200` and public asset headers;
  - raw unlisted asset request without `shareToken` returns `401`;
  - unlisted asset request with the matching `shareToken` returns `200`;
  - `/api/v1/public/u/:token` now emits unlisted scene asset URLs with `shareToken` attached;
  - rejected/debug image path without auth returns `401`.
