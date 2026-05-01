# Account deletion storage cleanup

Date: 2026-05-01

## What changed

- Account deletion now gathers user-owned story storage paths before deleting the user row.
- It includes story assets, thumbnails, audio files, rejected image-validation debug files, child profile reference/turnaround files, character reference/turnaround files, and user avatar URLs that point at `/api/v1/assets`.
- Storage files are deleted before the account row is deleted, keeping the account retryable if storage deletion fails.
- Published story slug cache, sitemap cache, and landing render cache are invalidated when a deleted account had public stories.

## Notes

- This preserves the existing database cascade behavior for billing/subscription rows. Separate legal/accounting retention work is still needed before paid public launch if billing records must be retained outside the user row.
- S3 delete still depends on implementing `AssetStorageService.deleteFromS3`; local storage cleanup is covered now.

## Verification

- Added direct URL/path collection coverage in `services/api/src/services/__tests__/userDeletionService.test.ts`.
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/userDeletionService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyDeletionService.test.ts`
- `pnpm --filter wondertales-api build`
- Live API smoke: deleting a temporary account through `/api/v1/me` removed the user row, a story image file, profile avatar file, child reference photo, and character reference photo.
