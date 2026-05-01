# Story deletion storage cleanup

Date: 2026-05-01

## What changed

- Story deletion now collects storage paths before deleting the story row.
- Deleted paths include story asset files, thumbnails, audio asset files, and rejected image-validation debug files.
- Storage files are deleted before the database story row is deleted, so a transient storage deletion failure keeps the story retryable instead of orphaning files silently.
- Published story deletion now removes the published slug cache and invalidates the sitemap cache.
- Stories shown on the landing page now bump the landing render version when deleted.

## Notes

- This does not delete shared cache assets such as environment or outfit plate cache rows unless they are stored as story-owned assets.
- Account-level deletion still needs a broader cleanup pass for all user-owned stories, profile photos, child profile assets, and character assets.

## Verification

- Added direct path collection coverage in `services/api/src/services/__tests__/storyDeletionService.test.ts`.
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyDeletionService.test.ts`
- `pnpm --filter wondertales-api build`
- Live API smoke: deleting a temporary story removed the story row, a completed image file, and a rejected image-validation debug file.
