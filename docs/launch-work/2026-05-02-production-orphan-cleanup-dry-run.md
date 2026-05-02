# Production Orphan Cleanup Dry Run

## Context

P0 still required a target-environment review before any orphan storage cleanup
apply mode could be considered. The production cleanup policy remains
non-destructive by default: no `--apply`, no scheduled delete mode, and no
`ORPHAN_STORAGE_CLEANUP_APPLY=true` without explicit operator approval.

## Changes

- Bundled `scanOrphanStorageFiles.ts` into the production API build as
  `dist/scripts/scanOrphanStorageFiles.js`.
- Added `scripts/check-production-orphan-cleanup.sh`, a non-destructive smoke
  wrapper that runs the production scanner with `LOG_LEVEL=fatal`, validates that
  `dryRun=true`, and fails if any deletion is reported.
- Extended the API production asset check so the scanner entrypoint stays wired
  into the production build.

## Production Dry-Run Result

Command:

```bash
./scripts/check-production-orphan-cleanup.sh
```

Result on 2026-05-02:

- `storageRoot`: `/app/services/api/uploads`
- `dryRun`: `true`
- `minAgeMs`: `604800000` (168 hours)
- `scannedFiles`: `1356`
- `referencedPaths`: `1025`
- `orphanCount`: `361`
- `eligibleOrphanCount`: `361`
- `skippedYoungOrphanCount`: `0`
- `deletedCount`: `0`

The first candidate paths are rejected image-validation artifacts under the
`development/.../rejected/` storage prefix. They look like historical generated
debug/rejection outputs, but apply mode remains blocked until the operator
approves retention policy and a deletion window.

## Verification

- `pnpm --filter wondertales-api build:fast`
- `pnpm --filter wondertales-api build`
- `bash scripts/check-api-production-assets.sh`
- `./scripts/deploy.sh --api`
- `./scripts/check-production-orphan-cleanup.sh`
- `curl https://wondertales.art/health`
- Production API logs after the redeploy show the orphan scheduler is still
  disabled and no cleanup errors are present.
