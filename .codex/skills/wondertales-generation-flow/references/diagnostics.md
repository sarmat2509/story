# Diagnostics and Known Script Traps

Use `wondertales-verification-scripts` for exact commands. This file only explains which production path a diagnostic should match.

## Do Not Default to Old Compact Validation

`services/api/src/scripts/recheckProblemImageValidation.ts` is an older compact/debug-repair path. Do not use it as the default when investigating current graphic novel or comic validation.

For current graphic-novel validation, start with:

- `recheckGraphicNovelValidationVariance.ts --mode segmented`
- `recheckGraphicNovelValidationVariance.ts --mode comic-panels`
- `recheckGraphicNovelValidationVariance.ts --mode presence-first`

If a stored validation row lacks reference data needed for a production-equivalent recheck, extend `recheckGraphicNovelValidationVariance.ts`; do not switch to ad hoc inline SQL or the old compact script.

## Scene Image Debugging

Use production-equivalent scene prompt/reference inspection:

- `compareSceneImageGeneration.ts --story-id <id> --scene-id <n> --prompt-only`
- `compareSceneImageGeneration.ts --story-id <id> --scene-id <n> --runs 1`
- `showSceneImagePrompt.ts <storyId> <sceneId>`

When debugging validation, inspect:

- `image_validation_results.request_manifest`
- `image_validation_results.result`
- `assets.generation_params`
- `scenes.generation_params`
- story metadata environments/outfits/llm characters

## Graphic Novel Debugging

Use:

- `runGraphicNovelDiagnosticForStory.ts --story-id=<id> --text-only`
- `runGraphicNovelDiagnosticForStory.ts --story-id=<id> --stop-after-first-page`

Check DB:

- `graphic_novel_projects.script_json`
- `graphic_novel_projects.layout_manifest`
- `graphic_novel_pages.layout_json`
- `graphic_novel_pages.bubble_layout_json`
- `graphic_novel_pages.generation_params`
- `graphic_novel_panels`

## Story Text and Director Debugging

Use:

- `dumpSceneVisuals.ts <storyId> --json`
- `dumpDirectorVsText.ts <storyId>`
- `dumpStoryDirectorJson.ts`
- `compareDirectorTextProviders.ts --story <storyId> --prompt-only`
- `printWriterPromptSample.ts`

Check:

- `story_requests.intermediate_data`
- `stories.scenes` JSON and normalized `scenes`
- `story_director_scenes`
- story metadata `plotExampleId`, `worldRuleId`, `mapTile`, `environments`, `outfits`

## Queue and Status Debugging

Use:

- `checkStoryStatus.ts <storyId>`
- `checkStoryAssets.ts <storyId>`
- `waitForGenerationDrain.ts`
- `setOpsMode.ts`

Remember:

- request status can be completed after first comic page is ready while later pages continue.
- scheduled continuations can insert `batch_image_pending` rather than queueing `image_batch`.
- manual scene/page regeneration uses durable legacy regeneration queue, not the main text/image path.
