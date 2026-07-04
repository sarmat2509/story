---
name: wondertales-project-map
description: Navigate the WonderTales repository structure, database schema, module boundaries, shared schemas, localization/content dictionaries, frontend/API boundaries, AI/audio/image providers, config, storage, admin, SSR, billing, and operational surfaces. Use before broad project changes, when asked where something lives, when tracing a non-generation feature, or when deciding which module/table/provider owns behavior in this repo.
---

# WonderTales Project Map

## Overview

Use this skill to orient in the WonderTales monorepo before editing. It maps ownership boundaries and durable source-of-truth files; use `wondertales-generation-flow` for story/comic runtime flow and `wondertales-verification-scripts` for choosing commands or diagnostic scripts.

## First Pass

Start with source files, not stale docs. Prefer `rg` around the listed pivots, then open the smallest relevant service, route, schema, or repository slice.

- Repository layout and module ownership: read `references/repository-map.md`.
- Tables, persisted content, dictionaries, languages, SSR/localization: read `references/database-content-localization.md`.
- Provider selection, AI/image/audio runtime config, storage, rate limits: read `references/providers-runtime.md`.
- Frontend screens, API hooks, shared schemas, admin and public surfaces: read `references/frontend-api-surfaces.md`.

## Routing Rules

- For story, instant, child-mode, continuation, graphic novel, mixed story, image validation, or regeneration flow, switch to `wondertales-generation-flow`.
- For tests, scripts, migrations, launch gates, image rechecks, or production diagnostics, switch to `wondertales-verification-scripts`.
- For blog SSR article content, switch to `wondertales-blog-article`.
- For table meaning, inspect `services/api/src/db/schema.ts` first, then the matching repository in `services/api/src/repositories`.
- For app payload shape, inspect `packages/shared/src/schemas/index.ts` first, then API route and frontend hook.
- For provider wiring, inspect `services/api/src/services/aiService.ts`; orchestration should call domain services rather than providers directly.

## Common Pivots

- `services/api/src/routes` maps HTTP endpoints to services.
- `services/api/src/services` owns orchestration, quota, safety, billing, storage, operations, and provider factories.
- `services/api/src/domain` owns provider-agnostic domain logic and schemas.
- `services/api/src/prompts` owns prompt builders; do not build prompts inline when a prompt builder exists.
- `services/api/src/providers` owns vendor adapters behind base interfaces.
- `packages/shared/src` owns shared schemas, types, i18n config, constants, and SSR helpers.
- `apps/universal-app/src/api` owns React Query API hooks; screens should usually call these hooks rather than raw client calls.
- `services/api/drizzle` contains SQL migrations; current schema shape is still `services/api/src/db/schema.ts`.
