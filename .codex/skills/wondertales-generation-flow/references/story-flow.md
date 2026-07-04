# Regular Story Flow

## Contents

- Creation
- Spec Building
- Text and Director
- Text Validation
- Persistence and Checkpoints
- Instant Mode
- Child Mode
- Continuations

## Creation

Route: `services/api/src/routes/stories.ts`.

Service entry:

- `createStoryRequest` in `services/api/src/services/storyOrchestrationService.ts` creates `story_requests` with quota reservation.
- `processStoryRequest` runs in `textQueue`.
- `processStoryImages` runs later in `imageQueue`.

## Spec Building

`buildStorySpec` in `storyOrchestrationService.ts` resolves:

- Child profile and age group.
- Selected user characters and selected child profiles mirrored as characters.
- Continuation required/optional characters when in continuation mode.
- Character name translations for story language.
- Scenario card from `DictionaryRepository.findScenarioCardById`.
- Scenario card name/description translations from `translations`.
- Random or pinned `scenario_plot_examples`, with series dedup.
- Random or pinned `scenario_world_rules`, with series dedup.
- Goal prompt guidance and localized goal name.
- Policy profile from `buildPolicyProfile(ageGroup, storyLanguage)`.
- Closing artifact from `selectStoryArtifactForPrompt`.

The story language is normalized by `normalizeStoryLocale`; UI locale is separate.

## Text and Director

Domain: `services/api/src/domain/story/StoryDomainService.ts`.

`processStoryRequest` calls:

1. `storyDomain.generateTextPlain(spec)`: writer prompt returns title, description, full text, plain scenes.
2. If `userPlan.imagesPerStory > 0`, `composeScenesIntoBlocks` groups scenes and `storyDomain.callDirector` creates visual metadata.
3. `mergeDirectorIntoText` merges Director `environments`, `outfits`, `mapTile`, and per-block `sceneVisual`.
4. If no images are included in the plan, Director is skipped.

Prompts:

- `services/api/src/prompts/text/DirectTextPrompt.ts`
- `services/api/src/prompts/text/DirectorPrompt.ts`
- `services/api/src/prompts/text/ValidationPrompt.ts`
- `services/api/src/domain/story/directorSchema.ts`

## Text Validation

Validation code: `services/api/src/services/storyOrchestration/validation.ts`.

- `validateStoryScenes` runs parallel per-scene validation via `StoryDomainService.validateScene`.
- It can apply `correctedCameraComposition` directly to `sceneVisual`.
- Failed scenes are regenerated selectively through `StoryDomainService.regenerateScenesBatch`.
- Revalidation repeats until `maxRetries`; final failures throw and record moderation decisions.

Do not confuse this prose validation with image validation.

## Persistence and Checkpoints

`processStoryRequest` uses `story_requests.intermediateData` as checkpoint storage:

- `storyId`: created stub.
- `text`, `mergedCharacters`, `spec`, `selectedCharacters`.
- `validationComplete`, `validatedText`.
- continuation/schedule flags and context.

It persists:

- story stub and final/enriched story through `storyOrchestration/storyRecords.ts`.
- scene rows and story metadata.
- LLM-generated characters through `storyOrchestration/llmCharacterPersistence.ts`.
- Director scene snapshots through `storyDirectorScenePersistenceService.ts`.

Important story metadata keys:

- `imageStyle`
- `plotExampleId`
- `worldRuleId`
- `storyArtifactId`, `storyArtifactCode`, `storyArtifactTitle`, `storyArtifactImagePath`
- `llmGeneratedCharacters`
- `mapTile`
- `seoDescription`

## Instant Mode

Route: `POST /api/v1/stories/instant`.

Key differences:

- Uses photos, `ageGroup`, `language`, `scenario`, optional child profile.
- Stores `intermediateData.instantMode = true`, `photos`, `ageGroup`, `characterSetupComplete = false`.
- `storyJobQueue.addJob` routes it to `instantQueue`.
- `processInstantCharacterSetup` validates photo input, deduplicates/analyzes faces, creates hidden characters, creates turnarounds, updates selected characters, then queues normal text generation.

After setup, it follows the regular story path.

## Child Mode

Route: `POST /api/v1/stories/child-mode`.

Policy code:

- `services/api/src/services/childModeControlsService.ts`
- `services/api/src/services/childModePolicyService.ts`

Checks include generation toggle, language/theme/character allowlists, free-text prompt toggle, sibling/shared controls, daily/monthly limits, parent review flag.

Child-mode requests still use regular story generation after policy passes. Enhanced comic formats are blocked in the app wizard for child sessions.

## Continuations

Route: `POST /api/v1/stories/:id/continue`.

Flow:

- `seriesService.getOrCreateSeries` returns series id, next part, continuation context.
- Original request settings are preserved when possible.
- `resolveContinuationGenerationKind` keeps comic-style continuation as graphic novel/mixed when relevant.
- `createContinuationRequest` stores continuation context in `intermediateData`.
- Queue routing follows `generationKind`.

Scheduled continuations skip immediate image queue after text and insert `batch_image_pending`.
