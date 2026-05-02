# Auth Hydration Deep Links

Date: 2026-05-02

## Summary

- Fixed a protected-route race where web deep links could redirect an already authenticated user to `/welcome` before persisted auth state finished hydrating.
- App initialization now waits for Zustand auth-store hydration instead of sleeping for a fixed 100ms.
- `AuthGuard` also waits for hydration before deciding whether to redirect to the welcome/login screen.

## Detection

- Production DevTools authenticated screen sweep showed `/dashboard`, `/wizard`, `/me/stories`, `/profile`, `/settings/language`, and `/settings/theme` rendering cleanly.
- Direct navigation to `/children` exposed an intermittent redirect to `/welcome` despite the authenticated API session being valid.

## Validation

- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- `./scripts/deploy.sh --web`
- Production DevTools fresh isolated login verified `/dashboard` renders after email/password login.
- Production DevTools verified direct `/children` and `/characters` deep links render in the admin/artisan context with no console error/warn messages.
- Production DevTools confirmed the QA Free User redirect from `/children` to `/welcome` is expected because that account is in Instant Mode and the artisan child/character routes are not mounted for that mode.
- Production docker logs after web deploy showed only benign nginx proxy-buffering warnings for the large JS bundle and no application errors.

## Migration Notes

- No database migration was needed.
- This is a client-side web/native auth-boot timing fix only.
