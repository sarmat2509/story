# Frontend and API Surfaces

## Shared Payloads

- `packages/shared/src/schemas/index.ts` defines shared Zod schemas and inferred request/response types.
- `CreateStoryRequestSchema` contains `childProfileId`, `uiLocale`, `storyLanguage`, `goal`, `scenarioCardId`, `imageStyle`, `userNotes`, `selectedCharacters`, `selectedChildren`.
- `GenerateFromPhotosSchema` is route-local in `services/api/src/routes/stories.ts` for instant mode.

When changing a payload consumed by both app and API, update shared schema/types first, then route and hooks.

## API Routes

- `routes/stories.ts`: regular story, child-mode story, instant photo story, story status, continuation, schedule continuation, map tile, scene regeneration, audio, publish/share.
- `routes/graphicNovels.ts`: create/read/status for graphic novels.
- `routes/mixedStories.ts`: create mixed stories.
- `routes/dictionaries.ts`: public story themes and character trait dictionaries.
- `routes/children.ts`: child profiles and Child Mode controls/sessions.
- `routes/characters.ts`: reusable character CRUD and uploads.
- `routes/meMapTiles.ts` and `routes/meArtifacts.ts`: collected reward surfaces.
- `routes/imageValidations.ts`: admin image validation listing.
- `routes/admin.ts`: admin dashboard, config tables, scene/page regeneration, map tile masks.
- `routes/voices.ts`: voice catalog and samples.
- `routes/billing*.ts`, `routes/entitlements.ts`, `routes/plans.ts`: Stripe/RevenueCat/bundle/usage surfaces.
- `routes/ssr*.ts`, `routes/public*.ts`, `routes/shareCard.ts`, `routes/sitemap.ts`: public and SEO surfaces.

## Frontend Hooks

- `apps/universal-app/src/api/stories.ts`: story list/detail/status, create story, create graphic novel, create mixed story, create instant story, retry images, map tile, continuation, graphic novel status.
- `apps/universal-app/src/api/children.ts`: child profiles, Child Mode controls/sessions.
- `apps/universal-app/src/api/characters.ts`: characters and uploads.
- `apps/universal-app/src/api/mapTiles.ts`: collected map tile inventory/layout.
- `apps/universal-app/src/admin/api/admin.ts`: admin-only operations, including scene and comic page regeneration.

Screens should prefer these hooks rather than direct `apiClient` calls.

## Main Frontend Screens

- `screens/wizard/WizardScreen.tsx`: artisan wizard. Local `storyFormat` is `story`, `comic`, or `mixed`; it calls `useCreateStory`, `useCreateGraphicNovel`, or `useCreateMixedStory`.
- `screens/wizard/InstantWizardScreen.tsx`: instant photo-story wizard; calls `useCreateStoryFromPhotos`.
- `screens/story/StoryViewerScreen.tsx`: detects `story.metadata.storyFormat`; uses normal generation status for stories and graphic novel hooks for `graphic_novel` or `mixed_story`.
- `screens/children/ChildDetailScreen.tsx`: Child Mode settings and child story mode.
- `screens/onboarding/ModeSelectionScreen.tsx`: account/child story creation mode selection (`instant` vs `artisan`).
- `screens/map/MapTilesScreen.tsx` and `screens/artifacts/ArtifactsScreen.tsx`: reward inventory surfaces.

## Child Mode

- Settings type and defaults: `services/api/src/services/childModeControlsService.ts`.
- Policy checks: `services/api/src/services/childModePolicyService.ts`.
- Child sessions are scoped by child profile and settings. Enhanced story formats are blocked in the wizard for child sessions.
- Settings include generation/audio/quiz toggles, daily/monthly limits, allowed languages/themes/characters, free-text prompt toggle, parent review, sibling/shared family controls.

## Public/SSR

- SSR renderers and content live under `services/api/src/ssr`.
- Shared SSR helpers are in `packages/shared/src/ssr`.
- Public story rendering uses published/unlisted routes plus `publicRenderVersion` on stories.
- Blog authoring has a separate skill: `wondertales-blog-article`.
