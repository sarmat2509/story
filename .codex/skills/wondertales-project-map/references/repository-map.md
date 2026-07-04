# Repository Map

## Top Level

- `services/api`: Express API, workers, Drizzle schema/migrations, repositories, domain services, providers, prompt builders, SSR renderers, operational scripts.
- `apps/universal-app`: Expo React Native and web app. Screens, navigation, React Query API hooks, admin UI, stores, theme, utilities.
- `packages/shared`: shared schemas, types, language config, constants, i18n JSON, SSR utilities consumed by API and app.
- `docs`: architecture and feature notes. Useful for background, but source files are authoritative.
- `.codex/skills`: repo-local Codex skills.

## API Layout

- `services/api/src/routes`: HTTP endpoints. Routes parse input, enforce auth/session/limits/safety, then call services.
- `services/api/src/services`: application orchestration, quotas, billing, safety, provider factories, storage, generation, admin, operations.
- `services/api/src/domain`: provider-agnostic domain logic. Story, image, audio, quiz, graphic novel, and mixed story live here.
- `services/api/src/prompts`: prompt builders and prompt schemas. Prefer editing these instead of inline prompt strings.
- `services/api/src/providers`: vendor adapters behind `providers/base` interfaces.
- `services/api/src/repositories`: DB access wrappers. Use these before adding inline SQL in services.
- `services/api/src/db/schema.ts`: current Drizzle schema and table typing.
- `services/api/drizzle`: SQL migration history.
- `services/api/src/jobs`: durable queues and processors.
- `services/api/src/ssr`: public/SEO server-rendered pages.
- `services/api/src/scripts`: diagnostics, migration helpers, seeds, prompt dumps, rechecks. Use `wondertales-verification-scripts` before choosing one.

## Frontend Layout

- `apps/universal-app/src/api`: API client and React Query hooks.
- `apps/universal-app/src/screens/wizard`: artisan wizard, instant wizard, scenario/language/character controls.
- `apps/universal-app/src/screens/story/StoryViewerScreen.tsx`: story, graphic novel, mixed story, audio, map tile, and generation status rendering.
- `apps/universal-app/src/screens/children` and `screens/childMode`: child profile and Child Mode controls.
- `apps/universal-app/src/admin`: admin API hooks and screens.
- `apps/universal-app/src/store`: Zustand auth/ui/wizard/audio state.
- `apps/universal-app/src/navigation`: route ownership and mode-dependent navigation.

## Shared Package

- `packages/shared/src/schemas/index.ts`: shared Zod schemas and API payload types.
- `packages/shared/src/config/languages.ts`: supported locales and app UI locale helpers.
- `packages/shared/src/i18n/*.json`: UI copy dictionaries.
- `packages/shared/src/constants`: trait, image style, feedback, photo type constants.
- `packages/shared/src/ssr`: SSR shared rendering utilities.
- `packages/shared/src/types`: API/story/common type exports.

## Ownership Heuristics

- Route changes belong in `routes`, but business behavior normally belongs in `services` or `domain`.
- Provider-specific SDK code belongs in `providers`; orchestration should call domain services from `aiService.ts`.
- DB changes need both `services/api/src/db/schema.ts` and a SQL migration in `services/api/drizzle`.
- App screens should usually use hooks from `apps/universal-app/src/api`, not raw `apiClient`.
- Shared request/response shape changes usually start in `packages/shared/src/schemas/index.ts`.
