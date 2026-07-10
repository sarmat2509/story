---
name: wondertales-generation-flow
description: Trace WonderTales story generation, instant photo stories, Child Mode story creation, continuations, scheduled continuations, graphic novels, mixed stories, Director planning, image generation, segmented image validation, comic panel validation, map tiles, retries, and regeneration flows. Use when debugging or changing generation behavior, validators, image reference flow, comic rendering, story request queues, or generation status.
---

# WonderTales Generation Flow

## Overview

Use this skill when behavior depends on how a story request moves through routes, queues, text planning, image rendering, validation, and persisted assets. For general repo/table/provider orientation, use `wondertales-project-map`; for commands and recheck scripts, use `wondertales-verification-scripts`.

## Load Only What You Need

- Entry routes, generation kinds, queues, and request status: read `references/entrypoints-queues.md`.
- Regular story, instant mode, child mode, continuations, text validation, Director: read `references/story-flow.md`.
- Graphic novel and mixed story script/layout/page rendering: read `references/comic-mixed-flow.md`.
- Scene image generation, references, validation, edit-repair, regeneration, map tiles: read `references/image-validation-regeneration.md`.
- Diagnostics and known script traps: read `references/diagnostics.md`, then use `wondertales-verification-scripts` for exact commands.

## Fast Mental Model

Generation kind is stored in `story_requests.intermediate_data.generationKind`:

- No generation kind or `story`: regular prose story plus scene images.
- `graphic_novel`: full comic script, page layouts, full-page images, HTML text overlay.
- `mixed_story`: prose reading blocks plus comic pages, using the graphic-novel page renderer.

`imageJobTypeForGenerationKind` in `services/api/src/services/generationKindRouting.ts` is the switch: story-like requests enqueue `image_batch`; graphic-novel-style requests enqueue `graphic_novel_pages`.

## Do Not Confuse These Paths

- Text validation checks generated prose scenes through `StoryDomainService.validateScene` and `validateStoryTextScenes`.
- Scene image validation checks rendered illustrations through `ImageDomainService.validateGeneratedImageSegmented`.
- Comic page validation checks panel arrays through `ImageDomainService.validateGraphicNovelPagePanels`.
- Scene validation calls `ImageDomainService.validateGeneratedImageSegmented` directly.
- `recheckProblemImageValidation.ts` is the older compact/debug-repair path. For current segmented graphic novel/comic validation, prefer `recheckGraphicNovelValidationVariance.ts` modes from `wondertales-verification-scripts`.

## Main Code Pivots

- `services/api/src/routes/stories.ts`: regular, child-mode, instant, continuation, map tile, scene regeneration.
- `services/api/src/routes/graphicNovels.ts` and `services/api/src/routes/mixedStories.ts`: comic entrypoints.
- `services/api/src/jobs/storyJobProcessor.ts`: queue routing and durable regeneration jobs.
- `services/api/src/services/storyOrchestrationService.ts`: regular story text, Director, image batch, scene regeneration.
- `services/api/src/services/graphicNovelOrchestrationService.ts`: graphic novel and mixed story script/layout/page rendering/regeneration.
- `services/api/src/domain/image/imageValidationRun.ts`: production image validation prompt/schema runner.
