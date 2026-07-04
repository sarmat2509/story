# Database, Content, Localization

## Schema Source

Use `services/api/src/db/schema.ts` as the current schema source. Migrations in `services/api/drizzle` explain history but can lag behind the effective model during development.

## Local DB Runtime

Local development data normally lives behind `docker-compose.dev.yml`, not in the host shell. The `postgres` service is `wondertales-postgres-dev`; the `api` service receives `DATABASE_URL=postgresql://kazka:devpass@postgres:5432/kazka_dev` by default and also loads `.env.local`.

For DB-backed scripts, backfills, and migrations, use `wondertales-verification-scripts` and prefer the API container entrypoint. Do not treat a missing host-shell `DATABASE_URL` as proof that a live local DB action cannot run.

## Core Tables

- `users`, `sessions`, `oauth_identities`, password reset and consent/privacy tables: auth, sessions, account state, compliance.
- `plans`, `features`, `plan_features`, `user_subscriptions`, bundle tables: billing and entitlements.
- `child_profiles`: child profile, Child Mode settings, avatar/profile data.
- `characters`: reusable child/person/animal/imaginary characters, reference photos, turnaround sheet metadata, hidden LLM characters.
- `story_requests`: async generation request, `uiLocale`, `storyLanguage`, selected characters/children, status/progress, `intermediateData`.
- `stories`: persisted story record, denormalized `scenes` JSON, full text, metadata, publish/share fields, series, cover asset, artifacts.
- `scenes`: normalized scene rows with text, visual prompt, characters present, displayed `imageUrl`, generation params.
- `assets`: storage metadata for images/audio/video and thumbnails.
- `ai_usage_events` and `story_generation_stage_events`: cost/timing observability.
- `image_validation_results`: persisted validation rows, score/status/model/request manifest/result.
- `audio_assets` and `alignments`: generated narration and forced alignment.

## Story Content Tables

- `story_goals`: goal slug, name, prompt guidance, min age.
- `scenario_cards`: scenario card id, display keys, prompt guidance, suggested goals, age groups.
- `scenario_plot_examples`: per-scenario setting examples selected during spec building.
- `scenario_world_rules`: per-scenario world rule selected during spec building.
- `story_artifacts`: keepsake catalog used by writer prompts and user collections.
- `translations`: localized DB content by `entityType`, `entityId`, `locale`, `fieldName`.
- `age_engine_rules`, `content_policy_rules`: policy/age generation support.

Common content lookup code:

- `services/api/src/repositories/DictionaryRepository.ts`: goals, scenario cards, plot examples, world rules, translations.
- `services/api/src/routes/dictionaries.ts`: public dictionaries for traits and story themes.
- `services/api/src/services/storyArtifactService.ts`: artifact selection and localized artifact titles.
- `services/api/src/services/translationService.ts`: DB translation helpers.

## Graphic Novel Tables

- `graphic_novel_projects`: one project per comic-style story; stores script JSON and layout manifest.
- `graphic_novel_pages`: per-page layout, bubble layout, image asset, image URL, status, generation params.
- `graphic_novel_panels`: per-panel script lines, visual action, art prompt, characters, bubble geometry.

These tables serve both `graphic_novel` and `mixed_story`; check `stories.metadata.storyFormat`.

## Reference and Cache Tables

- `generated_references`: AI-generated character/reference asset metadata.
- `environment_image_cache` and `story_environment_cache`: reusable environment plates and story-to-cache mapping.
- `outfit_plate_cache` and `story_outfit_plate_cache`: reusable outfit plates and story/environment/character mapping.
- `llm_turnaround_cache`: reusable model sheets for LLM-generated characters.
- `collected_story_artifacts`, `collected_map_tiles`: child/user collections.

## Localization Sources

- Supported locales are in `packages/shared/src/config/languages.ts`: `uk`, `ru`, `en`, `es`, `de`, `fr`, `pl`; default locale is `uk`.
- UI copy lives in `packages/shared/src/i18n/*.json` and is loaded by `packages/shared/src/i18n/config.ts`.
- App interface locale and story language are separate: `uiLocale` affects UI, `storyLanguage` affects generated story prompts and DB translation lookup.
- DB-backed scenario/goal/artifact translations live in `translations`, not in UI JSON.
- Email translations import the shared i18n JSON directly in `services/api/src/services/emailService.ts`.

## Content Seeds and Backfills

Use `wondertales-verification-scripts` before running scripts. Common content-related scripts include:

- `services/api/src/scripts/seedWorldRules.ts`
- `services/api/src/scripts/verifyWorldRules.ts`
- `services/api/src/scripts/seedStoryArtifactEmbeddings.ts`
- `services/api/src/scripts/backfillStoryArtifactTitleTranslations.ts`
- `services/api/src/scripts/backfillMapTileMetadata.ts`
- `services/api/src/scripts/generateStoryArtifactThumbnails.ts`
- `services/api/src/scripts/generateMapTileMasks.ts`
