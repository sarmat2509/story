# Orphan storage cleanup dry run

Date: 2026-05-01

## What changed

- Added an orphan storage scanner for local upload storage.
- The scanner builds a DB reference set from assets, validation image rows, child profiles, characters, user avatars, story JSON metadata, cache tables, and configured TTS voice samples.
- The default mode is dry-run. File deletion only happens when `--apply` is passed explicitly.
- Deletion is limited by `--max-delete` and guarded by path resolution so traversal paths cannot escape the configured storage root.
- Hidden files/directories, `.DS_Store`, `.gitkeep`, and `voice-samples/` are excluded from scan candidates.
- Added the scanner test to the launch gate.

## Operator notes

- Review dry-run output in the target environment before enabling any scheduled deletion.
- Keep production cleanup paused until retention policy and support workflow owners approve the delete window.
- Start with a low `--max-delete` if `--apply` is ever enabled.

## Verification

- `pnpm exec tsx src/services/__tests__/orphanStorageCleanupService.test.ts`
- `pnpm exec tsx src/services/__tests__/userDataExportService.test.ts`
- `pnpm build` in `services/api`
- Dev dry-run in the API container:
  - `storageRoot`: `/app/services/api/uploads`
  - `dryRun`: `true`
  - `scannedFiles`: `3203`
  - `referencedPaths`: `2456`
  - `orphanCount`: `867`
  - `deletedCount`: `0`
