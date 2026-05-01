# Launch Gate CI - 2026-05-01

## Scope

Added an executable launch gate and wired it into the GitHub deploy workflow before production deployment.

## Changed

- Added `pnpm launch:gate`.
- Added `scripts/launch-gate.sh`.
- Added static migration safety checks in `services/api/src/scripts/checkMigrationFiles.ts`.
- Updated `.github/workflows/deploy.yml` so deploy requires the launch gate job first.
- Updated production deploy migrations to use the tracked `runAllMigrations.ts` runner instead of `drizzle-kit push:pg --force`.
- Added `WT_ENV_PRESERVE_KEYS` support to `loadEnvForScripts` so explicit CI/gate environment variables can be protected from local `.env.local` overrides when needed.

## Gate Coverage

- Shared package build.
- Critical API unit-style tests for queue failure hooks, public SEO locales, asset access, quota, bundles, child profile anonymization, consent, photo input safety, prompt safety, deletion path collection, publish safety, upload validation, and voice/story-from-drawing access.
- Static migration checks:
  - migration files must follow `NNNN_name.sql`;
  - migration files must not be empty;
  - new migrations after the current launch baseline must not introduce destructive `DROP` or `TRUNCATE`.
- API TypeScript build.
- Web TypeScript check.
- Web export build.

## Migration Note

Live replay of the full historical migration folder on a blank database is not enabled in the default gate yet. A local smoke on a temporary blank database showed the historical baseline migration `0001_complete_schema.sql` overlaps with later early migrations, so a full replay currently fails on duplicate relations. That should be normalized separately before making fresh-database replay mandatory.

Production deploy now executes the tracked SQL migration runner against the existing deployment database, matching the repository deploy script and avoiding forced schema pushes.

## Verification

- `pnpm launch:gate`
