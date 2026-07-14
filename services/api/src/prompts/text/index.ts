/**
 * Text Prompt Builders
 * Provider-agnostic prompt construction for text generation
 */

export {
  buildDirectTextPromptPlain,
  buildDirectTextPromptPlainCachedPrefix,
  WRITER_PLAIN_CACHE_KEY,
} from './DirectTextPrompt';
export {
  buildDirectorPrompt,
  buildDirectorPromptCachedPrefix,
  buildDirectorSelectedCharacterCoverageRetryPrompt,
  buildMapTileBriefPrompt,
  buildMapTileBriefPromptCachedPrefix,
  DIRECTOR_DYNAMIC_FORESHORTENING_PERCENT,
  DIRECTOR_CACHE_KEY,
  MAP_TILE_BRIEF_CACHE_KEY,
  shouldEnableDirectorDynamicForeshortening,
} from './DirectorPrompt';
export {
  buildValidationPrompt,
  buildBatchValidationCachedPrefix,
  buildBatchValidationRuntimePrompt,
  TEXT_VALIDATION_CACHE_KEY,
} from './ValidationPrompt';
export {
  buildBatchRegenerationCachedPrefix,
  buildBatchRegenerationRuntimePrompt,
  TEXT_REGENERATION_CACHE_KEY,
} from './RegenerationPrompt';
export {
  buildGraphicNovelPrompt,
  buildGraphicNovelPageRepairPrompt,
  buildGraphicNovelSafetyFallbackPrompt,
  graphicNovelPanelCountRange,
  graphicNovelPanelDensityRequirement,
  GRAPHIC_NOVEL_CAPTION_MAX_CHARS,
  GRAPHIC_NOVEL_LINE_MAX_CHARS,
  GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS,
  GRAPHIC_NOVEL_PAGE_REPAIR_SCHEMA,
  GRAPHIC_NOVEL_SCRIPT_SCHEMA,
  GRAPHIC_NOVEL_SPEAKER_MAX_CHARS,
} from './GraphicNovelPrompt';
export {
  buildMixedStoryPrompt,
  buildMixedStoryScriptSchema,
  MIXED_STORY_SCRIPT_SCHEMA,
} from './MixedStoryPrompt';

export type { DirectTextPromptParams } from './DirectTextPrompt';
export type { ValidationPromptParams, BatchValidationPromptParams } from './ValidationPrompt';
export type { BatchRegenerationPromptParams } from './RegenerationPrompt';
export type { VisualCharacterReferenceLabel } from '../visualReferenceLabels';
