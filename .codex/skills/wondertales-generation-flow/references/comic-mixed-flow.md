# Graphic Novel and Mixed Story Flow

## Contents

- Shared Concepts
- Graphic Novel Request
- Mixed Story Request
- Page Rendering
- Page Regeneration

## Shared Concepts

Both `graphic_novel` and `mixed_story` use:

- `services/api/src/services/graphicNovelOrchestrationService.ts`
- `graphic_novel_projects`, `graphic_novel_pages`, `graphic_novel_panels`
- complex image route from `getComplexImageDomainService()`
- full-page art generation
- `html_overlay` text rendering in app
- `StoryViewerScreen.tsx` graphic novel hooks when `story.metadata.storyFormat` is `graphic_novel` or `mixed_story`

## Graphic Novel Request

Creation:

- `routes/graphicNovels.ts` parses `CreateStoryRequestSchema`.
- `createGraphicNovelRequest` reserves story and graphic-novel quota.
- It updates `story_requests.intermediateData.generationKind = "graphic_novel"`.

Text/layout phase:

- `processGraphicNovelRequest` builds story spec.
- Creates a story stub.
- Calls `GraphicNovelDomainService.generateScript` with default page count 8.
- Ensures environment reference images.
- Resolves reading text settings.
- Builds character manifest.
- Calls `GraphicNovelDomainService.planLayouts`.
- Builds `textManifest` with `html_overlay`.
- Updates `stories.metadata.storyFormat = "graphic_novel"`, `graphicNovelTextMode = "html_overlay"`, `firstPageReady = false`, `graphicNovelGenerationComplete = false`.
- Creates project, page, and panel rows.

Domain:

- `services/api/src/domain/graphicNovel/GraphicNovelDomainService.ts`
- Script prompt: `services/api/src/prompts/text/GraphicNovelPrompt.ts`
- Layout: `services/api/src/domain/graphicNovel/layoutPlanner.ts`
- Text overlay: `services/api/src/domain/graphicNovel/textOverlay.ts`

`GraphicNovelDomainService.generateScript` has a primary attempt and a safety fallback attempt for provider blocks or retryable script validation errors.

## Mixed Story Request

Creation:

- `routes/mixedStories.ts` parses `CreateStoryRequestSchema`.
- `createMixedStoryRequest` checks mixed-story access.
- It updates `story_requests.intermediateData.generationKind = "mixed_story"`.

Text/layout phase:

- `processMixedStoryRequest` builds story spec.
- Uses `userPlan.imagesPerStory` as `comicBlockCount`; if it is 0, mixed story is unavailable.
- Estimates prose scene count by age group.
- Chooses comic anchor scene ids via `getIllustrationBlockStartSceneIds`.
- Calls `MixedStoryDomainService.generateScript`.
- Plans comic pages from `mixedStoryComicPages(script)` using graphic novel layout planner.
- Builds mixed text manifest and reading order.
- Updates `stories.metadata.storyFormat = "mixed_story"`, `mixedStoryVersion = 1`, `mixedStoryReadingOrder`, `graphicNovelTextMode = "html_overlay"`.
- Creates regular `scenes` rows with `generationParams.source = "mixed_story"` and graphic novel project/pages/panels.

Domain:

- `services/api/src/domain/mixedStory/MixedStoryDomainService.ts`
- Prompt: `services/api/src/prompts/text/MixedStoryPrompt.ts`
- Schema is built with age-dependent comic panel range.
- Script generation retries with validation feedback when normalized script fails.

## Page Rendering

`processGraphicNovelPages(requestId)`:

- Loads project, pages, script, story metadata.
- Sets progress stage `generating_first_page` before the first page is ready.
- Renders each incomplete page with `renderAndStorePage`.
- Completes request after page 1 when the first page is ready.
- Later pages can continue after the request is already viewable.
- Tracks failed pages in status.

`renderAndStorePage`:

1. Builds environment reference images.
2. Builds character reference images.
3. Builds outfit plate references.
4. Calls `generateGraphicNovelPageFreeLayout`.
5. Saves art-only debug image.
6. Validates page art with `validateGraphicNovelRenderedPage`.
7. Optionally repairs art using edit-repair if below threshold.
8. Applies vision bubble placement and stores final image/bubble overlay.
9. Persists validation results.
10. Updates `graphic_novel_pages` and optionally creates cover candidate.

Page rendering uses complex provider config:

- `COMPLEX_IMAGE_PROVIDER` or `GRAPHIC_NOVEL_IMAGE_PROVIDER`
- `COMPLEX_IMAGE_MODEL`

## Page Regeneration

Admin route:

- `POST /api/v1/admin/stories/:storyId/graphic-novel-pages/:pageNumber/regenerate-image`

Processor:

- durable legacy queue calls `regenerateGraphicNovelPageImage`.
- It verifies `story.metadata.storyFormat` is `graphic_novel` or `mixed_story`.
- Loads saved page script/layout.
- Replans from saved script using current reading text settings.
- Calls `renderAndStorePage`.
- Updates page/project/story metadata and cover info.

Do not use regular scene regeneration for comic pages; use page regeneration.
