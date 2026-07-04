# Entrypoints and Queues

## User and Admin Entrypoints

- `POST /api/v1/stories` in `services/api/src/routes/stories.ts`: parent artisan story. Validates `CreateStoryRequestSchema`, prompt safety, quota, concurrent job limit, then calls `createStoryRequest(... quotaSource: "wizard")`.
- `POST /api/v1/stories/child-mode`: child-session story. Enforces Child Mode policy via `assertChildStoryRequestAllowed`, then calls `createStoryRequest` with `createdByMode: "child"`.
- `POST /api/v1/stories/instant`: photo-based instant story. Uses route-local `GenerateFromPhotosSchema`, photo safety/access checks, then stores `intermediateData.instantMode = true` plus photos and age group.
- `POST /api/v1/stories/:id/continue`: continuation. Builds/gets series context, preserves original request settings, resolves generation kind, then calls `createContinuationRequest`.
- `POST /api/v1/graphic-novels`: calls `createGraphicNovelRequest`.
- `POST /api/v1/mixed-stories`: calls `createMixedStoryRequest`.
- `POST /api/v1/stories/:id/scenes/:sceneId/regenerate`: user scene image regeneration.
- `POST /api/v1/admin/stories/:storyId/scenes/:sceneId/regenerate-image`: admin scene image regeneration.
- `POST /api/v1/admin/stories/:storyId/graphic-novel-pages/:pageNumber/regenerate-image`: admin comic/mixed page regeneration.
- `POST /api/v1/stories/:id/map-tile`: reward map tile generation from persisted Director `metadata.mapTile` or request override.

## Request Shape

Shared story creation payload: `packages/shared/src/schemas/index.ts`, `CreateStoryRequestSchema`.

Fields: `childProfileId`, `uiLocale`, `storyLanguage`, `goal`, `scenarioCardId`, `imageStyle`, `userNotes`, `selectedCharacters`, `selectedChildren`.

Persisted request: `story_requests` table. Important fields:

- `status`, `progress`, `progressData`: async state.
- `intermediateData`: checkpoints, instant mode data, continuation data, generation kind.
- `storyId`: story stub/final story.
- `createdByMode`, `createdByChildProfileId`, `parentReviewRequired`: Child Mode attribution/review.

## Generation Kind Routing

Source: `services/api/src/services/generationKindRouting.ts`.

- `generationKind` absent or `story`: normal story path.
- `generationKind = "graphic_novel"`: comic path.
- `generationKind = "mixed_story"`: mixed prose/comic path.
- `imageJobTypeForGenerationKind` maps normal story to `image_batch` and comic-style kinds to `graphic_novel_pages`.

`createGraphicNovelRequest` and `createMixedStoryRequest` update `story_requests.intermediateData.generationKind`; regular `createStoryRequest` does not.

## Queue Routing

Source: `services/api/src/jobs/storyJobProcessor.ts`.

- `storyJobQueue.addJob(requestId)` is a facade. It reads `story_requests.intermediateData`.
- If `instantMode === true`, it queues `instantQueue` with `instant_character_setup`.
- Otherwise it queues `textQueue` with `text_generation`.
- `processTextGeneration` runs regular or comic-style text/script work, then queues `imageQueue`.
- `imageQueue` handles `image_batch` and `graphic_novel_pages`.
- Manual regeneration jobs go through durable `legacy-regeneration` queue with max concurrency 1.
- Audio generation goes through `audioQueue`.

## Queue Processor Outcomes

Regular story:

1. `textQueue` runs `processStoryRequest`.
2. If scheduled continuation, it inserts `batch_image_pending` and skips `imageQueue`.
3. Otherwise it queues `image_batch`.
4. `imageQueue` runs `processStoryImages`.

Graphic novel or mixed story:

1. `textQueue` detects generation kind.
2. Runs `processGraphicNovelRequest` or `processMixedStoryRequest`.
3. Queues `graphic_novel_pages`.
4. `imageQueue` runs `processGraphicNovelPages`.

Instant:

1. `instantQueue` runs `processInstantCharacterSetup`.
2. Creates/analyzes hidden characters and turnarounds.
3. Updates selected characters.
4. Queues normal `text_generation`.

Regeneration:

- Scene image: legacy queue calls `regenerateSceneImage`.
- Comic/mixed page: legacy queue calls `regenerateGraphicNovelPageImage`.
