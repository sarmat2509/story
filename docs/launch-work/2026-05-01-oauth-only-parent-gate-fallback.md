# OAuth-Only Parent Gate Fallback

Date: 2026-05-01

## What changed

- Added signed parent-gate OAuth state for web re-authentication callbacks.
- Added Google web parent-gate start flow that returns a signed OAuth URL from an authenticated child session.
- Added Google and Apple token parent-gate endpoints for native re-authentication.
- Hardened OAuth parent gate so it only accepts an OAuth identity already linked to the current parent account; it does not create or link users during parent-gate recovery.
- Updated Child Mode return modal with password plus Google/Apple re-auth fallback actions and localized errors.
- Updated OAuth callback handling so parent-gate re-auth lands back in the parent Children area.
- Made the web OAuth callback route available above child-session navigation so persisted Child Mode state cannot intercept `/auth/:provider/callback`.
- Added targeted tests for signed parent-gate state and OAuth identity ownership.

## Verification

- `pnpm --dir services/api exec tsx src/services/__tests__/oauthParentGateStateService.test.ts`
- `pnpm --dir services/api exec tsx src/services/__tests__/oauthParentGateService.test.ts`
- `node -e "for (const f of ['en','ru','uk','es','de','fr','pl']) JSON.parse(require('fs').readFileSync('packages/shared/src/i18n/'+f+'.json','utf8')); console.log('i18n json ok')"`
- `pnpm --filter wondertales-api build`
- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-universal-app build:web`
- `pnpm launch:gate`
- Chrome DevTools MCP smoke: mocked Child Mode, opened parent gate, confirmed Google fallback action, completed callback with a real local API parent token, and landed on `/children` with `sessionMode: parent`.
- Docker logs checked after gate and smoke: API was clean aside from normal dev hot-reload restarts after shared i18n changes; nginx still shows the known IPv6 Metro upstream fallback and `/message` 404 dev noise.

## Notes

- No database migration was required.
- Production callback URL and real provider re-auth still need live verification on the deployed domain.
