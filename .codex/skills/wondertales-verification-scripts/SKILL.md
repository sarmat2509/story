---
name: wondertales-verification-scripts
description: Navigate WonderTales repository verification, diagnostic, recheck, migration, launch, production, billing, native-store, and asset scripts without rediscovering them from scratch. Use when Codex needs to choose or run a pnpm/npm/script command in this repo, especially for tests, image validation, graphic novel/comic validation, story/image/audio diagnostics, Director prompt checks, migrations, launch gates, production smoke/readiness checks, RevenueCat billing checks, or app asset generation.
---

# WonderTales Verification Scripts

## Overview

Use this skill as a command map for this repository. Prefer the existing targeted script for the task, then inspect only that script's header/arg parser if needed.

Do not invent a one-off `tsx -e` live check when a parameterized script already exists. If the existing script is missing a needed production-path detail, patch or extend the script rather than mixing old and new validation paths inline.

For production topology, deploy flow, droplet location, live logs, backup/restore, cron, alerting, or shared proxy/certbot work, switch to `wondertales-production-ops`. Keep this skill for choosing scripts and local/non-production verification commands.

## First Choice

Run commands from the repo root unless the script says otherwise. Use these defaults:

- General focused tests: `pnpm test -- --pattern <path-or-name-substring>`
- List discoverable tests: `pnpm test:list`
- Include integration or slow tests only when needed: `pnpm test -- --include-integration`, `pnpm test -- --include-slow`, or `pnpm test:all`
- Single TS test in a package: `pnpm --filter wondertales-api exec tsx src/.../__tests__/file.test.ts`
- API type/build check: `pnpm --filter wondertales-api build`
- API fast bundle check: `pnpm --filter wondertales-api run build:fast`
- Universal app type check: `pnpm --filter wondertales-universal-app type-check`
- Web export: `pnpm --filter wondertales-universal-app build:web`
- Shared package build: `pnpm --filter @wondertales/shared build`

`scripts/run-tests.mjs` is the repo test runner. It discovers `*.test.*` and `*.spec.*`; `*.integration.*` is skipped unless integration is explicitly included.

## Containerized DB And Env

Local DB/API scripts normally run through the dev Docker API container. Do not stop just because the host shell lacks `DATABASE_URL`; `docker-compose.dev.yml` injects `DATABASE_URL=postgresql://...@postgres:5432/kazka_dev` into the `api` service and loads `.env.local`.

Default container entrypoint from repo root:

```bash
pnpm api:script sh -c 'cd /app/services/api && pnpm exec tsx src/scripts/<script>.ts <args>'
```

For package scripts inside `services/api`:

```bash
pnpm api:script sh -c 'cd /app/services/api && pnpm run <script-name> -- <args>'
```

Use a host-shell `DATABASE_URL` or `--local` only when explicitly choosing local host execution. For production data, use the production/SSH wrappers and confirm intent before mutating live state.

## Image Validation

Use the script that matches the validation path being debugged:

- Graphic novel/comic validation variance by stored validation row:
  `pnpm --filter wondertales-api exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id <uuid> --runs 3`
- Segmented graphic-novel validator:
  `pnpm --filter wondertales-api exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id <uuid> --mode segmented --model gemini-3.1-flash-lite --runs 3`
- Comic panel validator:
  `pnpm --filter wondertales-api exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id <uuid> --mode comic-panels --runs 3`
- Presence-only identity sanity check:
  `pnpm --filter wondertales-api exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id <uuid> --mode presence-first --runs 3`
- Dump the prompt/images sent to the validator:
  `pnpm --filter wondertales-api exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id <uuid> --mode segmented --dump-prompt-file /tmp/wt-validation-prompt.txt`

Important: `recheckProblemImageValidation.ts` is the older compact image-validator/debug-repair path. Do not use it as the default for current graphic-novel segmented/comic validation. Use it only when explicitly debugging the old generic scene validator or its edit-repair modes.

For same-pipeline Gemini vs OpenAI comparison from a pack file:

```bash
pnpm compare:image-validation -- --pack services/api/src/scripts/packs/<pack>.json
```

This uses `compareSceneImageValidation.ts`, expects a pack with scene image plus references, and runs the production image-validation prompt/schema.

For current scene generation prompt/reference inspection or one fresh generated comparison:

```bash
pnpm --filter wondertales-api exec tsx src/scripts/compareSceneImageGeneration.ts --story-id <uuid> --scene-id <n> --prompt-only
pnpm --filter wondertales-api exec tsx src/scripts/compareSceneImageGeneration.ts --story-id <uuid> --scene-id <n> --runs 1
```

For graphic-novel page generation diagnostics from an existing story:

```bash
pnpm --filter wondertales-api exec tsx src/scripts/runGraphicNovelDiagnosticForStory.ts --story-id=<uuid> --text-only
pnpm --filter wondertales-api exec tsx src/scripts/runGraphicNovelDiagnosticForStory.ts --story-id=<uuid> --stop-after-first-page
```

For experimental free-layout graphic-novel page generation with outfit plates and normal references:

```bash
pnpm --filter wondertales-api exec tsx src/scripts/generateFreeLayoutGraphicNovelPage.ts --story-id=<uuid> --page=1 --panel-count=5 --prompt-only=true
```

If a validation investigation specifically needs outfit-plate references attached to a stored graphic-novel validation row, first check whether `recheckGraphicNovelValidationVariance.ts` now loads those references from saved page generation params. If it does not, extend that script; do not fall back to `recheckProblemImageValidation.ts` or ad hoc inline SQL.

## Story Diagnostics

Prefer parameterized diagnostics:

- Story content/images/audio overview:
  `pnpm --filter wondertales-api exec tsx src/scripts/checkStoryStatus.ts <storyId>`
- Asset rows and scene rows:
  `pnpm --filter wondertales-api exec tsx src/scripts/checkStoryAssets.ts <storyId>`
- Audio metadata/assets:
  `pnpm --filter wondertales-api exec tsx src/scripts/checkStoryAudio.ts <storyId>`
- SceneVisual dump from `stories.scenes`:
  `pnpm --filter wondertales-api exec tsx src/scripts/dumpSceneVisuals.ts <storyId>`
- SceneVisual as JSON:
  `pnpm --filter wondertales-api exec tsx src/scripts/dumpSceneVisuals.ts <storyId> --json`
- Director vs story text:
  `pnpm --filter wondertales-api exec tsx src/scripts/dumpDirectorVsText.ts <storyId>`
- Show one scene's composed image prompt:
  `pnpm --filter wondertales-api exec tsx src/scripts/showSceneImagePrompt.ts <storyId> <sceneId>`
- Show prompt from an LLM response JSON:
  `pnpm --filter wondertales-api exec tsx src/scripts/showSceneImagePrompt.ts --json <file> <sceneId>`

Avoid the hardcoded old probes unless you are deliberately updating them: `checkStoryImages.ts`, `checkSceneImages.ts`, `showVisualPrompts.ts`, and several `*41115014*` scripts have baked-in story IDs or one-off history.

## DB Backfills

Run DB backfills through the API container unless a local `DATABASE_URL` was intentionally exported.

- AI usage cost backfill dry run:
  `pnpm api:script sh -c 'cd /app/services/api && pnpm run backfill:ai-usage-costs -- --dry-run'`
- AI usage cost backfill scoped apply:
  `pnpm api:script sh -c 'cd /app/services/api && pnpm run backfill:ai-usage-costs -- --days=30 --limit=500'`

For broad apply, omit `--days`/`--limit` only when the user or task explicitly intends a full mutation. If the script exits with `DATABASE_URL is not set`, rerun it through `pnpm api:script` before concluding the backfill cannot run.

## Director Checks

Compare Director providers:

```bash
pnpm compare:director -- --story <storyId>
pnpm compare:director -- --story <storyId> --images <n> --prompt-only
pnpm compare:director -- --fixture services/api/src/scripts/packs/director-compare.fixture.example.json
```

`compareDirectorTextProviders.ts` runs the same Director prompt/schema path for Gemini and OpenAI. Use `--prompt-only` before spending model calls when checking prompt composition.

## Migrations

Use SQL migration runners deliberately:

- Check migration filenames/destructive patterns:
  `pnpm --filter wondertales-api exec tsx src/scripts/checkMigrationFiles.ts`
- Run all pending SQL migrations locally:
  `pnpm --filter wondertales-api exec tsx src/scripts/runAllMigrations.ts`
- Run selected SQL migrations:
  `pnpm --filter wondertales-api exec tsx src/scripts/runAllMigrations.ts 0121_name.sql`
- Root wrapper for all pending migrations:
  `./scripts/run-all-migrations.sh`
- Root wrapper for one migration via dev Docker:
  `./scripts/runMigration.sh 0121_name.sql`
- One migration locally with `DATABASE_URL`:
  `./scripts/runMigration.sh 0121_name.sql --local`

`scripts/run-migrations.sh` is a different older helper that runs `drizzle-kit push` plus triggers. Do not use it as the default SQL journal migration runner.

## Launch And Production

Choose the smallest gate that covers the changed surface:

- Main prelaunch local gate:
  `pnpm launch:gate`
- Production public/API smoke:
  `pnpm launch:check-production-smoke`
- Full production smoke with auth/admin/checkout/child-mode:
  `pnpm launch:check-production-smoke:full`
- Production ops readiness, read-only by default:
  `pnpm launch:check-production-ops`
- Ops plus backup smoke:
  `pnpm launch:check-production-ops:backup-smoke`
- Local static security header config check:
  `pnpm launch:check-security-headers`
- Fetch deployed production security headers/assets and scan them:
  `pnpm launch:check-production-security-artifacts`
- Built client bundle secret scan after `build:web`:
  `pnpm launch:scan-client-secrets`
- API production asset packaging guard:
  `bash scripts/check-api-production-assets.sh`
- Production auth/recovery smoke:
  `bash scripts/check-production-auth.sh`
- Production abuse log scan:
  `bash scripts/check-production-abuse-signals.sh`
- Production orphan cleanup dry run:
  `bash scripts/check-production-orphan-cleanup.sh`

Production scripts may require credentials, tokens, SSH, or live network access. Treat them as verification gates, not unit tests.

## Billing And Stores

Use these for paid/native/revenue changes:

- Paid launch operator/external readiness:
  `pnpm launch:check-paid-readiness`
- Native store source/config/readiness:
  `pnpm launch:check-native-store-readiness`
- Store build preflight:
  `pnpm launch:check-store-build-preflight`
- RevenueCat read-only catalog check:
  `pnpm launch:check-revenuecat-catalog`
- RevenueCat sync dry run:
  `pnpm launch:sync-revenuecat-catalog`
- RevenueCat sync apply:
  `node scripts/sync-revenuecat-catalog.js --apply`
- RevenueCat catalog unit check:
  `pnpm test:revenuecat-catalog`

`sync-revenuecat-catalog.js` is dry-run by default. Only use `--apply` when the task explicitly calls for mutating RevenueCat.

## Operations Helpers

Use these when changing ops/runtime behavior:

- Wait for queue/request drain:
  `pnpm --filter wondertales-api exec tsx src/scripts/waitForGenerationDrain.ts --timeout-ms=900000 --poll-ms=5000`
- Set runtime mode:
  `pnpm --filter wondertales-api exec tsx src/scripts/setOpsMode.ts <normal|draining|maintenance> [message] [endsAtIso]`
- Expire stale story requests, dry run:
  `pnpm --filter wondertales-api exec tsx src/scripts/expireStaleStoryRequests.ts --dry-run`
- Orphan storage scan, dry run:
  `pnpm --filter wondertales-api exec tsx src/scripts/scanOrphanStorageFiles.ts --summary --min-age-hours=168`

Pass `--apply` only for cleanup scripts when deletion/mutation is explicitly intended.

## App Asset Scripts

Use app scripts from `apps/universal-app` through pnpm filters:

- Generate app/web icons:
  `pnpm --filter wondertales-universal-app generate:icons`
- Generate OG landing image:
  `pnpm --filter wondertales-universal-app generate:og-landing`
- Optimize landing assets:
  `pnpm --filter wondertales-universal-app optimize:landing-assets`
- Slice voice avatar source grid:
  `pnpm --filter wondertales-universal-app slice:voice-avatars`

For blog images, use the separate `wondertales-blog-article` skill and its optimizer.

## Dev Servers

- Full repo dev:
  `pnpm dev`
- API only:
  `pnpm dev:api`
- App/Expo:
  `pnpm dev:app`
- Web dev helper with Docker/API/Metro:
  `bash apps/universal-app/start-web-dev.sh`
- Docker dev stack:
  `pnpm docker:dev`

`apps/universal-app/start-web-dev.sh` starts Docker services and Metro and may kill an existing process on port 8082.
