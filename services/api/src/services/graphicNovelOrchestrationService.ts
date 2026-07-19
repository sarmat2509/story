import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import {
  getBaseStoryTextSizePxForAgeGroup,
  getBaseStoryTextSizePxForAgeYears,
  getStoryTextSizePx,
  normalizeStoryTextSizeMultiplier,
  stripCharacterIdFromName,
} from '@wondertales/shared';
import type { CreateStoryRequestInput } from '@wondertales/shared';
import { config } from '../config';
import {
  getAssetRepository,
  getCharacterRepository,
  getChildProfileRepository,
  getDictionaryRepository,
  getGraphicNovelRepository,
  getSceneRepository,
  getStoryRepository,
} from '../repositories';
import { getAssetStorageService } from './assetStorageService';
import {
  getComplexImageDomainService,
  getImageDomainService,
  getGraphicNovelDomainService,
  getMixedStoryDomainService,
  getValidationTextProvider,
} from './aiService';
import type { StoryEnvironment, StoryOutfitRow, StorySpec } from '../ai/types';
import { recordUsage } from './aiUsageService';
import {
  STORY_TASKS,
  completeTask,
  setPlannedTasks,
  startTask,
  transitionTask,
  updateTaskProgress,
} from './storyProgress';
import {
  buildTargetedEditRepairPlan,
  buildStorySpec,
  computeValidationScore,
  createStoryRequest,
  type ContinuationContext,
} from './storyOrchestrationService';
import {
  applySceneDressedTurnaroundOverrides,
  prepareSceneDressedTurnaroundReferences,
  type SceneCharacterReferenceData,
} from './imageReferencePreparationService';
import {
  createStoryStub,
  mergeCharacters,
  persistLlmCharacters,
} from './storyOrchestration/storyRecords';
import { getStoryCreationAttributionInputFromRequest } from './storyCreationAttributionService';
import {
  GRAPHIC_NOVEL_USAGE_EVENT,
  assertGraphicNovelQuotaAvailable,
} from './graphicNovelQuotaService';
import { assertMixedStoryAccessAvailable } from './mixedStoryAccessService';
import { recordUsageEvent } from './usageEventsService';
import { persistImageValidationResult } from './imageValidationPersistenceService';
import {
  annotateImageRequestManifest as annotateGraphicNovelRequestManifest,
  compactImageRequestManifests as compactGraphicNovelRequestManifests,
} from './imageRequestManifestService';
import {
  applyReferenceBucketLimits,
  assignSequentialImageIndices,
  logReferenceBucketDelivery,
  type ReferenceImageDataEntry,
} from './referenceImageBuckets';
import { referenceBindingIdFor } from './referenceBinding';
import {
  plannedCharacterReferenceIdForCharacter,
  visualCharacterReferenceLabelsFromCharacters,
} from '../prompts/visualReferenceLabels';
import {
  analyzeGraphicNovelBubbleVisionPanelImages,
  applyGraphicNovelBubbleVisionLayout,
  buildGraphicNovelImageRequestManifest,
  buildGraphicNovelPanelCropInstructions,
  buildGraphicNovelPanelCropSystemInstruction,
  buildGraphicNovelPageTextOverlay,
  composeGraphicNovelPanelArtPage,
  graphicNovelBubbleTextSizingFromStoryTextSize,
  GRAPHIC_NOVEL_PAGE_SIZE,
  normalizeGraphicNovelPanelArtForTemplate,
  overlayGraphicNovelPanelFrames,
  overlayGraphicNovelBubblesOnly,
  pageSizeForGraphicNovelPage,
  planGraphicNovelLayouts,
  type GraphicNovelPanelScript,
  type GraphicNovelScript,
  type GraphicNovelPageTextOverlay,
  type GraphicNovelBubbleTextSizing,
  type GraphicNovelBubbleVisionAnalysis,
  type GraphicNovelBubbleVisionPanelImage,
  type PlannedGraphicNovelPage,
} from '../domain/graphicNovel';
import { imageMimeTypeFromPath } from '../utils/imageMimeType';
import { GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS, graphicNovelPanelCountRange } from '../prompts/text';
import type { Rect } from '../domain/graphicNovel/types';
import { mixedStoryComicPages, type MixedStoryScript } from '../domain/mixedStory';
import type { ImageValidationResult } from '../ai/types';
import type { CameraCharacterComposition, CharacterData, SceneData, SceneVisual } from './types';
import type { GenerateImageRequest, ReferenceImage } from '../providers/base/IImageProvider';
import { getOrCreateEnvironmentImage } from './environmentReferenceImageService';
import {
  countNarrationWords,
  extractClosingKeepsakeFromEpisodeText,
  stripAllTags,
  stripCharacterIds,
  stripForAudio,
} from '../utils/audioTags';
import { getPlanFeatures } from './planService';
import {
  bindPersistedCharacterRefs,
  getIllustrationBlockStartSceneIds,
} from './storyOrchestration/utilities';
import {
  buildCharacterIdentityRegistry,
  characterRefForCharacter,
  isTemporaryCharacterRef,
  normalizeCharacterRef,
  reconcileGeneratedCharacterIdentity,
  relationshipBaseCharacterNameKey,
  resolveCharacterRefByName,
  resolveRelationshipCharacterRefByName,
} from '../utils/characterIdentity';
import { normalizeStoryArtifactImagePath } from './storyArtifactImageService';
import { recordStageTiming, withStageTiming } from './generationStageTimingService';
import { logger } from '../utils/logger';
import {
  buildImageEditSystemInstruction,
  type ImageEditRepairManifest,
  type ImageEditRepairIssueKind,
} from '../prompts/image';
import { crossScriptIdentityKey, toPhoneticKey } from '../utils/characterNormalization';
import { generateLlmCharacterTurnaround } from './turnaroundSheetService';
import type {
  GraphicNovelPanelRepairIssue,
  GraphicNovelPanelRepairRequest,
  GraphicNovelPanelRepairTarget,
} from './graphicNovelPanelRepairTypes';

export const GRAPHIC_NOVEL_KIND = 'graphic_novel';
export const MIXED_STORY_KIND = 'mixed_story';
export const GRAPHIC_NOVEL_DEFAULT_PAGE_COUNT = 8;
const GRAPHIC_NOVEL_PROGRESS_STAGES = [
  'generating_script',
  'planning_pages',
  'placing_bubbles',
  'generating_first_page',
] as const;
type GraphicNovelStoryArtifactReference = NonNullable<StorySpec['closingArtifact']> & {
  storagePath: string | null;
  referenceBindingId: string;
};

function graphicNovelArtifactReferenceBindingId(
  artifact: Pick<NonNullable<StorySpec['closingArtifact']>, 'title' | 'imagePath'>
): string {
  const storagePath = normalizeStoryArtifactImagePath(artifact.imagePath);
  return referenceBindingIdFor({
    referenceKind: 'object',
    source: 'story_artifact',
    type: 'story_artifact_reference',
    characterName: artifact.title,
    storagePath: storagePath ?? artifact.imagePath,
  });
}

function buildGraphicNovelStoryArtifactReference(
  artifact?: StorySpec['closingArtifact'] | null
): GraphicNovelStoryArtifactReference | null {
  if (!artifact) return null;
  return {
    ...artifact,
    storagePath: normalizeStoryArtifactImagePath(artifact.imagePath),
    referenceBindingId: graphicNovelArtifactReferenceBindingId(artifact),
  };
}

function storyArtifactReferenceFromManifest(
  layoutManifest: Record<string, any>,
  storyMetadata?: Record<string, unknown>
): GraphicNovelStoryArtifactReference | null {
  const fromLayout = layoutManifest.closingArtifactReference as
    | Partial<GraphicNovelStoryArtifactReference>
    | null
    | undefined;
  const id =
    typeof fromLayout?.id === 'string'
      ? fromLayout.id
      : typeof storyMetadata?.storyArtifactId === 'string'
        ? storyMetadata.storyArtifactId
        : null;
  const artifactCode =
    typeof fromLayout?.artifactCode === 'string'
      ? fromLayout.artifactCode
      : typeof storyMetadata?.storyArtifactCode === 'string'
        ? storyMetadata.storyArtifactCode
        : null;
  const title =
    typeof fromLayout?.title === 'string'
      ? fromLayout.title
      : typeof storyMetadata?.storyArtifactTitle === 'string'
        ? storyMetadata.storyArtifactTitle
        : null;
  const description =
    typeof fromLayout?.description === 'string'
      ? fromLayout.description
      : typeof storyMetadata?.storyArtifactDescription === 'string'
        ? storyMetadata.storyArtifactDescription
        : '';
  const imagePath =
    typeof fromLayout?.imagePath === 'string'
      ? fromLayout.imagePath
      : typeof storyMetadata?.storyArtifactImagePath === 'string'
        ? storyMetadata.storyArtifactImagePath
        : null;
  if (!id || !artifactCode || !title || !imagePath) return null;

  const referenceBindingId =
    typeof fromLayout?.referenceBindingId === 'string' && fromLayout.referenceBindingId.trim()
      ? fromLayout.referenceBindingId
      : graphicNovelArtifactReferenceBindingId({ title, imagePath });

  return {
    id,
    artifactCode,
    title,
    description,
    imagePath,
    storagePath:
      typeof fromLayout?.storagePath === 'string'
        ? fromLayout.storagePath
        : normalizeStoryArtifactImagePath(imagePath),
    referenceBindingId,
  };
}

function graphicNovelPanelTextForStoryArtifactDetection(
  panel: PlannedGraphicNovelPage['panels'][number]
): { visualText: string; bubbleText: string; allText: string } {
  const composition = panel.script.visual.sceneVisual.cameraComposition;
  const compositionText =
    typeof composition === 'string'
      ? composition
      : [
          composition.shot,
          ...composition.characters.flatMap((character) => [
            character.name,
            character.description,
            character.position,
          ]),
        ]
          .filter(Boolean)
          .join(' ');
  const bubbleText = [
    ...(panel.script.dialogue || []).map((line) => line.text),
    ...(panel.script.thoughts || []).map((line) => line.text),
    panel.script.caption,
  ]
    .filter(Boolean)
    .join(' ');
  const visualText = [
    panel.script.visual.primaryRead,
    panel.script.visual.sceneVisual.setting,
    panel.script.visual.sceneVisual.lighting,
    compositionText,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    visualText,
    bubbleText,
    allText: [visualText, bubbleText].filter(Boolean).join(' '),
  };
}

export function graphicNovelPanelNeedsStoryArtifactReference(
  panel: PlannedGraphicNovelPage['panels'][number],
  artifact?: GraphicNovelStoryArtifactReference | null
): boolean {
  if (!artifact?.referenceBindingId) return false;
  const { visualText, bubbleText, allText } = graphicNovelPanelTextForStoryArtifactDetection(panel);
  const normalizedAll = allText.toLocaleLowerCase();
  const normalizedVisual = visualText.toLocaleLowerCase();
  const normalizedTitle = artifact.title.trim().toLocaleLowerCase();
  const normalizedReferenceId = artifact.referenceBindingId.toLocaleLowerCase();

  if (normalizedAll.includes(normalizedReferenceId)) return true;
  if (normalizedTitle && normalizedAll.includes(normalizedTitle)) return true;
  if (/\{[^{}]{2,120}\}/u.test(bubbleText)) return true;

  return /(\b(artifact|instrument|keepsake|gift|tool|object|token|jewel|device|prop|sparkle)\b|об[’'`ʼ]?єкт|предмет|подарунок|скарб|іскр|блискуч)/iu.test(
    normalizedVisual
  );
}

function applyGraphicNovelPageCountLimit(requestedCount: number): number {
  const safeRequestedCount = Math.max(1, Math.floor(Number(requestedCount) || 1));
  const maxPageCount = config.image.graphicNovelMaxPageCount;
  if (!maxPageCount) return safeRequestedCount;
  return Math.min(safeRequestedCount, maxPageCount);
}

type ComicLlmCharacter = {
  characterRef?: string;
  name: string;
  type: string;
  description: string;
  role?: string;
  personality?: string;
  appearance?: string;
};

type ComicScriptWithCharacters = GraphicNovelScript | MixedStoryScript;

const GENERIC_COMIC_CHARACTER_NAMES = new Set([
  'hero',
  'character',
  'narrator',
  'child',
  'kid',
  'friend',
  'person',
  'someone',
  'voice',
  'everyone',
  'the group',
  'герой',
  'персонаж',
  'оповідач',
  'дитина',
  'друг',
  'хтось',
  'усі',
]);

function isIgnorableComicCharacterName(name: string): boolean {
  const normalized = normalizeCharacterName(name);
  return (
    !normalized ||
    normalized.startsWith('ref_ch_') ||
    normalized.startsWith('ref_') ||
    GENERIC_COMIC_CHARACTER_NAMES.has(normalized)
  );
}

function inferComicLlmCharacterType(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  if (
    /(robot|android|droid|automaton|clockwork|mechanical|робот|андроїд|дроїд|механіч)/i.test(text)
  ) {
    return 'object';
  }
  if (
    /(dog|cat|bird|fox|rabbit|bear|wolf|hamster|animal|пес|собак|кіт|кіш|птах|лис|крол|ведм|вовк|хом.?як|тварин)/i.test(
      text
    )
  ) {
    return 'animal';
  }
  if (/(girl|boy|child|kid|woman|man|human|person|дівчин|хлоп|дитин|жін|чолов|людин)/i.test(text)) {
    return 'human';
  }
  return 'creature';
}

function cleanComicLlmCharacterDescription(name: string, description: string): string {
  return description
    .replace(/\bREF_[A-Z0-9_]+\b/gi, name)
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function mergeComicLlmCharacterCandidate(
  candidates: Map<string, ComicLlmCharacter>,
  raw: {
    characterRef?: unknown;
    name?: unknown;
    type?: unknown;
    description?: unknown;
    role?: unknown;
    personality?: unknown;
  }
): void {
  const name = stripCharacterIdFromName(String(raw.name || '')).trim();
  if (isIgnorableComicCharacterName(name)) return;
  const characterRef = normalizeCharacterRef(raw.characterRef);
  const normalized = normalizeCharacterName(name);
  const candidateKey = characterRef ? `ref:${characterRef}` : `legacy-name:${normalized}`;
  const existing = candidates.get(candidateKey);
  const description = cleanComicLlmCharacterDescription(name, String(raw.description || ''));
  const type = String(raw.type || '').trim();
  const role = String(raw.role || '').trim();
  const personality = String(raw.personality || '').trim();
  const fallbackDescription = `${name} is a named child-friendly comic character.`;
  const next: ComicLlmCharacter = {
    ...(characterRef ? { characterRef } : {}),
    name: existing?.name || name,
    type: existing?.type || type || inferComicLlmCharacterType(name, description),
    description:
      [existing?.description, description].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() ||
      fallbackDescription,
    ...(existing?.role || role ? { role: existing?.role || role } : {}),
    ...(existing?.personality || personality
      ? { personality: existing?.personality || personality }
      : {}),
  };
  next.appearance = next.description;
  candidates.set(candidateKey, next);
}

function scriptComicPages(script: ComicScriptWithCharacters): GraphicNovelScript['pages'] {
  if (Array.isArray((script as GraphicNovelScript).pages)) {
    return (script as GraphicNovelScript).pages;
  }
  return mixedStoryComicPages(script as MixedStoryScript);
}

function initialCharacterFingerprints(characters: CharacterData[]): Set<string> {
  const fingerprints = new Set<string>();
  for (const character of characters || []) {
    if (!character?.name) continue;
    const names = [
      character.name,
      (character as any).canonicalName,
      ...((character as any).nameAliases || []),
    ];
    for (const name of names) {
      if (!name || typeof name !== 'string') continue;
      fingerprints.add(normalizeCharacterName(name));
      fingerprints.add(crossScriptIdentityKey(name));
    }
  }
  return fingerprints;
}

function isInitialCharacterName(name: string, fingerprints: Set<string>): boolean {
  return (
    fingerprints.has(normalizeCharacterName(name)) || fingerprints.has(crossScriptIdentityKey(name))
  );
}

export function extractLlmCharactersFromComicScript(params: {
  script: ComicScriptWithCharacters;
  initialCharacters: CharacterData[];
}): ComicLlmCharacter[] {
  const candidates = new Map<string, ComicLlmCharacter>();
  const declarations = Array.isArray(params.script.characters) ? params.script.characters : [];
  const declarationsWithRefs = declarations.filter((character) =>
    normalizeCharacterRef(character?.characterRef)
  );

  if (declarationsWithRefs.length > 0) {
    if (declarationsWithRefs.length !== declarations.length) {
      throw new Error(
        'Comic script mixes structural characterRef declarations with legacy name-only declarations'
      );
    }
    const initialRefs = new Set(params.initialCharacters.map(characterRefForCharacter).filter(Boolean));
    for (const character of declarations) {
      mergeComicLlmCharacterCandidate(candidates, character);
    }
    return [...candidates.values()].filter((character) => {
      const characterRef = normalizeCharacterRef(character.characterRef);
      if (initialRefs.has(characterRef)) return false;
      if (!isTemporaryCharacterRef(characterRef)) {
        throw new Error(
          `Comic script character "${character.name}" has unknown characterRef "${characterRef}"`
        );
      }
      return true;
    });
  }

  // Legacy saved scripts only: recover candidates by display name when no structural refs exist.
  for (const character of declarations) {
    mergeComicLlmCharacterCandidate(candidates, character);
  }

  for (const page of scriptComicPages(params.script)) {
    for (const panel of page.panels || []) {
      for (const line of [...(panel.dialogue || []), ...(panel.thoughts || [])]) {
        mergeComicLlmCharacterCandidate(candidates, {
          name: line.speaker,
          description: line.emotion,
        });
      }
      const composition = panel.visual?.sceneVisual?.cameraComposition;
      if (!composition || typeof composition === 'string') continue;
      for (const character of composition.characters || []) {
        mergeComicLlmCharacterCandidate(candidates, {
          name: character.name,
          description: [
            character.description,
            panel.visual?.primaryRead,
            panel.visual?.sceneVisual?.setting,
          ]
            .filter(Boolean)
            .join(' '),
        });
      }
    }
  }

  const initialFingerprints = initialCharacterFingerprints(params.initialCharacters);
  return [...candidates.values()].filter(
    (character) => !isInitialCharacterName(character.name, initialFingerprints)
  );
}

async function hydrateExistingTurnaroundSheetsForCharacters(params: {
  userId: string;
  characters: CharacterData[];
}): Promise<void> {
  const ids = [
    ...new Set(
      params.characters
        .filter(
          (character) =>
            (character as any).source === 'llm_generated' &&
            typeof character.id === 'string' &&
            !(character as any).turnaroundSheet?.url
        )
        .map((character) => character.id as string)
    ),
  ];
  if (ids.length === 0) return;

  const rows = await getCharacterRepository().findByIds(params.userId, ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const character of params.characters) {
    if ((character as any).source !== 'llm_generated' || !character.id) continue;
    const sheet = byId.get(character.id)?.turnaroundSheet as
      | { url?: string; frontUrl?: string; generatedAt?: string; sourcePhotoUrl?: string }
      | null
      | undefined;
    if (sheet?.url) {
      (character as any).turnaroundSheet = sheet;
      (character as any)._llmHasTurnaround = true;
    }
  }
}

async function ensureGraphicNovelLlmCharacterTurnarounds(params: {
  storyId: string;
  storyRequestId: string;
  userId: string;
  generationKind: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND;
  imageStyle?: string;
  characters: CharacterData[];
}): Promise<void> {
  await hydrateExistingTurnaroundSheetsForCharacters({
    userId: params.userId,
    characters: params.characters,
  });

  for (const character of params.characters) {
    if ((character as any).source !== 'llm_generated' || !character.id) continue;
    if ((character as any).turnaroundSheet?.url) continue;
    if (character.referencePhotos && character.referencePhotos.length > 0) continue;

    const startedAt = new Date();
    try {
      const result = await generateLlmCharacterTurnaround({
        characterId: character.id,
        userId: params.userId,
        characterName: character.name,
        characterDescription: character.appearance || character.description || character.name,
        imageStyle: params.imageStyle,
        storyId: params.storyId,
      });
      const sheet = {
        url: result.url,
        ...(result.frontUrl && { frontUrl: result.frontUrl }),
        generatedAt: result.generatedAt,
        sourcePhotoUrl: result.sourcePhotoUrl,
      };
      (character as any).turnaroundSheet = sheet;
      (character as any)._llmHasTurnaround = true;
      await recordStageTiming({
        storyId: params.storyId,
        storyRequestId: params.storyRequestId,
        userId: params.userId,
        generationKind: params.generationKind,
        pipelinePhase: 'asset_generation',
        operation: 'character_turnaround',
        targetType: 'character',
        targetKey: character.id,
        startedAt,
        completedAt: new Date(),
        cacheStatus: result.sourcePhotoUrl === 'cache' ? 'hit' : 'miss',
        metadata: {
          characterName: character.name,
          sourcePhotoUrl: result.sourcePhotoUrl,
          imageStyle: params.imageStyle,
        },
      });
    } catch (error) {
      logger.error(
        { err: error, characterId: character.id, characterName: character.name },
        'Failed to generate graphic novel LLM character turnaround'
      );
      await recordStageTiming({
        storyId: params.storyId,
        storyRequestId: params.storyRequestId,
        userId: params.userId,
        generationKind: params.generationKind,
        pipelinePhase: 'asset_generation',
        operation: 'character_turnaround',
        targetType: 'character',
        targetKey: character.id,
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        metadata: {
          characterName: character.name,
          imageStyle: params.imageStyle,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}

async function prepareGraphicNovelCharactersForScript(params: {
  storyId: string;
  storyRequestId: string;
  userId: string;
  generationKind: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND;
  spec: { language?: string; characters?: CharacterData[] };
  script: ComicScriptWithCharacters;
  imageStyle?: string;
}): Promise<{ characters: CharacterData[]; llmCharacters: ComicLlmCharacter[] }> {
  const initialCharacters = Array.isArray(params.spec.characters)
    ? (params.spec.characters as CharacterData[])
    : [];
  if (
    (params.script.characters || []).some((character) =>
      normalizeCharacterRef(character?.characterRef)
    )
  ) {
    reconcileGeneratedCharacterIdentity({
      document: params.script as unknown as Record<string, any>,
      existingCharacters: initialCharacters,
    });
  }
  const llmCharacters = extractLlmCharactersFromComicScript({
    script: params.script,
    initialCharacters,
  });
  const characters = mergeCharacters(initialCharacters, llmCharacters);
  const llmCharacterResults = await persistLlmCharacters(
    params.userId,
    llmCharacters,
    initialCharacters,
    params.spec.language
  );

  const replacements = bindPersistedCharacterRefs({
    text: params.script,
    mergedCharacters: characters,
    persistenceResults: llmCharacterResults,
  });
  for (const character of llmCharacters) {
    const replacement = replacements.get(normalizeCharacterRef(character.characterRef));
    if (replacement) character.characterRef = replacement;
  }

  await ensureGraphicNovelLlmCharacterTurnarounds({
    storyId: params.storyId,
    storyRequestId: params.storyRequestId,
    userId: params.userId,
    generationKind: params.generationKind,
    imageStyle: params.imageStyle,
    characters,
  });

  logger.info(
    {
      storyRequestId: params.storyRequestId,
      storyId: params.storyId,
      generationKind: params.generationKind,
      llmCharacterCount: llmCharacters.length,
      llmCharacterNames: llmCharacters.map((character) => character.name),
    },
    'Graphic novel LLM characters persisted and turnaround-ready'
  );

  return { characters, llmCharacters };
}

function characterDataFromGraphicNovelManifest(
  characters: GraphicNovelCharacterManifest
): CharacterData[] {
  return characters
    .filter((character) => character?.name)
    .map((character) => {
      const turnaroundRef = character.references?.find((ref) => ref.isTurnaround);
      const photoRefs = character.references?.filter((ref) => !ref.isTurnaround) || [];
      return {
        id: character.id,
        characterRef: character.characterRef || character.id,
        name: character.name,
        canonicalName: character.canonicalName,
        nameAliases: character.nameAliases,
        type: character.type,
        source: character.source,
        description: character.description,
        appearance: character.description,
        defaultOutfitText: character.defaultOutfitText ?? undefined,
        defaultOutfitEmbedding: character.defaultOutfitEmbedding ?? undefined,
        ...(turnaroundRef && {
          turnaroundSheet: {
            url: turnaroundRef.storagePath,
            generatedAt: new Date().toISOString(),
            sourcePhotoUrl: 'graphic_novel_layout_manifest',
          },
        }),
        ...(photoRefs.length > 0 && {
          referencePhotos: photoRefs.map((ref) => ({
            url: ref.storagePath,
            uploadedAt: new Date().toISOString(),
          })),
        }),
      } as unknown as CharacterData;
    });
}

function mergeStoredLlmCharacters(
  existing: unknown,
  next: ComicLlmCharacter[]
): ComicLlmCharacter[] {
  const merged = new Map<string, ComicLlmCharacter>();
  if (Array.isArray(existing)) {
    for (const character of existing) {
      if (!character || typeof character !== 'object') continue;
      const name = String((character as any).name || '').trim();
      if (!name) continue;
      const characterRef = normalizeCharacterRef((character as any).characterRef);
      merged.set(
        characterRef ? `ref:${characterRef}` : `legacy-name:${normalizeCharacterName(name)}`,
        character as ComicLlmCharacter
      );
    }
  }
  for (const character of next) {
    const characterRef = normalizeCharacterRef(character.characterRef);
    merged.set(
      characterRef
        ? `ref:${characterRef}`
        : `legacy-name:${normalizeCharacterName(character.name)}`,
      character
    );
  }
  return [...merged.values()];
}

async function ensureGraphicNovelProjectManifestCharacters(params: {
  project: {
    id: string;
    storyId: string;
    storyRequestId?: string | null;
    language?: string | null;
    layoutManifest?: unknown;
  };
  story: { userId: string; metadata?: unknown } | null;
  userId: string;
  generationKind: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND;
  script: ComicScriptWithCharacters;
  imageStyle?: string;
}): Promise<{ layoutManifest: Record<string, any>; characters: GraphicNovelCharacterManifest }> {
  const currentLayoutManifest =
    (params.project.layoutManifest as Record<string, any> | null | undefined) || {};
  const currentCharacters = Array.isArray(currentLayoutManifest.characters)
    ? (currentLayoutManifest.characters as GraphicNovelCharacterManifest)
    : [];
  const manifestNeedsRepair = currentCharacters.some(
    (character) =>
      !character.id ||
      !character.characterRef ||
      (character.source === 'llm_generated' &&
        !character.references?.some((reference) => reference.isTurnaround))
  );
  const storyMetadata = (params.story?.metadata as Record<string, unknown> | null) || {};
  const currentArtifactReference = storyArtifactReferenceFromManifest(
    currentLayoutManifest,
    storyMetadata
  );
  const layoutManifestWithArtifact = currentArtifactReference
    ? {
        ...currentLayoutManifest,
        closingArtifactReference: currentArtifactReference,
      }
    : currentLayoutManifest;
  const shouldPersistArtifactReference =
    currentArtifactReference &&
    (currentLayoutManifest.closingArtifactReference as Record<string, unknown> | undefined)
      ?.referenceBindingId !== currentArtifactReference.referenceBindingId;
  let initialCharacters = characterDataFromGraphicNovelManifest(currentCharacters);
  const manifestRefs = new Set(
    initialCharacters.map(characterRefForCharacter).filter(Boolean)
  );
  const missingPersistedRefs = [
    ...new Set(
      (params.script.characters || [])
        .map((character) => normalizeCharacterRef(character?.characterRef))
        .filter(
          (characterRef) =>
            characterRef &&
            !isTemporaryCharacterRef(characterRef) &&
            !manifestRefs.has(characterRef)
        )
    ),
  ];
  if (missingPersistedRefs.length > 0) {
    const recoveredRows = await getCharacterRepository().findByIds(
      params.userId,
      missingPersistedRefs
    );
    const recoveredById = new Map(recoveredRows.map((row) => [row.id, row]));
    const unresolvedRefs = missingPersistedRefs.filter((id) => !recoveredById.has(id));
    if (unresolvedRefs.length > 0) {
      throw new Error(
        `Comic script references persisted characters unavailable to this user: ${unresolvedRefs.join(', ')}`
      );
    }
    initialCharacters = [
      ...initialCharacters,
      ...missingPersistedRefs.map((id) => {
        const row = recoveredById.get(id)! as any;
        return {
          id: row.id,
          characterRef: row.id,
          name: row.name,
          canonicalName: row.name,
          type: row.type || 'imaginary',
          source: row.isHidden ? 'llm_generated' : 'user_provided',
          description: row.description || row.aiGeneratedDescription || undefined,
          appearance: row.aiGeneratedDescription || row.description || undefined,
          referencePhotos: row.referencePhotos || undefined,
          turnaroundSheet: row.turnaroundSheet || undefined,
        } as CharacterData;
      }),
    ];
  }
  const missingLlmCharacters = extractLlmCharactersFromComicScript({
    script: params.script,
    initialCharacters,
  });

  if (
    missingLlmCharacters.length === 0 &&
    missingPersistedRefs.length === 0 &&
    !manifestNeedsRepair
  ) {
    if (shouldPersistArtifactReference) {
      await getGraphicNovelRepository().updateProject(params.project.id, {
        layoutManifest: layoutManifestWithArtifact,
      });
    }
    return { layoutManifest: layoutManifestWithArtifact, characters: currentCharacters };
  }

  const { characters, llmCharacters } = await prepareGraphicNovelCharactersForScript({
    storyId: params.project.storyId,
    storyRequestId: params.project.storyRequestId || `graphic-project-${params.project.id}`,
    userId: params.userId,
    generationKind: params.generationKind,
    spec: {
      language: params.project.language || undefined,
      characters: initialCharacters,
    },
    script: params.script,
    imageStyle: params.imageStyle,
  });
  const characterManifest = await buildGraphicNovelCharacterManifest(characters);
  const layoutManifest = {
    ...layoutManifestWithArtifact,
    characters: characterManifest,
  };
  await getGraphicNovelRepository().updateProject(params.project.id, { layoutManifest });

  await getStoryRepository().updateStory(params.project.storyId, {
    metadata: {
      ...storyMetadata,
      llmGeneratedCharacters: mergeStoredLlmCharacters(
        storyMetadata.llmGeneratedCharacters,
        llmCharacters
      ),
    },
  });
  await linkGraphicNovelStoryCharacters({
    storyId: params.project.storyId,
    characters,
  });

  logger.info(
    {
      storyId: params.project.storyId,
      projectId: params.project.id,
      generationKind: params.generationKind,
      addedLlmCharacterNames: llmCharacters.map((character) => character.name),
    },
    'Graphic novel project manifest enriched with LLM characters from saved script'
  );

  return { layoutManifest, characters: characterManifest };
}

export interface GraphicNovelTextManifest {
  version: 1;
  textMode: 'html_overlay';
  pages: GraphicNovelPageTextOverlay[];
  fullText: string;
  scenes: Array<{
    sceneId: number;
    text: string;
    graphicNovelPageNumber: number;
    graphicNovelTextMode: 'html_overlay';
    graphicNovelTextSegmentIds: string[];
  }>;
}

export interface MixedStoryTextManifest {
  version: 1;
  textMode: 'mixed_story_reading_blocks';
  pages: GraphicNovelPageTextOverlay[];
  fullText: string;
  scenes: Array<{
    sceneId: number;
    text: string;
    mixedStoryBlockKind: 'comic' | 'prose';
    mixedStoryScreenOrder: number;
    mixedStorySourceSceneIds: number[];
    mixedStoryAnchorSceneId?: number;
    graphicNovelPageNumber?: number;
    graphicNovelTextMode?: 'html_overlay';
    graphicNovelTextSegmentIds?: string[];
  }>;
  readingOrder: Array<{
    screenOrder: number;
    kind: 'comic' | 'prose';
    sceneId?: number;
    pageNumber?: number;
    sourceSceneIds: number[];
    textSegmentIds: string[];
  }>;
}

type GraphicNovelCharacterManifest = Array<{
  id?: string;
  characterRef?: string;
  name: string;
  canonicalName?: string;
  nameAliases?: string[];
  type?: string;
  source?: CharacterData['source'];
  description?: string;
  defaultOutfitText?: string | null;
  defaultOutfitEmbedding?: number[] | null;
  referenceBindingId?: string;
  references?: Array<{
    storagePath: string;
    source: 'child_reference' | 'character_reference' | 'imaginary_friend';
    type: 'child_reference' | 'character_reference' | 'imaginary';
    isTurnaround: boolean;
    referenceBindingId?: string;
  }>;
}>;

type GraphicNovelReferenceImage = ReferenceImage & {
  source?: string;
  type?: string;
  isTurnaround?: boolean;
  environmentId?: string;
  storagePath?: string;
  characterId?: string;
  outfitId?: string;
};

type GraphicNovelPanelValidationReferenceImage = {
  characterName: string;
  characterId?: string;
  imageData?: string;
  fileUri?: string;
  mimeType: string;
  referenceKind: 'identity';
  identitySource: 'turnaround' | 'reference_photo' | 'dressed_turnaround';
};

type RenderedGraphicNovelPageAssets = {
  pageAssetId: string;
  coverAssetId?: string;
  coverSource?: GraphicNovelCoverSource;
};

type GraphicNovelPageRenderTestOverride = (params: {
  requestId: string;
  storyId: string;
  userId: string;
  generationKind?: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND;
  page: any;
  style: string;
  ageGroup: string;
  scenarioCardId?: string;
  environments: StoryEnvironment[];
  characters: GraphicNovelCharacterManifest;
  storyArtifactReference?: GraphicNovelStoryArtifactReference | null;
  createCoverCandidate?: boolean;
}) => Promise<RenderedGraphicNovelPageAssets>;

let graphicNovelPageRenderTestOverride: GraphicNovelPageRenderTestOverride | null = null;

/** Replace only page render/storage while processGraphicNovelPages handoff stays real. */
export function installGraphicNovelPageRenderTestOverride(
  override: GraphicNovelPageRenderTestOverride
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Graphic novel page render test override cannot be installed in production');
  }
  graphicNovelPageRenderTestOverride = override;
}

export function clearGraphicNovelPageRenderTestOverride(): void {
  graphicNovelPageRenderTestOverride = null;
}

type RenderedGraphicNovelPageArt = {
  imageData: Buffer;
  mimeType: string;
  generationParams: Record<string, unknown>;
  panelImages?: GraphicNovelBubbleVisionPanelImage[];
};

type PixelCropRect = { left: number; top: number; width: number; height: number };
type GraphicNovelCoverSource =
  | 'matching_story_card_aspect_ratio_panel'
  | 'full_width_panel'
  | 'widest_first_page_panel';
type GraphicNovelCoverPanelSelection = {
  panelIndex: number;
  source: GraphicNovelCoverSource;
  imageWidth: number;
  imageHeight: number;
};
type GraphicNovelPanelAttemptAsset = {
  assetId: string;
  storagePath: string;
  storageUrl: string | null;
  mimeType: string;
  fileSizeBytes: number;
};

type GraphicNovelExpectedValidationCharacter = {
  name: string;
  characterRef?: string;
  characterKind: 'human' | 'animal' | 'imaginary';
  description?: string;
  validateOutfit: boolean;
};

type GraphicNovelDetectedPanelBounds = {
  panelNumber: number;
  panelId: string;
  cropRect: PixelCropRect;
  normalizedRect: Rect;
  matchConfidence: number | null;
  matchReason?: string | null;
};

type GraphicNovelPanelRenderedValidation = {
  panelNumber: number;
  panelId: string;
  cropRect: PixelCropRect;
  normalizedRect: Rect;
  expectedCharacters: GraphicNovelExpectedValidationCharacter[];
  validation: ImageValidationResult;
  score: number | null;
  imageData?: Buffer;
  mimeType?: string;
  attempt: number;
  repairMode?: 'original' | 'edit' | 'generate';
  requestManifest?: Record<string, unknown>;
  sourcePanelValidations?: GraphicNovelPanelRenderedValidation[];
};

type GraphicNovelPanelQualityDecision = {
  accepted: boolean;
  failureReasons: string[];
};

function getContinuationDataFromRequest(request: { id: string; intermediateData?: unknown }): {
  intermediateData: Record<string, any>;
  isContinuation: boolean;
  isScheduledContinuation: boolean;
  seriesId?: string;
  partNumber?: number;
  continuationContext?: ContinuationContext;
} {
  const intermediateData =
    request.intermediateData && typeof request.intermediateData === 'object'
      ? (request.intermediateData as Record<string, any>)
      : {};
  const isContinuation = !!intermediateData.isContinuation;
  const seriesId =
    typeof intermediateData.seriesId === 'string' ? intermediateData.seriesId : undefined;
  const partNumber =
    typeof intermediateData.partNumber === 'number' ? intermediateData.partNumber : undefined;
  const continuationContext = intermediateData.continuationContext as
    | ContinuationContext
    | undefined;

  if (isContinuation && (!seriesId || !partNumber || !continuationContext)) {
    throw new Error(
      `Invalid graphic novel continuation request ${request.id}: missing series context`
    );
  }

  return {
    intermediateData,
    isContinuation,
    isScheduledContinuation: !!intermediateData.isScheduledContinuation,
    seriesId,
    partNumber,
    continuationContext: isContinuation ? continuationContext : undefined,
  };
}

function isGraphicNovelCoverSource(value: unknown): value is GraphicNovelCoverSource {
  return (
    value === 'matching_story_card_aspect_ratio_panel' ||
    value === 'full_width_panel' ||
    value === 'widest_first_page_panel'
  );
}

async function hasReusableGraphicNovelCover(
  storyMetadata: Record<string, unknown>,
  coverAssetId: string | null | undefined
): Promise<boolean> {
  if (!coverAssetId || !isGraphicNovelCoverSource(storyMetadata.graphicNovelCoverSource)) {
    return false;
  }

  const asset = await getAssetRepository().findById(coverAssetId);
  const params = (asset?.generationParams as Record<string, unknown> | null) || {};
  return (
    params.kind === 'graphic_novel_cover_panel' &&
    (params.sourceImageKind === 'standalone_final_panel_image' ||
      params.sourceImageKind === 'art_only_before_bubble_overlay')
  );
}

type GraphicNovelRenderedPageValidation = {
  validation: ImageValidationResult;
  score: number | null;
  attempt: number;
  panelValidations?: GraphicNovelPanelRenderedValidation[];
  imageData?: Buffer;
  mimeType?: string;
  panelRepairSummary?: Record<string, unknown>;
};

type GraphicNovelReadingTextSettings = {
  baseTextSizePx: number;
  textSizeMultiplier: number;
  textSizePx: number;
  bubbleTextSizing: GraphicNovelBubbleTextSizing;
};

function getAgeYearsFromBirthDateForGraphicNovelReadingSettings(
  birthDate: Date | string | null
): number | null {
  if (!birthDate) return null;
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let ageYears = now.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (birthdayThisYear > now) {
    ageYears -= 1;
  }
  return Math.max(0, ageYears);
}

async function resolveGraphicNovelReadingTextSettings(params: {
  ageGroup: string;
  userId: string;
  childProfileId?: string | null;
}): Promise<GraphicNovelReadingTextSettings> {
  const readingProfile = params.childProfileId
    ? await getChildProfileRepository().findById(params.childProfileId, params.userId)
    : null;
  const readingProfileAgeYears = readingProfile
    ? getAgeYearsFromBirthDateForGraphicNovelReadingSettings(readingProfile.birthDate)
    : null;
  const baseTextSizePx =
    readingProfileAgeYears !== null
      ? getBaseStoryTextSizePxForAgeYears(readingProfileAgeYears)
      : getBaseStoryTextSizePxForAgeGroup(params.ageGroup);
  const textSizeMultiplier = normalizeStoryTextSizeMultiplier(
    readingProfile?.storyTextSizeMultiplier
  );
  const textSizePx = getStoryTextSizePx(baseTextSizePx, textSizeMultiplier);

  return {
    baseTextSizePx,
    textSizeMultiplier,
    textSizePx,
    bubbleTextSizing: graphicNovelBubbleTextSizingFromStoryTextSize(textSizePx, {
      ageYears: readingProfileAgeYears,
      ageGroup: params.ageGroup,
    }),
  };
}

export function getGraphicNovelStoryCharacterLinks(
  characters: Array<Pick<CharacterData, 'id' | 'type' | 'role'>>
): Array<{ characterId: string; role: string }> {
  const rolesById = new Map<string, string>();

  for (const character of characters) {
    if (!character.id || character.type === 'child') continue;
    if (!rolesById.has(character.id)) {
      rolesById.set(character.id, character.role || 'supporting');
    }
  }

  return [...rolesById.entries()].map(([characterId, role]) => ({ characterId, role }));
}

async function linkGraphicNovelStoryCharacters(params: {
  storyId: string;
  characters: CharacterData[];
}): Promise<void> {
  const links = getGraphicNovelStoryCharacterLinks(params.characters);
  if (links.length === 0) return;

  await Promise.all(
    links.map((link) =>
      getStoryRepository()
        .createStoryCharacter({
          storyId: params.storyId,
          characterId: link.characterId,
          role: link.role,
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          const code =
            typeof error === 'object' && error && 'code' in error
              ? String((error as { code?: unknown }).code)
              : '';
          if (!message.includes('duplicate') && code !== '23505') {
            logger.error(
              { err: error, storyId: params.storyId, characterId: link.characterId },
              'Failed to link graphic novel character'
            );
            throw error;
          }
        })
    )
  );

  logger.info(
    {
      storyId: params.storyId,
      characterCount: links.length,
    },
    'Graphic novel characters linked to story'
  );
}

export function buildGraphicNovelTextManifest(
  plannedPages: PlannedGraphicNovelPage[]
): GraphicNovelTextManifest {
  const pages = plannedPages.map((page) =>
    buildGraphicNovelPageTextOverlay(page, {
      textTransform: stripCharacterIds,
      displayTextTransform: stripAllTags,
      audioTextTransform: stripForAudio,
    })
  );
  const scenes = pages.map((page) => ({
    sceneId: page.pageNumber,
    text: page.rawPlainText,
    graphicNovelPageNumber: page.pageNumber,
    graphicNovelTextMode: 'html_overlay' as const,
    graphicNovelTextSegmentIds: page.items.map((item) => item.segmentId),
  }));

  return {
    version: 1,
    textMode: 'html_overlay',
    pages,
    fullText: scenes
      .map((scene) => scene.text)
      .filter(Boolean)
      .join('\n\n'),
    scenes,
  };
}

export function buildMixedStoryTextManifest(params: {
  script: MixedStoryScript;
  plannedPages: PlannedGraphicNovelPage[];
}): MixedStoryTextManifest {
  const pages = params.plannedPages.map((page) =>
    buildGraphicNovelPageTextOverlay(page, {
      textTransform: stripCharacterIds,
      displayTextTransform: stripAllTags,
      audioTextTransform: stripForAudio,
    })
  );
  const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]));
  const scenes: MixedStoryTextManifest['scenes'] = [];
  const readingOrder: MixedStoryTextManifest['readingOrder'] = [];

  const blocks = [...params.script.readingBlocks].sort((a, b) => a.screenOrder - b.screenOrder);
  for (const block of blocks) {
    if (block.kind === 'comic') {
      const page = pageByNumber.get(block.comicPageNumber);
      const orderedItems = [...(page?.items || [])].sort((a, b) => a.readingOrder - b.readingOrder);
      const text = orderedItems
        .map((item) => item.audioText)
        .filter(Boolean)
        .join('\n');
      const textSegmentIds = orderedItems.map((item) => item.segmentId);
      scenes.push({
        sceneId: block.screenOrder,
        text,
        mixedStoryBlockKind: 'comic',
        mixedStoryScreenOrder: block.screenOrder,
        mixedStorySourceSceneIds: [block.sceneId],
        mixedStoryAnchorSceneId: block.sceneId,
        graphicNovelPageNumber: block.comicPageNumber,
        graphicNovelTextMode: 'html_overlay',
        graphicNovelTextSegmentIds: textSegmentIds,
      });
      readingOrder.push({
        screenOrder: block.screenOrder,
        kind: 'comic',
        sceneId: block.sceneId,
        pageNumber: block.comicPageNumber,
        sourceSceneIds: [block.sceneId],
        textSegmentIds,
      });
      continue;
    }

    scenes.push({
      sceneId: block.screenOrder,
      text: block.text,
      mixedStoryBlockKind: 'prose',
      mixedStoryScreenOrder: block.screenOrder,
      mixedStorySourceSceneIds: block.sceneIds,
    });
    readingOrder.push({
      screenOrder: block.screenOrder,
      kind: 'prose',
      sourceSceneIds: block.sceneIds,
      textSegmentIds: [`mixed-prose-${block.screenOrder}`],
    });
  }

  return {
    version: 1,
    textMode: 'mixed_story_reading_blocks',
    pages,
    scenes,
    fullText: scenes
      .map((scene) => scene.text)
      .filter(Boolean)
      .join('\n\n'),
    readingOrder,
  };
}

async function mergeRequestIntermediateData(
  requestId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const request = await getStoryRepository().findRequestById(requestId);
  await getStoryRepository().updateRequest(requestId, {
    intermediateData: {
      ...((request?.intermediateData as Record<string, unknown> | null) || {}),
      ...patch,
    },
  });
}

async function setGraphicNovelProgressStage(
  requestId: string,
  stage: (typeof GRAPHIC_NOVEL_PROGRESS_STAGES)[number],
  generationKind: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND = GRAPHIC_NOVEL_KIND
): Promise<void> {
  await mergeRequestIntermediateData(requestId, {
    generationKind,
    graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
    graphicNovelProgressStage: stage,
  });
}

async function saveThumbnail(
  assetId: string,
  storagePath: string,
  imageBuffer: Buffer,
  options: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain';
    background?: string;
  } = {}
): Promise<void> {
  try {
    const width = options.width ?? 384;
    const height = options.height ?? 512;
    const fit = options.fit ?? 'cover';
    const thumbnailBuffer =
      fit === 'cover'
        ? await getAssetStorageService().generateThumbnail(imageBuffer, width, height)
        : await sharp(imageBuffer)
            .resize(width, height, {
              fit,
              position: 'center',
              background: options.background ?? '#fffaf2',
            })
            .jpeg({ quality: 80 })
            .toBuffer();
    const thumbnailPath = storagePath.replace(/(\.[^.]+)$/, '_thumb.jpg');
    const fullPath = path.join(process.cwd(), 'uploads', thumbnailPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, thumbnailBuffer);
    await getAssetRepository().update(assetId, {
      thumbnailPath,
      thumbnailUrl: `/api/v1/assets/${thumbnailPath}`,
    });
  } catch (error) {
    logger.warn({ err: error, assetId }, 'Graphic novel page thumbnail generation failed');
  }
}

const STORY_CARD_ASPECT_RATIO = 16 / 9;
const STORY_CARD_ASPECT_RATIO_RELATIVE_TOLERANCE = 0.03;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampRectToUnit(rect: Rect): Rect | null {
  const x = clampNumber(rect.x, 0, 1);
  const y = clampNumber(rect.y, 0, 1);
  const right = clampNumber(rect.x + rect.width, 0, 1);
  const bottom = clampNumber(rect.y + rect.height, 0, 1);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

export function selectGraphicNovelCoverPanel(
  panels: Array<{ panelIndex: number; imageWidth: number; imageHeight: number }>
): GraphicNovelCoverPanelSelection | null {
  const selectedPanel = panels.find((panel) => {
    if (panel.imageWidth <= 0 || panel.imageHeight <= 0) return false;
    const aspectRatio = panel.imageWidth / panel.imageHeight;
    return (
      Math.abs(aspectRatio - STORY_CARD_ASPECT_RATIO) / STORY_CARD_ASPECT_RATIO <=
      STORY_CARD_ASPECT_RATIO_RELATIVE_TOLERANCE
    );
  });

  return selectedPanel
    ? {
        ...selectedPanel,
        source: 'matching_story_card_aspect_ratio_panel',
      }
    : null;
}

async function createGraphicNovelCoverPanelAsset(params: {
  storyId: string;
  userId: string;
  requestId: string;
  page: PlannedGraphicNovelPage;
  pageAssetId: string;
  panelImages?: GraphicNovelBubbleVisionPanelImage[];
}): Promise<{ assetId: string; source: GraphicNovelCoverSource } | null> {
  const panelImages = [...(params.panelImages ?? [])].sort(
    (left, right) => left.panelIndex - right.panelIndex
  );
  const panelDimensions = await Promise.all(
    panelImages.map(async (panelImage) => {
      const metadata = await sharp(panelImage.imageData).metadata();
      return {
        panelIndex: panelImage.panelIndex,
        imageWidth: metadata.width ?? 0,
        imageHeight: metadata.height ?? 0,
      };
    })
  );
  const selectedPanel = selectGraphicNovelCoverPanel(panelDimensions);
  if (!selectedPanel) {
    return null;
  }
  const selectedPanelImage = panelImages.find(
    (panelImage) => panelImage.panelIndex === selectedPanel.panelIndex
  );
  if (!selectedPanelImage) return null;

  const coverImage = await sharp(selectedPanelImage.imageData).png().toBuffer();
  const sourceAspectRatio = selectedPanel.imageWidth / selectedPanel.imageHeight;

  const assetStorage = getAssetStorageService();
  const uploadResult = await assetStorage.uploadAsset({
    data: coverImage,
    mimeType: 'image/png',
    userId: params.userId,
    storyId: params.storyId,
    assetType: 'image',
  });

  const asset = await getAssetRepository().create({
    storyId: params.storyId,
    sceneId: null,
    assetType: 'image',
    storagePath: uploadResult.storagePath,
    storageUrl: uploadResult.storageUrl,
    signedUrl: uploadResult.signedUrl,
    signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
    mimeType: 'image/png',
    fileSizeBytes: uploadResult.fileSizeBytes,
    generationParams: {
      kind: 'graphic_novel_cover_panel',
      source: selectedPanel.source,
      selectionStrategy: 'first_standalone_panel_matching_story_card_aspect_ratio',
      sourceImageKind: 'standalone_final_panel_image',
      pageNumber: params.page.pageNumber,
      panelIndex: selectedPanel.panelIndex,
      panelId: selectedPanelImage.panelId ?? null,
      requestId: params.requestId,
      sourcePageAssetId: params.pageAssetId,
      sourceImageWidth: selectedPanel.imageWidth,
      sourceImageHeight: selectedPanel.imageHeight,
      sourceAspectRatio,
      targetAspectRatio: STORY_CARD_ASPECT_RATIO,
      aspectRatioRelativeTolerance: STORY_CARD_ASPECT_RATIO_RELATIVE_TOLERANCE,
      templatePanelRect:
        params.page.panels[selectedPanel.panelIndex - 1]?.templatePanel.rect ?? null,
    },
    generationTimeMs: null,
    status: 'completed',
  });

  await saveThumbnail(asset.id, uploadResult.storagePath, coverImage, {
    width: 672,
    height: 384,
    fit: 'cover',
  });
  return { assetId: asset.id, source: selectedPanel.source };
}

async function saveGraphicNovelPanelAttemptAsset(params: {
  storyId: string;
  userId: string;
  requestId: string;
  pageNumber: number;
  panelIndex: number;
  panelId?: string | null;
  attempt: number;
  operation: string;
  source:
    | 'template_panel_generate'
    | 'panel_validation_original'
    | 'panel_validation_repair'
    | 'manual_panel_repair';
  imageData: Buffer;
  mimeType: string;
  cropRect?: PixelCropRect | null;
  repairMode?: string | null;
}): Promise<GraphicNovelPanelAttemptAsset> {
  const mimeType = params.mimeType || 'image/png';
  const assetStorage = getAssetStorageService();
  const uploadResult = await assetStorage.uploadAsset({
    data: params.imageData,
    mimeType,
    userId: params.userId,
    storyId: params.storyId,
    assetType: 'image',
  });

  const asset = await getAssetRepository().create({
    storyId: params.storyId,
    sceneId: null,
    assetType: 'image',
    storagePath: uploadResult.storagePath,
    storageUrl: uploadResult.storageUrl,
    signedUrl: uploadResult.signedUrl,
    signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
    mimeType,
    fileSizeBytes: uploadResult.fileSizeBytes,
    generationParams: {
      kind: 'graphic_novel_panel_attempt',
      source: params.source,
      operation: params.operation,
      pageNumber: params.pageNumber,
      panelIndex: params.panelIndex,
      panelId: params.panelId ?? null,
      attempt: params.attempt,
      requestId: params.requestId,
      cropRect: params.cropRect ?? null,
      repairMode: params.repairMode ?? null,
      composedIntoPage: false,
    },
    generationTimeMs: null,
    status: 'completed',
  });

  return {
    assetId: asset.id,
    storagePath: uploadResult.storagePath,
    storageUrl: uploadResult.storageUrl,
    mimeType,
    fileSizeBytes: uploadResult.fileSizeBytes,
  };
}

function panelCharacterNames(panel: GraphicNovelPanelScript): string[] {
  const composition = panel.visual.sceneVisual.cameraComposition;
  if (typeof composition === 'string') return [];
  return composition.characters.map((character) => character.name).filter(Boolean);
}

function panelCharacterRefs(panel: GraphicNovelPanelScript): string[] {
  const composition = panel.visual.sceneVisual.cameraComposition;
  if (typeof composition === 'string') return [];
  return composition.characters
    .map((character) => normalizeCharacterRef(character.characterRef))
    .filter(Boolean);
}

function normalizeCharacterName(value: string): string {
  return stripCharacterIdFromName(value).trim().toLowerCase();
}

function graphicNovelCharacterKind(type?: string): 'human' | 'animal' | 'imaginary' {
  const normalized = (type || '').toLowerCase();
  if (normalized === 'animal') return 'animal';
  if (normalized === 'imaginary' || normalized === 'creature' || normalized === 'object')
    return 'imaginary';
  return 'human';
}

function graphicNovelReferenceSource(character: { type?: string }): {
  source: 'child_reference' | 'character_reference' | 'imaginary_friend';
  type: 'child_reference' | 'character_reference' | 'imaginary';
} {
  if (character.type === 'child') return { source: 'child_reference', type: 'child_reference' };
  if (character.type === 'imaginary') return { source: 'imaginary_friend', type: 'imaginary' };
  return { source: 'character_reference', type: 'character_reference' };
}

function extractStoragePath(url: string): string {
  const withoutQuery = url.split('?')[0];
  const withoutOrigin = withoutQuery.replace(/^https?:\/\/[^/]+/, '');
  return withoutOrigin.replace(/^\/api\/v1\/assets\//, '').replace(/^\/+/, '');
}

function mimeTypeForStoragePath(storagePath: string): string {
  return imageMimeTypeFromPath(storagePath);
}

function buildGraphicNovelCharacterReferences(
  character: any,
  referenceBindingId?: string
): NonNullable<GraphicNovelCharacterManifest[number]['references']> {
  const refs: NonNullable<GraphicNovelCharacterManifest[number]['references']> = [];
  const source = graphicNovelReferenceSource(character);
  const turnaround = character.turnaroundSheet as
    | { url?: string; frontUrl?: string }
    | null
    | undefined;
  const turnaroundUrl = turnaround?.url || turnaround?.frontUrl;

  if (turnaroundUrl) {
    refs.push({
      storagePath: extractStoragePath(turnaroundUrl),
      ...source,
      isTurnaround: true,
      referenceBindingId,
    });
    return refs;
  }

  for (const photo of character.referencePhotos || []) {
    if (!photo?.url) continue;
    refs.push({
      storagePath: extractStoragePath(photo.url),
      ...source,
      isTurnaround: false,
      referenceBindingId,
    });
  }

  return refs;
}

function pushUniqueName(names: string[], value: unknown): void {
  const name = typeof value === 'string' ? stripCharacterIdFromName(value).trim() : '';
  if (!name) return;
  if (!names.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    names.push(name);
  }
}

const VISUAL_ALIAS_NOUNS = new Set([
  'android',
  'bird',
  'bot',
  'cat',
  'chick',
  'dog',
  'dragon',
  'droid',
  'fairy',
  'fox',
  'griffin',
  'gryphon',
  'hamster',
  'owl',
  'pegasus',
  'phoenix',
  'pixie',
  'rabbit',
  'robot',
  'sprite',
  'turtle',
  'unicorn',
]);

const VISUAL_ALIAS_ADJECTIVES = new Set([
  'baby',
  'brave',
  'copper',
  'friendly',
  'fuzzy',
  'gentle',
  'glowing',
  'golden',
  'green',
  'little',
  'mechanical',
  'mossy',
  'red',
  'round',
  'shy',
  'small',
  'tiny',
  'wooden',
  'yellow',
  'young',
]);

function pushVisualAliasVariant(aliases: string[], value: string): void {
  const phrase = value.replace(/\s+/g, ' ').trim();
  if (!phrase || phrase.length < 3) return;
  pushUniqueName(aliases, phrase);
  if (!/^(a|an|the)\s+/i.test(phrase)) {
    pushUniqueName(aliases, `the ${phrase}`);
  }
}

function deriveVisualAliasesFromEnglishText(text: string): string[] {
  const aliases: string[] = [];
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  for (let index = 0; index < words.length; index += 1) {
    const noun = words[index];
    if (!VISUAL_ALIAS_NOUNS.has(noun)) continue;

    pushVisualAliasVariant(aliases, noun);

    const prev = words[index - 1];
    if (prev && VISUAL_ALIAS_ADJECTIVES.has(prev)) {
      pushVisualAliasVariant(aliases, `${prev} ${noun}`);
    }

    const prev2 = words[index - 2];
    if (prev2 && prev && VISUAL_ALIAS_ADJECTIVES.has(prev2) && VISUAL_ALIAS_ADJECTIVES.has(prev)) {
      pushVisualAliasVariant(aliases, `${prev2} ${prev} ${noun}`);
    }
  }
  return aliases;
}

function derivedGraphicNovelCharacterAliases(
  character: GraphicNovelCharacterManifest[number]
): string[] {
  const aliases: string[] = [];
  const text = [
    character.name,
    character.canonicalName,
    ...(character.nameAliases || []),
    character.type,
    character.description,
  ]
    .filter(Boolean)
    .join(' ');

  for (const alias of deriveVisualAliasesFromEnglishText(text)) {
    pushUniqueName(aliases, alias);
  }

  const phoneticName = toPhoneticKey(
    [character.name, character.canonicalName].filter(Boolean).join(' ')
  );
  if (/grif+on|gryphon|griffin/.test(phoneticName)) {
    pushVisualAliasVariant(aliases, 'griffin');
    if (/maliuk|malyuk|maluk|baby|small|little|young/.test(phoneticName)) {
      pushVisualAliasVariant(aliases, 'small griffin');
      pushVisualAliasVariant(aliases, 'young griffin');
      pushVisualAliasVariant(aliases, 'baby griffin');
    }
  }
  if (/feniks|fenix|phoenix/.test(phoneticName)) {
    pushVisualAliasVariant(aliases, 'phoenix');
  }

  return aliases;
}

async function buildGraphicNovelCharacterManifest(
  characters: CharacterData[]
): Promise<GraphicNovelCharacterManifest> {
  const characterIds = characters
    .map((character) => character.id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  const translationsById = new Map<string, string[]>();

  if (characterIds.length > 0) {
    try {
      const translations = await getDictionaryRepository().findTranslationsForEntities(
        'character',
        characterIds,
        'name'
      );
      for (const translation of translations) {
        const aliases = translationsById.get(translation.entityId) || [];
        pushUniqueName(aliases, translation.value);
        translationsById.set(translation.entityId, aliases);
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to load graphic novel character name aliases');
    }
  }

  return characters.map((character) => {
    if (!character.id) {
      throw new Error(`Cannot build comic character manifest without persisted id: ${character.name}`);
    }
    const aliases: string[] = [];
    pushUniqueName(aliases, character.name);
    pushUniqueName(aliases, (character as any).canonicalName);
    for (const alias of character.nameAliases || []) pushUniqueName(aliases, alias);
    for (const translatedName of translationsById.get(character.id) || []) {
      pushUniqueName(aliases, translatedName);
    }

    const referenceBindingId = plannedCharacterReferenceIdForCharacter(character) ?? undefined;

    const references = buildGraphicNovelCharacterReferences(character, referenceBindingId);
    if (character.source === 'llm_generated' && !references.some((reference) => reference.isTurnaround)) {
      throw new Error(`Generated comic character ${character.name} has no turnaround reference`);
    }

    return {
      id: character.id,
      characterRef: character.id,
      name: character.name,
      canonicalName: (character as any).canonicalName,
      nameAliases: aliases,
      type: character.type,
      source: character.source,
      description: character.description || character.appearance || character.personality,
      defaultOutfitText: character.defaultOutfitText || undefined,
      defaultOutfitEmbedding: Array.isArray(character.defaultOutfitEmbedding)
        ? character.defaultOutfitEmbedding
        : undefined,
      referenceBindingId,
      references,
    };
  });
}

export function buildGraphicNovelCharacterAliasMap(
  characters: GraphicNovelCharacterManifest
): Record<string, string[]> {
  const aliasMap: Record<string, string[]> = {};
  for (const character of characters) {
    const aliases: string[] = [];
    pushUniqueName(aliases, character.name);
    pushUniqueName(aliases, character.canonicalName);
    for (const alias of character.nameAliases || []) {
      pushUniqueName(aliases, alias);
    }
    for (const alias of derivedGraphicNovelCharacterAliases(character)) {
      pushUniqueName(aliases, alias);
    }
    if (character.name && aliases.length > 0) {
      aliasMap[character.name] = aliases;
    }
  }
  return aliasMap;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function visualAliasMatchesText(text: string, alias: string): boolean {
  const cleanAlias = stripCharacterIdFromName(alias).replace(/\s+/g, ' ').trim();
  if (cleanAlias.length < 3) return false;

  const normalizedText = text.normalize('NFC').toLocaleLowerCase();
  const normalizedAlias = cleanAlias.normalize('NFC').toLocaleLowerCase();
  if (/^[a-z0-9][a-z0-9\s-]*[a-z0-9]$/i.test(normalizedAlias)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedAlias)}(?=$|[^a-z0-9])`, 'i').test(
      normalizedText
    );
  }

  return normalizedText.includes(normalizedAlias);
}

function panelVisualMentionText(panel: PlannedGraphicNovelPage['panels'][number]): string {
  const composition = panel.script.visual.sceneVisual.cameraComposition;
  const compositionText =
    typeof composition === 'string'
      ? composition
      : [
          composition.shot,
          ...composition.characters.flatMap((character) => [
            character.name,
            character.description,
            character.position,
          ]),
        ].join(' ');

  return [
    panel.script.visual.primaryRead,
    panel.script.visual.sceneVisual.setting,
    panel.script.visual.sceneVisual.lighting,
    panel.script.caption,
    compositionText,
  ]
    .filter(Boolean)
    .join(' ');
}

function graphicNovelOutfitIdByCharacterName(
  pages: PlannedGraphicNovelPage[],
  outfits: StoryOutfitRow[] = []
): Map<string, string> {
  const map = new Map<string, string>();

  for (const outfit of outfits) {
    const key = normalizeCharacterName(outfit.characterName || '');
    if (key && outfit.id && !map.has(key)) {
      map.set(key, outfit.id);
    }
  }

  for (const page of pages) {
    for (const panel of page.panels) {
      const composition = panel.script.visual.sceneVisual.cameraComposition;
      if (typeof composition === 'string') continue;
      for (const character of composition.characters || []) {
        const key = normalizeCharacterName(character.name || '');
        if (key && character.outfitId && !map.has(key)) {
          map.set(key, character.outfitId);
        }
      }
    }
  }

  return map;
}

function graphicNovelOutfitIdByCharacterRef(
  pages: PlannedGraphicNovelPage[],
  outfits: StoryOutfitRow[] = []
): Map<string, string> {
  const map = new Map<string, string>();
  for (const outfit of outfits) {
    const characterRef = normalizeCharacterRef(outfit.characterRef);
    if (characterRef && outfit.id && !map.has(characterRef)) map.set(characterRef, outfit.id);
  }
  for (const page of pages) {
    for (const panel of page.panels) {
      const composition = panel.script.visual.sceneVisual.cameraComposition;
      if (typeof composition === 'string') continue;
      for (const character of composition.characters || []) {
        const characterRef = normalizeCharacterRef(character.characterRef);
        if (characterRef && character.outfitId && !map.has(characterRef)) {
          map.set(characterRef, character.outfitId);
        }
      }
    }
  }
  return map;
}

export function augmentGraphicNovelPagesWithMentionedCharacters(params: {
  pages: PlannedGraphicNovelPage[];
  characters: GraphicNovelCharacterManifest;
  aliases: Record<string, string[]>;
  outfits?: StoryOutfitRow[];
}): PlannedGraphicNovelPage[] {
  const outfitIdByName = graphicNovelOutfitIdByCharacterName(params.pages, params.outfits);
  const outfitIdByRef = graphicNovelOutfitIdByCharacterRef(params.pages, params.outfits);

  return params.pages.map((page) => ({
    ...page,
    panels: page.panels.map((panel) => {
      const composition = panel.script.visual.sceneVisual.cameraComposition;
      if (typeof composition === 'string') return panel;

      const present = new Set(
        composition.characters.map((character) => normalizeCharacterName(character.name || ''))
      );
      const mentionText = panelVisualMentionText(panel);
      const additions: typeof composition.characters = [];

      for (const character of params.characters) {
        const characterKey = normalizeCharacterName(character.name || '');
        if (!characterKey || present.has(characterKey)) continue;

        const aliases = params.aliases[character.name] || [character.name];
        if (!aliases.some((alias) => visualAliasMatchesText(mentionText, alias))) continue;

        if (
          composition.characters.length + additions.length >=
          GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS
        ) {
          logger.warn(
            {
              pageNumber: page.pageNumber,
              panelId: panel.script.panelId,
              characterName: character.name,
            },
            'Detected mentioned graphic novel character but panel character cap is full'
          );
          continue;
        }

        present.add(characterKey);
        additions.push({
          characterRef: character.characterRef || character.id,
          name: character.name,
          position: 'center_midground',
          outfitId:
            outfitIdByRef.get(normalizeCharacterRef(character.characterRef || character.id)) ||
            outfitIdByName.get(characterKey),
          description:
            'visible as the named story subject of this panel action, with pose and gaze supporting the primary read',
        });
      }

      if (additions.length === 0) return panel;

      return {
        ...panel,
        script: {
          ...panel.script,
          visual: {
            ...panel.script.visual,
            sceneVisual: {
              ...panel.script.visual.sceneVisual,
              cameraComposition: {
                ...composition,
                characters: [...composition.characters, ...additions],
              },
            },
          },
        },
      };
    }),
  }));
}

function buildGraphicNovelExpectedCharactersForPanel(params: {
  panel: PlannedGraphicNovelPage['panels'][number];
  characters: GraphicNovelCharacterManifest;
  dressedTurnaroundValidationNames: Set<string>;
}): GraphicNovelExpectedValidationCharacter[] {
  const seen = new Set<string>();
  const expected: GraphicNovelExpectedValidationCharacter[] = [];

  const composition = params.panel.script.visual.sceneVisual.cameraComposition;
  const panelCharacters =
    composition && typeof composition !== 'string' ? composition.characters || [] : [];
  for (const panelCharacter of panelCharacters) {
    const name = panelCharacter.name;
    const normalized = normalizeCharacterName(name);
    const manifest =
      characterManifestForRef(params.characters, panelCharacter.characterRef) ||
      characterManifestForPageName(params.characters, name);
    const identityKey = normalizeCharacterRef(
      manifest?.characterRef || manifest?.id || panelCharacter.characterRef
    );
    const seenKey = identityKey ? `ref:${identityKey}` : `name:${normalized}`;
    if (!normalized || seen.has(seenKey)) continue;
    seen.add(seenKey);
    expected.push({
      name,
      ...(identityKey ? { characterRef: identityKey } : {}),
      characterKind: graphicNovelCharacterKind(manifest?.type),
      description: manifest?.description,
      validateOutfit: params.dressedTurnaroundValidationNames.has(normalized),
    });
  }

  return expected;
}

function buildGraphicNovelPanelValidationSceneVisual(params: {
  pageNumber: number;
  panelNumber: number;
  panel: PlannedGraphicNovelPage['panels'][number];
}): SceneVisual {
  const base = params.panel.script.visual.sceneVisual;
  return {
    setting: [
      `Graphic novel page ${params.pageNumber}, panel ${params.panelNumber}.`,
      `Expected visual focus: ${params.panel.script.visual.primaryRead}`,
      base.setting,
    ]
      .filter(Boolean)
      .join(' '),
    lighting: base.lighting || 'N/A',
    cameraComposition: base.cameraComposition,
  };
}

function panelVisualSummary(panel: GraphicNovelPanelScript): string {
  const composition = panel.visual.sceneVisual.cameraComposition;
  const shot = typeof composition === 'string' ? composition : composition.shot;
  return [
    `Primary read: ${panel.visual.primaryRead}`,
    `Environment: ${panel.visual.environmentId}`,
    `Setting delta: ${panel.visual.sceneVisual.setting}`,
    `Shot: ${shot}`,
    `Lighting: ${panel.visual.sceneVisual.lighting}`,
  ].join('. ');
}

function pageEnvironmentIds(page: PlannedGraphicNovelPage): string[] {
  return [
    ...new Set(page.panels.map((panel) => panel.script.visual.environmentId).filter(Boolean)),
  ];
}

function environmentMapForPage(
  page: PlannedGraphicNovelPage,
  environments: StoryEnvironment[]
): Map<string, StoryEnvironment> {
  const requestedIds = new Set(pageEnvironmentIds(page));
  return new Map(
    environments
      .filter((environment) => requestedIds.has(environment.id))
      .map((environment) => [environment.id, environment])
  );
}

async function ensureGraphicNovelEnvironmentImages(params: {
  storyId: string;
  storyRequestId?: string;
  userId: string;
  environments: StoryEnvironment[];
  scenarioCardId?: string;
  generationKind?: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND;
}): Promise<Array<{ environmentId: string; storagePath: string; mimeType: string }>> {
  const assetStorage = getAssetStorageService();
  const results: Array<{ environmentId: string; storagePath: string; mimeType: string }> = [];

  for (const environment of params.environments) {
    const startedAt = new Date();
    let image: Awaited<ReturnType<typeof getOrCreateEnvironmentImage>> | null = null;
    try {
      image = await getOrCreateEnvironmentImage({
        storyId: params.storyId,
        userId: params.userId,
        storyEnvironmentId: environment.id,
        environment,
        assetStorage,
        scenarioCardId: params.scenarioCardId,
      });
      await recordStageTiming({
        storyId: params.storyId,
        storyRequestId: params.storyRequestId,
        userId: params.userId,
        generationKind: params.generationKind ?? GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'asset_generation',
        operation: 'environment_image',
        targetType: 'environment',
        targetKey: environment.id,
        status: image ? 'completed' : 'skipped',
        startedAt,
        completedAt: new Date(),
        metadata: {
          source: 'graphic_novel_preload',
          environmentName: environment.name,
          scenarioCardId: params.scenarioCardId,
          hasImage: !!image,
        },
      });
    } catch (error) {
      await recordStageTiming({
        storyId: params.storyId,
        storyRequestId: params.storyRequestId,
        userId: params.userId,
        generationKind: params.generationKind ?? GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'asset_generation',
        operation: 'environment_image',
        targetType: 'environment',
        targetKey: environment.id,
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        metadata: {
          source: 'graphic_novel_preload',
          environmentName: environment.name,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
    if (image) {
      results.push({
        environmentId: environment.id,
        storagePath: image.storagePath,
        mimeType: image.mimeType,
      });
    }
  }

  return results;
}

async function buildPageEnvironmentReferenceImages(params: {
  storyId: string;
  storyRequestId?: string;
  userId: string;
  page: PlannedGraphicNovelPage;
  environments: StoryEnvironment[];
  generationKind?: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND;
}): Promise<GraphicNovelReferenceImage[]> {
  const pageEnvironmentMap = environmentMapForPage(params.page, params.environments);
  if (pageEnvironmentMap.size === 0) return [];

  const assetStorage = getAssetStorageService();
  const references: GraphicNovelReferenceImage[] = [];
  for (const environment of pageEnvironmentMap.values()) {
    const startedAt = new Date();
    let image: Awaited<ReturnType<typeof getOrCreateEnvironmentImage>> | null = null;
    try {
      image = await getOrCreateEnvironmentImage({
        storyId: params.storyId,
        userId: params.userId,
        storyEnvironmentId: environment.id,
        environment,
        assetStorage,
      });
      await recordStageTiming({
        storyId: params.storyId,
        storyRequestId: params.storyRequestId,
        userId: params.userId,
        generationKind: params.generationKind ?? GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'asset_generation',
        operation: 'environment_image',
        targetType: 'environment',
        targetKey: environment.id,
        pageNumber: params.page.pageNumber,
        status: image ? 'completed' : 'skipped',
        startedAt,
        completedAt: new Date(),
        metadata: {
          source: 'graphic_novel_page_reference',
          environmentName: environment.name,
          hasImage: !!image,
        },
      });
    } catch (error) {
      await recordStageTiming({
        storyId: params.storyId,
        storyRequestId: params.storyRequestId,
        userId: params.userId,
        generationKind: params.generationKind ?? GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'asset_generation',
        operation: 'environment_image',
        targetType: 'environment',
        targetKey: environment.id,
        pageNumber: params.page.pageNumber,
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        metadata: {
          source: 'graphic_novel_page_reference',
          environmentName: environment.name,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
    if (!image) continue;

    const reference: GraphicNovelReferenceImage = {
      base64Data: image.base64,
      mimeType: image.storagePath ? mimeTypeForStoragePath(image.storagePath) : image.mimeType,
      referenceKind: 'object',
      characterName: environment.name,
      source: 'environment',
      type: 'environment_reference',
      environmentId: environment.id,
      storagePath: image.storagePath,
    };
    references.push({
      ...reference,
      instructionText: buildGraphicNovelReferenceInstruction(reference),
    });
  }

  return references;
}

async function buildStoryArtifactReferenceImage(
  artifact: GraphicNovelStoryArtifactReference | null | undefined
): Promise<GraphicNovelReferenceImage | null> {
  if (!artifact) return null;
  const storagePath = artifact.storagePath ?? normalizeStoryArtifactImagePath(artifact.imagePath);
  if (!storagePath) return null;

  const imageData = await getAssetStorageService().getAssetByPath(storagePath);
  const reference: GraphicNovelReferenceImage = {
    base64Data: imageData.toString('base64'),
    mimeType: mimeTypeForStoragePath(storagePath),
    referenceKind: 'object',
    characterName: artifact.title,
    source: 'story_artifact',
    type: 'story_artifact_reference',
    storagePath,
    referenceBindingId: artifact.referenceBindingId,
  };
  return {
    ...reference,
    instructionText: buildGraphicNovelReferenceInstruction(reference),
  };
}

function pageCharacterNameKeys(page: PlannedGraphicNovelPage): Set<string> {
  const keys = new Set<string>();
  for (const panel of page.panels) {
    for (const name of panelCharacterNames(panel.script)) {
      const normalized = normalizeCharacterName(name);
      if (normalized) keys.add(normalized);
    }
  }
  return keys;
}

function pageCharacterRefKeys(page: PlannedGraphicNovelPage): Set<string> {
  const refs = new Set<string>();
  for (const panel of page.panels) {
    for (const characterRef of panelCharacterRefs(panel.script)) refs.add(characterRef);
  }
  return refs;
}

function characterManifestMatchesPage(
  character: GraphicNovelCharacterManifest[number],
  pageNames: Set<string>,
  pageRefs?: Set<string>,
  allCharacters: GraphicNovelCharacterManifest = [character]
): boolean {
  const characterRef = normalizeCharacterRef(character.characterRef || character.id);
  if (pageRefs?.size) return !!characterRef && pageRefs.has(characterRef);
  const names = [
    character.name,
    character.canonicalName,
    character.referenceBindingId,
    ...(character.nameAliases || []),
  ].filter((value): value is string => !!value);
  if (names.some((name) => pageNames.has(normalizeCharacterName(name)))) return true;

  if (!characterRef) return false;
  const registry = buildCharacterIdentityRegistry(
    allCharacters.flatMap((candidate) => {
      const id = normalizeCharacterRef(candidate.id || candidate.characterRef);
      return id
        ? [{ ...candidate, id, characterRef: candidate.characterRef || id }]
        : [];
    })
  );
  return [...pageNames].some(
    (pageName) => resolveCharacterRefByName(pageName, registry).characterRef === characterRef
  );
}

async function loadGraphicNovelReferenceImage(params: {
  ref: NonNullable<GraphicNovelCharacterManifest[number]['references']>[number];
  characterName: string;
  characterId?: string;
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  assetStorage: ReturnType<typeof getAssetStorageService>;
}): Promise<GraphicNovelReferenceImage | null> {
  try {
    const buffer = await params.assetStorage.getAssetByPath(params.ref.storagePath);
    if (!buffer) {
      logger.warn(
        { characterName: params.characterName, storagePath: params.ref.storagePath },
        'Graphic novel character reference asset not found'
      );
      return null;
    }

    const mimeType = mimeTypeForStoragePath(params.ref.storagePath);
    const uploaded =
      config.nanoBanana?.enableFilesApi === true
        ? await params.imageDomain.uploadReferenceFile(
            buffer,
            mimeType,
            `graphic_novel_reference_${params.characterName}`,
            params.ref.storagePath
          )
        : null;

    return {
      base64Data: uploaded ? undefined : buffer.toString('base64'),
      fileUri: uploaded?.uri,
      mimeType: uploaded?.mimeType || mimeType,
      characterName: params.characterName,
      characterId: params.characterId,
      referenceKind: 'character',
      source: params.ref.source,
      type: params.ref.type,
      isTurnaround: params.ref.isTurnaround,
      storagePath: params.ref.storagePath,
      referenceBindingId: params.ref.referenceBindingId,
    };
  } catch (error) {
    logger.warn(
      { err: error, characterName: params.characterName, storagePath: params.ref.storagePath },
      'Failed to load graphic novel character reference'
    );
    return null;
  }
}

async function buildPageCharacterReferenceImages(params: {
  page: PlannedGraphicNovelPage;
  characters: GraphicNovelCharacterManifest;
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  includeCharacterIds?: string[];
}): Promise<GraphicNovelReferenceImage[]> {
  const pageNames = pageCharacterNameKeys(params.page);
  const pageRefs = pageCharacterRefKeys(params.page);
  if (pageNames.size === 0 && pageRefs.size === 0) return [];

  const assetStorage = getAssetStorageService();
  const references: GraphicNovelReferenceImage[] = [];
  const seenStoragePaths = new Set<string>();
  const explicitlyIncludedIds = new Set(
    (params.includeCharacterIds || []).map(normalizeCharacterRef).filter(Boolean)
  );

  for (const character of params.characters) {
    const characterId = normalizeCharacterRef(character.id);
    if (
      !explicitlyIncludedIds.has(characterId) &&
      !characterManifestMatchesPage(character, pageNames, pageRefs, params.characters)
    ) {
      continue;
    }
    const firstReference = character.references?.find(
      (ref) => !seenStoragePaths.has(ref.storagePath)
    );
    if (!firstReference) continue;
    seenStoragePaths.add(firstReference.storagePath);
    const loaded = await loadGraphicNovelReferenceImage({
      ref: firstReference,
      characterName: character.name,
      characterId: character.id,
      imageDomain: params.imageDomain,
      assetStorage,
    });
    if (loaded) references.push(loaded);
  }

  return references;
}

function buildGraphicNovelCharacterDataMap(
  characters: GraphicNovelCharacterManifest
): Map<string, CharacterData> {
  const map = new Map<string, CharacterData>();
  for (const character of characters) {
    const names = [
      character.name,
      character.canonicalName,
      ...(character.nameAliases || []),
    ].filter((value): value is string => !!value);
    const data = {
      id: character.id,
      characterRef: character.characterRef || character.id,
      name: character.name,
      canonicalName: character.canonicalName,
      nameAliases: character.nameAliases,
      type: character.type,
      source: character.source,
      description: character.description,
      defaultOutfitText: character.defaultOutfitText ?? undefined,
      defaultOutfitEmbedding: character.defaultOutfitEmbedding ?? undefined,
    } as CharacterData;
    for (const name of names) {
      const key = normalizeCharacterName(name);
      if (key && !map.has(key)) map.set(key, data);
    }
  }
  return map;
}

function pageCharacterOutfitIds(page: PlannedGraphicNovelPage): Record<string, string> | undefined {
  const ids: Record<string, string> = {};
  for (const panel of page.panels) {
    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (!composition || typeof composition === 'string') continue;
    for (const character of composition.characters || []) {
      const name = typeof character.name === 'string' ? character.name.trim() : '';
      const outfitId = typeof character.outfitId === 'string' ? character.outfitId.trim() : '';
      if (!name || !outfitId || ids[name]) continue;
      ids[name] = outfitId;
    }
  }
  return Object.keys(ids).length > 0 ? ids : undefined;
}

function pageCharacterOutfitRefs(page: PlannedGraphicNovelPage): Record<string, string> | undefined {
  const ids: Record<string, string> = {};
  for (const panel of page.panels) {
    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (!composition || typeof composition === 'string') continue;
    for (const character of composition.characters || []) {
      const characterRef = normalizeCharacterRef(character.characterRef);
      const outfitId = typeof character.outfitId === 'string' ? character.outfitId.trim() : '';
      if (!characterRef || !outfitId || ids[characterRef]) continue;
      ids[characterRef] = outfitId;
    }
  }
  return Object.keys(ids).length > 0 ? ids : undefined;
}

/**
 * Preserve stable page character identity when the page-level outfit pipeline is adapted to a
 * scene. Localized display aliases can share one characterRef, so the first page row for that
 * identity is authoritative (the same ordering used by pageCharacterOutfitRefs).
 */
function pageDressedTurnaroundCompositionCharacters(
  page: PlannedGraphicNovelPage
): CameraCharacterComposition[] {
  const charactersByIdentity = new Map<string, CameraCharacterComposition>();
  for (const panel of page.panels) {
    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (!composition || typeof composition === 'string') continue;
    for (const character of composition.characters || []) {
      const characterRef = normalizeCharacterRef(character.characterRef);
      const nameKey = normalizeCharacterName(character.name || '');
      const identityKey = characterRef ? `ref:${characterRef}` : `name:${nameKey}`;
      if (!nameKey || charactersByIdentity.has(identityKey)) continue;
      charactersByIdentity.set(identityKey, {
        ...character,
        ...(characterRef ? { characterRef } : {}),
      });
    }
  }
  return [...charactersByIdentity.values()];
}

function graphicNovelReferenceToSceneReferenceData(
  ref: GraphicNovelReferenceImage
): SceneCharacterReferenceData {
  return {
    base64: ref.base64Data || '',
    mimeType: ref.mimeType || 'image/png',
    fileUri: ref.fileUri,
    source: ref.source,
    characterId: ref.characterId,
    type: ref.type,
    characterName: ref.characterName,
    url: ref.storagePath,
    referenceBindingId: ref.referenceBindingId,
    isTurnaround: ref.isTurnaround,
  } as SceneCharacterReferenceData;
}

function sceneDressedReferenceToGraphicNovelReference(
  ref: Awaited<ReturnType<typeof prepareSceneDressedTurnaroundReferences>>[number],
  referenceBindingId?: string
): GraphicNovelReferenceImage {
  return {
    base64Data: ref.fileUri ? undefined : ref.base64,
    fileUri: ref.fileUri,
    mimeType: ref.mimeType,
    characterName: ref.characterName,
    characterId: ref.characterId,
    referenceKind: 'character',
    source: ref.source,
    type: ref.type,
    isTurnaround: ref.isTurnaround,
    storagePath: ref.storagePath,
    outfitId: ref.outfitId,
    referenceBindingId: referenceBindingId ?? ref.referenceBindingId,
  };
}

async function buildPageDressedTurnaroundReferenceImages(params: {
  storyId: string;
  storyRequestId?: string;
  userId: string;
  generationKind?: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND;
  page: PlannedGraphicNovelPage;
  characters: GraphicNovelCharacterManifest;
  environmentsById: Map<string, StoryEnvironment>;
  characterReferences: GraphicNovelReferenceImage[];
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  style: string;
  ageGroup: string;
  scenarioCardId?: string;
}): Promise<GraphicNovelReferenceImage[]> {
  const [currentEnvironment] = params.environmentsById.values();
  if (!currentEnvironment) return [];
  const currentEnvironmentId = currentEnvironment.id;
  const characterOutfitIds = pageCharacterOutfitIds(params.page);
  const characterOutfitRefs = pageCharacterOutfitRefs(params.page);
  if ((!characterOutfitIds && !characterOutfitRefs) || !params.page.outfits?.length) return [];

  const dressedRefs = await prepareSceneDressedTurnaroundReferences({
    storyId: params.storyId,
    storyRequestId: params.storyRequestId,
    userId: params.userId,
    generationKind: params.generationKind,
    normalizedCharacters: Array.from(pageCharacterNameKeys(params.page)),
    characterDescriptionMap: buildGraphicNovelCharacterDataMap(params.characters),
    characterReferenceData: params.characterReferences.map(
      graphicNovelReferenceToSceneReferenceData
    ),
    scene: {
      sceneId: params.page.pageNumber,
      text: '',
      sceneVisual: {
        setting: `Graphic novel page ${params.page.pageNumber}`,
        lighting: 'N/A',
        cameraComposition: {
          shot: 'full comic page',
          characters: pageDressedTurnaroundCompositionCharacters(params.page),
        },
      },
      characterOutfitIds,
      characterOutfitRefs,
    },
    currentEnvironmentId,
    currentEnvironment,
    storyOutfits: params.page.outfits,
    imageStyle: params.style,
    ageGroup: params.ageGroup,
    scenarioCardId: params.scenarioCardId,
    assetStorage: getAssetStorageService(),
    imageDomain: params.imageDomain,
    outfitPlatePending: new Map(),
    dressedTurnaroundPending: new Map(),
  });

  return dressedRefs.map((ref) =>
    sceneDressedReferenceToGraphicNovelReference(
      ref,
      characterManifestForRef(params.characters, ref.characterId)?.referenceBindingId ||
        characterReferenceBindingIdForPageName(params.characters, ref.characterName)
    )
  );
}

function characterManifestForPageName(
  characters: GraphicNovelCharacterManifest,
  pageName: string
): GraphicNovelCharacterManifest[number] | undefined {
  const pageNameKey = normalizeCharacterName(pageName);
  const exact = characters.find((character) => {
    const names = [
      character.name,
      character.canonicalName,
      character.referenceBindingId,
      ...(character.nameAliases || []),
    ].filter((value): value is string => !!value);
    return names.some((name) => normalizeCharacterName(name) === pageNameKey);
  });
  const registry = buildCharacterIdentityRegistry(
    characters.flatMap((character) => {
      const id = normalizeCharacterRef(character.id || character.characterRef);
      return id
        ? [{ ...character, id, characterRef: character.characterRef || id }]
        : [];
    })
  );
  const relationshipRef = resolveRelationshipCharacterRefByName(
    pageName,
    registry
  ).characterRef;
  const relationshipCharacter = relationshipRef
    ? characterManifestForRef(characters, relationshipRef)
    : undefined;
  if (
    exact?.source !== 'user_provided' &&
    relationshipCharacter &&
    normalizeCharacterRef(relationshipCharacter.characterRef || relationshipCharacter.id) !==
      normalizeCharacterRef(exact?.characterRef || exact?.id)
  ) {
    return relationshipCharacter;
  }
  if (exact) return exact;

  const resolvedRef = resolveCharacterRefByName(pageName, registry).characterRef;
  return relationshipCharacter ||
    (resolvedRef ? characterManifestForRef(characters, resolvedRef) : undefined);
}

function characterManifestForRef(
  characters: GraphicNovelCharacterManifest,
  characterRef: unknown
): GraphicNovelCharacterManifest[number] | undefined {
  const ref = normalizeCharacterRef(characterRef);
  if (!ref) return undefined;
  return characters.find(
    (character) => normalizeCharacterRef(character.characterRef || character.id) === ref
  );
}

/**
 * Upgrade saved pre-characterRef layouts in memory before rendering or repair.
 * Localized/title aliases that resolve to the same manifest identity collapse to one camera row.
 */
function bindLegacyPlannedPageCharacterIdentity(
  page: PlannedGraphicNovelPage,
  characters: GraphicNovelCharacterManifest
): PlannedGraphicNovelPage {
  const resolve = (characterRef: unknown, displayName: unknown) => {
    const byRef = characterManifestForRef(characters, characterRef);
    if (typeof displayName !== 'string') return byRef;
    const byName = characterManifestForPageName(characters, displayName);
    if (
      relationshipBaseCharacterNameKey(displayName) &&
      byName &&
      normalizeCharacterRef(byName.characterRef || byName.id) !==
        normalizeCharacterRef(byRef?.characterRef || byRef?.id)
    ) {
      return byName;
    }
    return byRef || byName;
  };

  for (const outfit of page.outfits || []) {
    const character = resolve(outfit.characterRef, outfit.characterName);
    const characterRef = normalizeCharacterRef(character?.characterRef || character?.id);
    if (characterRef) outfit.characterRef = characterRef;
  }

  for (const panel of page.panels) {
    for (const line of [
      ...(panel.script.dialogue || []),
      ...(panel.script.thoughts || []),
    ]) {
      const character = resolve(line.characterRef, line.speaker);
      const characterRef = normalizeCharacterRef(character?.characterRef || character?.id);
      if (characterRef) line.characterRef = characterRef;
    }

    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (!composition || typeof composition === 'string') continue;
    const seenIdentities = new Set<string>();
    composition.characters = composition.characters.filter((row) => {
      const character = resolve(row.characterRef, row.name);
      const characterRef = normalizeCharacterRef(character?.characterRef || character?.id);
      const identityKey = characterRef
        ? `ref:${characterRef}`
        : `name:${normalizeCharacterName(row.name)}`;
      if (characterRef) row.characterRef = characterRef;
      if (seenIdentities.has(identityKey)) return false;
      seenIdentities.add(identityKey);
      return true;
    });
  }

  return page;
}

function characterReferenceBindingIdForPageName(
  characters: GraphicNovelCharacterManifest,
  pageName: string
): string | undefined {
  return characterManifestForPageName(characters, pageName)?.referenceBindingId;
}

function buildGraphicNovelReferenceInstruction(
  reference: GraphicNovelReferenceImage,
  imageIndex?: number
): string {
  void imageIndex;
  const id = reference.referenceBindingId || referenceBindingIdFor(reference);
  const source = String(reference.source || '');
  const type = String(reference.type || '');
  if (source === 'story_artifact' || type === 'story_artifact_reference') {
    const name = reference.characterName ? ` "${reference.characterName}"` : '';
    return `The next image is ${id}: object reference for the story keepsake${name}. Use only when panel content names ${id}; preserve this exact object identity instead of a generic gift, tool, or instrument.`;
  }
  const label =
    source === 'environment' || type === 'environment_reference'
      ? 'an environment reference'
      : source === 'character_outfit_turnaround' || type === 'dressed_turnaround_reference'
        ? 'a dressed character turnaround reference'
        : reference.referenceKind === 'character' && reference.isTurnaround
          ? 'a character identity turnaround reference'
          : reference.referenceKind === 'character'
            ? 'a character identity reference'
            : 'an object reference';
  return `The next image is ${id}: ${label}.`;
}

function prepareGraphicNovelPageReferences(params: {
  storyId: string;
  pageNumber: number;
  environmentReferences: GraphicNovelReferenceImage[];
  characterReferences: GraphicNovelReferenceImage[];
  objectReferences?: GraphicNovelReferenceImage[];
}): GraphicNovelReferenceImage[] {
  const bucketInput: ReferenceImageDataEntry[] = [
    ...params.environmentReferences.map((ref) => ({
      base64: ref.base64Data || '',
      mimeType: ref.mimeType || 'image/png',
      fileUri: ref.fileUri,
      source: 'environment',
      type: 'environment_reference',
      characterName: ref.characterName,
      referenceKind: 'object' as const,
      referenceEnvironmentId: ref.environmentId,
      storagePath: ref.storagePath,
    })),
    ...params.characterReferences.map((ref) => ({
      base64: ref.base64Data || '',
      mimeType: ref.mimeType || 'image/png',
      fileUri: ref.fileUri,
      source: ref.source,
      type: ref.type,
      characterName: ref.characterName,
      referenceKind: 'character' as const,
      isTurnaround: ref.isTurnaround,
      storagePath: ref.storagePath,
      characterId: ref.characterId,
      outfitId: ref.outfitId,
      referenceBindingId: ref.referenceBindingId,
    })),
    ...(params.objectReferences || []).map((ref) => ({
      base64: ref.base64Data || '',
      mimeType: ref.mimeType || 'image/png',
      fileUri: ref.fileUri,
      source: ref.source,
      type: ref.type,
      characterName: ref.characterName,
      referenceKind: 'object' as const,
      storagePath: ref.storagePath,
      referenceBindingId: ref.referenceBindingId,
    })),
  ];

  const bucketResult = applyReferenceBucketLimits(
    bucketInput,
    config.image.maxCharacterReferenceImages,
    config.image.maxObjectReferenceImages
  );
  assignSequentialImageIndices(bucketResult.trimmed);
  logReferenceBucketDelivery({
    storyId: params.storyId,
    sceneId: params.pageNumber,
    characterCount: bucketResult.characterCount,
    objectCount: bucketResult.objectCount,
    droppedCharacterCount: bucketResult.droppedCharacterCount,
    droppedObjectCount: bucketResult.droppedObjectCount,
    totalAfterTrim: bucketResult.trimmed.length,
  });

  const byIdentity = new Map<string, GraphicNovelReferenceImage>();
  for (const ref of [
    ...params.environmentReferences,
    ...params.characterReferences,
    ...(params.objectReferences || []),
  ]) {
    const key = [
      ref.referenceKind,
      ref.source,
      ref.type,
      ref.characterName,
      ref.fileUri,
      ref.base64Data?.slice(0, 16),
    ].join('|');
    byIdentity.set(key, ref);
  }

  return bucketResult.trimmed.map((bucketRef) => {
    const key = [
      bucketRef.referenceKind,
      bucketRef.source,
      bucketRef.type,
      bucketRef.characterName,
      bucketRef.fileUri,
      bucketRef.base64?.slice(0, 16),
    ].join('|');
    const source = byIdentity.get(key);
    const reference: GraphicNovelReferenceImage = {
      ...(source || {}),
      base64Data: source?.base64Data || bucketRef.base64 || undefined,
      fileUri: source?.fileUri || bucketRef.fileUri,
      mimeType: source?.mimeType || bucketRef.mimeType,
      characterName: source?.characterName || bucketRef.characterName,
      referenceKind: source?.referenceKind || bucketRef.referenceKind,
      source: source?.source || bucketRef.source,
      type: source?.type || bucketRef.type,
      isTurnaround: source?.isTurnaround || bucketRef.isTurnaround,
      environmentId: source?.environmentId || bucketRef.referenceEnvironmentId,
      storagePath: source?.storagePath || bucketRef.storagePath,
      characterId: source?.characterId || bucketRef.characterId,
      outfitId: source?.outfitId || bucketRef.outfitId,
      imageIndex: bucketRef.imageIndex,
      referenceBindingId: source?.referenceBindingId || bucketRef.referenceBindingId,
    };
    return {
      ...reference,
      instructionText: buildGraphicNovelReferenceInstruction(reference, bucketRef.imageIndex || 1),
    };
  });
}

function summarizeGraphicNovelValidationAttempt(
  result: GraphicNovelRenderedPageValidation | null
): Record<string, unknown> | null {
  if (!result) return null;
  return {
    attempt: result.attempt,
    score: result.score,
    validationStatus: result.validation.validationStatus ?? 'completed',
    validationAttemptKind: result.validation.validationAttemptKind ?? null,
    validationModelUsed: result.validation.validationModelUsed ?? null,
    hasArtworkOutsidePanelBounds: result.validation.hasArtworkOutsidePanelBounds ?? false,
    hasArtworkOverSpeechBubbles: result.validation.hasArtworkOverSpeechBubbles ?? false,
    hasExtraPanelStructure: result.validation.hasExtraPanelStructure ?? false,
    layoutFeedback: result.validation.layoutFeedback ?? null,
    overallFeedback: result.validation.overallFeedback,
    panelValidationCount: result.panelValidations?.length ?? 0,
    panelRepair: result.panelRepairSummary ?? null,
  };
}

function buildGraphicNovelPanelCompositeValidation(params: {
  page: PlannedGraphicNovelPage;
  attempt: number;
  detectedPanels: GraphicNovelDetectedPanelBounds[];
  detectionFeedback: string;
  hasStructureIssue: boolean;
  panelValidations: GraphicNovelPanelRenderedValidation[];
}): ImageValidationResult {
  const characters = params.panelValidations.flatMap((panelValidation) =>
    panelValidation.validation.characters.map((character) => ({
      ...character,
      panelNumber: panelValidation.panelNumber,
      panelId: panelValidation.panelId,
    }))
  );
  const blockedPanels = params.panelValidations.filter(
    (panelValidation) => panelValidation.validation.validationStatus === 'provider_blocked'
  );
  const overallParts = [
    `Panel geometry: ${params.detectionFeedback}.`,
    ...params.panelValidations.map((panelValidation) => {
      const score =
        panelValidation.score == null ? 'n/a' : Math.round(panelValidation.score * 10) / 10;
      return `Panel ${panelValidation.panelNumber}: score ${score}; ${panelValidation.validation.overallFeedback}`;
    }),
  ];

  return {
    validationStatus:
      blockedPanels.length > 0 && blockedPanels.length === params.panelValidations.length
        ? 'provider_blocked'
        : 'completed',
    validationAttemptKind: 'graphic_novel_detected_panel_crops',
    validationModelUsed:
      params.panelValidations.find(
        (panelValidation) => panelValidation.validation.validationModelUsed
      )?.validation.validationModelUsed ??
      config.ai.validationModel ??
      config.ai.geminiVisionModel,
    providerError:
      blockedPanels.length > 0 && blockedPanels.length === params.panelValidations.length
        ? blockedPanels
            .map((panelValidation) => panelValidation.validation.providerError)
            .filter(Boolean)
            .join('; ') || 'all panel validations provider-blocked'
        : undefined,
    requestManifest: {
      version: 1,
      validationSystemInstruction: 'graphic_novel_detected_panel_crop_validation_v1',
      operation: 'image_validation_graphic_novel_detected_panel_crops',
      mode: 'detected_panel_bounds_plus_segmented_panel_crops',
      pageNumber: params.page.pageNumber,
      attempt: params.attempt,
      expectedPanelCount: params.page.panels.length,
      detectedPanelCount: params.detectedPanels.length,
      hasStructureIssue: params.hasStructureIssue,
      detectionFeedback: params.detectionFeedback,
      panels: params.panelValidations.map((panelValidation) => ({
        panelNumber: panelValidation.panelNumber,
        panelId: panelValidation.panelId,
        cropRect: panelValidation.cropRect,
        normalizedRect: panelValidation.normalizedRect,
        expectedCharacters: panelValidation.expectedCharacters.map((character) => ({
          name: character.name,
          characterKind: character.characterKind,
          validateOutfit: character.validateOutfit,
        })),
        validationScore: panelValidation.score,
        validationStatus: panelValidation.validation.validationStatus ?? 'completed',
        attempt: panelValidation.attempt,
        repairMode: panelValidation.repairMode ?? 'original',
        characterCount: panelValidation.validation.characterCount,
        expectedCharacterCount: panelValidation.validation.expectedCharacterCount,
      })),
    },
    characterCount: params.panelValidations.reduce(
      (sum, panelValidation) => sum + panelValidation.validation.characterCount,
      0
    ),
    expectedCharacterCount: params.panelValidations.reduce(
      (sum, panelValidation) => sum + panelValidation.validation.expectedCharacterCount,
      0
    ),
    characters,
    hasUnexpectedCharacters: params.panelValidations.some(
      (panelValidation) => panelValidation.validation.hasUnexpectedCharacters
    ),
    hasTextOrLetters: params.panelValidations.some(
      (panelValidation) => panelValidation.validation.hasTextOrLetters
    ),
    hasRenderingArtifacts: params.panelValidations.some(
      (panelValidation) => panelValidation.validation.hasRenderingArtifacts
    ),
    hasArtworkOutsidePanelBounds: false,
    hasArtworkOverSpeechBubbles: false,
    hasExtraPanelStructure: params.hasStructureIssue,
    layoutFeedback: params.detectionFeedback,
    overallFeedback: overallParts.join(' '),
  };
}

function textOverlayFromPageRow(page: {
  bubbleLayoutJson: unknown;
  layoutJson: unknown;
}): GraphicNovelPageTextOverlay | null {
  const bubbleLayout = page.bubbleLayoutJson as {
    textOverlay?: GraphicNovelPageTextOverlay;
  } | null;
  if (bubbleLayout?.textOverlay) {
    return bubbleLayout.textOverlay;
  }

  const plannedPage = page.layoutJson as PlannedGraphicNovelPage | null;
  if (plannedPage?.panels) {
    return buildGraphicNovelPageTextOverlay(plannedPage, {
      textTransform: stripCharacterIds,
      displayTextTransform: stripAllTags,
      audioTextTransform: stripForAudio,
    });
  }

  return null;
}

function buildGraphicNovelBubbleLayoutJson(
  page: PlannedGraphicNovelPage,
  placementMode: 'script_initial' | 'post_art_vision' | 'script_fallback' = 'post_art_vision'
): Record<string, unknown> {
  return {
    mode: 'html_overlay',
    placementMode,
    panels: page.panels.map((panel) => ({
      panelId: panel.script.panelId,
      bubbles: panel.bubbles,
    })),
    textOverlay: buildGraphicNovelPageTextOverlay(page, {
      textTransform: stripCharacterIds,
      displayTextTransform: stripAllTags,
      audioTextTransform: stripForAudio,
    }),
  };
}

async function normalizeGraphicNovelPageImageForCanvas(
  imageData: Buffer,
  page: PlannedGraphicNovelPage
): Promise<Buffer> {
  const pageSize = pageSizeForGraphicNovelPage(page);
  const metadata = await sharp(imageData).metadata();
  if (
    metadata.width === pageSize.width &&
    metadata.height === pageSize.height &&
    metadata.format === 'png'
  ) {
    return imageData;
  }

  return sharp(imageData)
    .rotate()
    .resize(pageSize.width, pageSize.height, { fit: 'fill' })
    .png()
    .toBuffer();
}

function pixelCropRectFromNormalizedRect(
  rect: Rect,
  imageWidth: number,
  imageHeight: number
): PixelCropRect {
  const left = clampNumber(Math.round(rect.x * imageWidth), 0, imageWidth - 1);
  const top = clampNumber(Math.round(rect.y * imageHeight), 0, imageHeight - 1);
  const right = clampNumber(Math.round((rect.x + rect.width) * imageWidth), left + 1, imageWidth);
  const bottom = clampNumber(
    Math.round((rect.y + rect.height) * imageHeight),
    top + 1,
    imageHeight
  );
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

async function buildTemplateGraphicNovelPanelBounds(params: {
  page: PlannedGraphicNovelPage;
  imageData: Buffer;
}): Promise<{
  panels: GraphicNovelDetectedPanelBounds[];
  hasStructureIssue: boolean;
  feedback: string;
}> {
  const metadata = await sharp(params.imageData).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) {
    throw new Error('Cannot build template panel bounds without image dimensions');
  }

  const panels = params.page.panels.map((plannedPanel, index) => {
    const normalizedRect = clampRectToUnit(plannedPanel.templatePanel.rect) ?? {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    };
    const physicalCropRect = pixelCropRectFromNormalizedRect(normalizedRect, width, height);
    return {
      panelNumber: index + 1,
      panelId: plannedPanel.script.panelId,
      cropRect: physicalCropRect,
      normalizedRect,
      matchConfidence: 1,
      matchReason: 'template_panel_rect',
    };
  });

  return {
    panels,
    hasStructureIssue: false,
    feedback: `used ${panels.length} deterministic template panel rectangles`,
  };
}

function aspectRatioForCropRect(cropRect: PixelCropRect): GenerateImageRequest['aspectRatio'] {
  const ratio = cropRect.width / Math.max(1, cropRect.height);
  const candidates: Array<{
    value: NonNullable<GenerateImageRequest['aspectRatio']>;
    ratio: number;
  }> = [
    { value: '1:1', ratio: 1 },
    { value: '16:9', ratio: 16 / 9 },
    { value: '9:16', ratio: 9 / 16 },
    { value: '4:3', ratio: 4 / 3 },
    { value: '3:4', ratio: 3 / 4 },
    { value: '3:2', ratio: 3 / 2 },
    { value: '2:3', ratio: 2 / 3 },
    { value: '5:4', ratio: 5 / 4 },
    { value: '4:5', ratio: 4 / 5 },
    { value: '21:9', ratio: 21 / 9 },
  ];
  return candidates.reduce((best, candidate) =>
    Math.abs(Math.log(candidate.ratio / ratio)) < Math.abs(Math.log(best.ratio / ratio))
      ? candidate
      : best
  ).value;
}

async function normalizePanelCropForPaste(
  imageData: Buffer,
  cropRect: PixelCropRect
): Promise<Buffer> {
  return normalizeGraphicNovelPanelArtForTemplate(imageData, {
    width: cropRect.width,
    height: cropRect.height,
  });
}

function graphicNovelPanelSceneData(params: {
  page: PlannedGraphicNovelPage;
  panelNumber: number;
  panel: PlannedGraphicNovelPage['panels'][number];
  sceneVisual: SceneVisual;
}): SceneData {
  return {
    sceneId: params.page.pageNumber * 100 + params.panelNumber,
    text: `Graphic novel page ${params.page.pageNumber}, panel ${params.panelNumber}`,
    primaryRead: params.panel.script.visual.primaryRead,
    sceneVisual: params.sceneVisual,
    visualPrompt: params.panel.script.visual.primaryRead,
  };
}

async function validateGraphicNovelPanelCrop(params: {
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  panelImage: Buffer;
  page: PlannedGraphicNovelPage;
  detectedPanel: GraphicNovelDetectedPanelBounds;
  panel: PlannedGraphicNovelPage['panels'][number];
  characters: GraphicNovelCharacterManifest;
  validationReferenceImages: GraphicNovelPanelValidationReferenceImage[];
  validationRefNamesNormalized: Set<string>;
  dressedTurnaroundValidationNames: Set<string>;
  userId: string;
  storyId: string;
  attempt: number;
  repairMode: GraphicNovelPanelRenderedValidation['repairMode'];
  requestManifest?: Record<string, unknown>;
}): Promise<GraphicNovelPanelRenderedValidation> {
  const expectedCharacters = buildGraphicNovelExpectedCharactersForPanel({
    panel: params.panel,
    characters: params.characters,
    dressedTurnaroundValidationNames: params.dressedTurnaroundValidationNames,
  });
  const panelValidationReferenceImages = selectGraphicNovelPanelValidationReferences({
    validationReferenceImages: params.validationReferenceImages,
    expectedCharacters,
    characters: params.characters,
  });
  const panelValidationRefNamesNormalized = new Set(
    panelValidationReferenceImages.map((ref) => normalizeCharacterName(ref.characterName))
  );
  const panelDressedTurnaroundValidationNames = new Set(
    panelValidationReferenceImages
      .filter((ref) => ref.identitySource === 'dressed_turnaround')
      .map((ref) => normalizeCharacterName(ref.characterName))
  );
  for (const expected of expectedCharacters) {
    expected.validateOutfit = panelDressedTurnaroundValidationNames.has(
      normalizeCharacterName(expected.name)
    );
  }
  const sceneVisual = buildGraphicNovelPanelValidationSceneVisual({
    pageNumber: params.page.pageNumber,
    panelNumber: params.detectedPanel.panelNumber,
    panel: params.panel,
  });
  const validation = await params.imageDomain.validateGeneratedImageSegmented({
    imageData: params.panelImage,
    mimeType: 'image/png',
    expectedCharacters,
    sceneVisual,
    referenceImages:
      panelValidationReferenceImages.length > 0 ? panelValidationReferenceImages : undefined,
    logContext: {
      storyId: params.storyId,
      sceneId: params.page.pageNumber,
      attempt: params.attempt,
    },
    includeLayoutChecks: false,
    includeBubbleChecks: false,
    includeWardrobeChecks: panelDressedTurnaroundValidationNames.size > 0,
    onUsage: (usage) =>
      recordUsage(usage, {
        userId: params.userId,
        storyId: params.storyId,
        metadata: {
          usageTarget: 'image_validation',
          subjectType: 'graphic_novel_panel',
          sceneIndex: params.page.pageNumber,
          pageNumber: params.page.pageNumber,
          panelIndex: params.detectedPanel.panelNumber,
          panelId: params.detectedPanel.panelId,
          attempt: params.attempt,
          repairMode: params.repairMode,
        },
      }),
  });
  if (params.requestManifest) {
    const panelImageRequestManifest = {
      ...params.requestManifest,
      repairMode: params.repairMode ?? 'original',
    };
    validation.requestManifest = {
      ...(validation.requestManifest ?? {}),
      panelImageRequestManifest,
      ...(params.repairMode && params.repairMode !== 'original'
        ? { panelRepairRequestManifest: panelImageRequestManifest }
        : {}),
    };
  }
  const score =
    validation.validationStatus === 'provider_blocked'
      ? null
      : computeValidationScore(validation, {
          referenceNamesNormalized: panelValidationRefNamesNormalized,
          expectedCharacters,
          sceneVisual,
          validationReferenceImages:
            panelValidationReferenceImages.length > 0
              ? panelValidationReferenceImages
              : undefined,
        });

  return {
    panelNumber: params.detectedPanel.panelNumber,
    panelId: params.detectedPanel.panelId,
    cropRect: params.detectedPanel.cropRect,
    normalizedRect: params.detectedPanel.normalizedRect,
    expectedCharacters,
    validation,
    score,
    imageData: params.panelImage,
    mimeType: 'image/png',
    attempt: params.attempt,
    repairMode: params.repairMode,
    requestManifest: params.requestManifest,
  };
}

function shouldRetryGraphicNovelPanelValidation(
  validation: GraphicNovelPanelRenderedValidation
): boolean {
  if (validation.validation.validationStatus === 'provider_blocked') return false;
  return !graphicNovelPanelQualityDecision(validation).accepted;
}

function graphicNovelPanelQualityDecision(
  panelValidation: GraphicNovelPanelRenderedValidation
): GraphicNovelPanelQualityDecision {
  const { validation, expectedCharacters, score } = panelValidation;
  const reasons = new Set<string>();

  if (validation.validationStatus === 'provider_blocked') {
    reasons.add('provider_blocked');
  }
  if (score == null) {
    reasons.add('score_unavailable');
  } else if (score <= config.image.validationMinAcceptScore) {
    reasons.add('score_below_threshold');
  }
  if (validation.characterCount !== validation.expectedCharacterCount) {
    reasons.add('character_count_mismatch');
  }
  if (validation.hasUnexpectedCharacters) reasons.add('unexpected_characters');
  if (validation.hasTextOrLetters) reasons.add('unwanted_text');
  if (validation.hasRenderingArtifacts) reasons.add('rendering_artifacts');

  for (const character of validation.characters) {
    const normalizedCharacterName = normalizeCharacterName(character.name);
    const expected = expectedCharacters.find(
      (candidate) => normalizeCharacterName(candidate.name) === normalizedCharacterName
    );
    const characterKey = stripCharacterIdFromName(character.name).trim() || character.name;
    if (!character.found) reasons.add(`missing_character:${characterKey}`);
    if (character.duplicated) reasons.add(`duplicated_character:${characterKey}`);
    if (character.matchesColors === false) reasons.add(`color_mismatch:${characterKey}`);
    if (expected?.validateOutfit === true && character.matchesOutfit === false) {
      reasons.add(`outfit_mismatch:${characterKey}`);
    }
    if (character.faceMatchesReference === false) {
      reasons.add(`face_identity_mismatch:${characterKey}`);
    }
    if (character.hairMatchesReference === false) {
      reasons.add(`hair_identity_mismatch:${characterKey}`);
    }
    if (character.ageReadMatchesReference === false) {
      reasons.add(`age_read_mismatch:${characterKey}`);
    }
    if (character.proportionsMatchReference === false) {
      reasons.add(`proportions_mismatch:${characterKey}`);
    }
    if (character.sameOverallDesignRead === false) {
      reasons.add(`design_mismatch:${characterKey}`);
    }
    if (
      character.silhouetteDriftSeverity === 'moderate' ||
      character.silhouetteDriftSeverity === 'severe'
    ) {
      reasons.add(`silhouette_drift:${characterKey}`);
    }
  }

  const failureReasons = Array.from(reasons);
  return {
    accepted: failureReasons.length === 0,
    failureReasons,
  };
}

function shouldRegenerateGraphicNovelPanel(
  validation: GraphicNovelPanelRenderedValidation
): boolean {
  if (validation.score == null) return false;
  if (validation.score <= 0) return true;
  if (validation.expectedCharacters.length === 0) return false;
  return validation.validation.characters.every((character) => !character.found);
}

function graphicNovelPanelReferenceImagesForRepair(
  referenceImages: GraphicNovelReferenceImage[],
  expectedCharacters: GraphicNovelExpectedValidationCharacter[],
  panel?: PlannedGraphicNovelPage['panels'][number],
  storyArtifactReference?: GraphicNovelStoryArtifactReference | null,
  characters?: GraphicNovelCharacterManifest
): GraphicNovelReferenceImage[] {
  return referenceImages.filter((ref) => {
    if (ref.referenceKind === 'object') {
      const isStoryArtifact =
        ref.source === 'story_artifact' || ref.type === 'story_artifact_reference';
      if (isStoryArtifact && panel && storyArtifactReference) {
        return graphicNovelPanelNeedsStoryArtifactReference(panel, storyArtifactReference);
      }
      return true;
    }
    if (!ref.characterName) return false;
    return expectedCharacters.some((character) =>
      graphicNovelReferenceMatchesExpectedCharacter(ref, character, characters)
    );
  });
}

function graphicNovelCharacterNameVariants(
  character: GraphicNovelCharacterManifest[number] | undefined,
  fallbackName?: string | null
): string[] {
  return [
    fallbackName || undefined,
    character?.id,
    character?.name,
    character?.canonicalName,
    character?.referenceBindingId,
    ...(character?.nameAliases || []),
  ].filter((value): value is string => !!value);
}

function graphicNovelReferenceMatchesExpectedCharacter(
  ref: GraphicNovelReferenceImage,
  expected: GraphicNovelExpectedValidationCharacter,
  characters?: GraphicNovelCharacterManifest
): boolean {
  const expectedManifest = characters
    ? characterManifestForRef(characters, expected.characterRef) ||
      characterManifestForPageName(characters, expected.name)
    : undefined;
  const refManifest =
    characters
      ? characterManifestForRef(characters, ref.characterId) ||
        (ref.characterName
          ? characterManifestForPageName(characters, ref.characterName)
          : undefined)
      : undefined;

  const expectedRef = normalizeCharacterRef(
    expected.characterRef || expectedManifest?.characterRef || expectedManifest?.id
  );
  const referenceRef = normalizeCharacterRef(
    ref.characterId || refManifest?.characterRef || refManifest?.id
  );
  if (expectedRef && referenceRef) {
    return expectedRef === referenceRef;
  }

  const expectedNames = new Set(
    graphicNovelCharacterNameVariants(expectedManifest, expected.name)
      .map(normalizeCharacterName)
      .filter(Boolean)
  );
  const refNames = graphicNovelCharacterNameVariants(refManifest, ref.characterName)
    .concat(ref.referenceBindingId ? [ref.referenceBindingId] : [])
    .map(normalizeCharacterName)
    .filter(Boolean);

  return refNames.some((name) => expectedNames.has(name));
}

function selectGraphicNovelPanelValidationReferences(params: {
  validationReferenceImages: GraphicNovelPanelValidationReferenceImage[];
  expectedCharacters: GraphicNovelExpectedValidationCharacter[];
  characters: GraphicNovelCharacterManifest;
}): GraphicNovelPanelValidationReferenceImage[] {
  return params.expectedCharacters.flatMap((expected) => {
    const reference = params.validationReferenceImages.find((candidate) =>
      graphicNovelReferenceMatchesExpectedCharacter(
        {
          characterName: candidate.characterName,
          characterId: candidate.characterId,
          referenceKind: 'character',
        },
        expected,
        params.characters
      )
    );
    return reference ? [{ ...reference, characterName: expected.name }] : [];
  });
}

export function selectGraphicNovelPanelReferenceImagesForGeneration(params: {
  storyId: string;
  pageNumber: number;
  environmentReferences: GraphicNovelReferenceImage[];
  characterReferences: GraphicNovelReferenceImage[];
  objectReferences?: GraphicNovelReferenceImage[];
  expectedCharacters: GraphicNovelExpectedValidationCharacter[];
  panel?: PlannedGraphicNovelPage['panels'][number];
  storyArtifactReference?: GraphicNovelStoryArtifactReference | null;
  characters?: GraphicNovelCharacterManifest;
}): GraphicNovelReferenceImage[] {
  const characterReferences = graphicNovelPanelReferenceImagesForRepair(
    params.characterReferences,
    params.expectedCharacters,
    params.panel,
    params.storyArtifactReference,
    params.characters
  );
  const objectReferences = (params.objectReferences || []).filter((ref) => {
    const isStoryArtifact =
      ref.source === 'story_artifact' || ref.type === 'story_artifact_reference';
    if (!isStoryArtifact || !params.panel || !params.storyArtifactReference) return true;
    return graphicNovelPanelNeedsStoryArtifactReference(
      params.panel,
      params.storyArtifactReference
    );
  });

  return prepareGraphicNovelPageReferences({
    storyId: params.storyId,
    pageNumber: params.pageNumber,
    environmentReferences: params.environmentReferences,
    characterReferences,
    objectReferences,
  });
}

function editableGraphicNovelReferences(
  referenceImages: GraphicNovelReferenceImage[]
): Array<GraphicNovelReferenceImage & { instructionText: string }> {
  return referenceImages.map((ref) => ({
    ...ref,
    instructionText:
      ref.instructionText ||
      `${ref.referenceBindingId || ref.characterName || ref.environmentId || 'REF'}: reference`,
  }));
}

async function generateGraphicNovelPanelCrop(params: {
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  page: PlannedGraphicNovelPage;
  panelIndex: number;
  cropRect: PixelCropRect;
  style: string;
  ageGroup: string;
  scenarioCardId?: string;
  environmentsById: Map<string, StoryEnvironment>;
  referenceImages: GraphicNovelReferenceImage[];
  storyArtifactReference?: GraphicNovelStoryArtifactReference | null;
  userId: string;
  storyId: string;
  operation?: string;
  imageSize?: GenerateImageRequest['imageSize'];
}): Promise<{
  imageData: Buffer;
  mimeType: string;
  providerInteractionId?: string;
  requestManifest?: Record<string, unknown>;
}> {
  const prompt = buildGraphicNovelPanelCropInstructions(
    params.page,
    params.panelIndex,
    params.environmentsById,
    params.referenceImages,
    {
      style: params.style,
      ageGroup: params.ageGroup,
      scenarioCardId: params.scenarioCardId,
    }
  );
  const systemInstruction = buildGraphicNovelPanelCropSystemInstruction({
    style: params.style,
    ageGroup: params.ageGroup,
    scenarioCardId: params.scenarioCardId,
    referenceImages: params.referenceImages,
  });
  const aspectRatio = aspectRatioForCropRect(params.cropRect);
  const operation = params.operation ?? 'graphic_novel_panel_crop_validation_regenerate';
  const generated = await params.imageDomain.generateImageWithInstructions({
    prompt,
    aspectRatio,
    imageSize: params.imageSize,
    referenceImages: params.referenceImages,
    personGeneration: 'allow_all',
    systemInstruction,
    onUsage: (usage) => recordUsage(usage, { userId: params.userId, storyId: params.storyId }),
    operation,
  });
  const normalized = await normalizePanelCropForPaste(
    Buffer.from(generated.imageData),
    params.cropRect
  );

  return {
    imageData: normalized,
    mimeType: 'image/png',
    providerInteractionId: generated.providerInteractionId,
    requestManifest: {
      ...buildGraphicNovelImageRequestManifest({
        operation,
        mode: 'generate',
        prompt,
        systemInstruction,
        aspectRatio,
        imageSize: params.imageSize,
        personGeneration: 'allow_all',
        referenceImages: params.referenceImages,
        providerRequestManifest: generated.requestManifest,
      }),
      providerInteractionId: generated.providerInteractionId ?? null,
      cropRect: params.cropRect,
    },
  };
}

async function editGraphicNovelPanelCrop(params: {
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  page: PlannedGraphicNovelPage;
  panelNumber: number;
  panel: PlannedGraphicNovelPage['panels'][number];
  cropRect: PixelCropRect;
  originalImage: Buffer;
  validation: GraphicNovelPanelRenderedValidation;
  referenceImages: GraphicNovelReferenceImage[];
  userId: string;
  storyId: string;
  imageSize?: GenerateImageRequest['imageSize'];
}): Promise<{
  imageData: Buffer;
  mimeType: string;
  providerInteractionId?: string;
  requestManifest?: Record<string, unknown>;
}> {
  const sceneVisual = buildGraphicNovelPanelValidationSceneVisual({
    pageNumber: params.page.pageNumber,
    panelNumber: params.panelNumber,
    panel: params.panel,
  });
  const scene = graphicNovelPanelSceneData({
    page: params.page,
    panelNumber: params.panelNumber,
    panel: params.panel,
    sceneVisual,
  });
  const repairPlan = buildTargetedEditRepairPlan(
    editableGraphicNovelReferences(params.referenceImages),
    params.validation.validation,
    scene
  );
  const edited = await params.imageDomain.editSceneImage({
    originalImage: params.originalImage,
    originalMimeType: 'image/png',
    validationResult: params.validation.validation,
    sceneDescription: scene.primaryRead,
    imageSize: params.imageSize,
    referenceImages: repairPlan.references,
    targetedRepairManifest: repairPlan.manifest,
    systemInstruction: buildImageEditSystemInstruction(),
    personGeneration: 'allow_all',
    onUsage: (usage) => recordUsage(usage, { userId: params.userId, storyId: params.storyId }),
    operation: 'graphic_novel_panel_crop_validation_edit',
  });
  const normalized = await normalizePanelCropForPaste(
    Buffer.from(edited.imageData),
    params.cropRect
  );

  return {
    imageData: normalized,
    mimeType: 'image/png',
    providerInteractionId: edited.providerInteractionId,
    requestManifest: {
      ...(edited.requestManifest ?? {}),
      operation: 'graphic_novel_panel_crop_validation_edit',
      cropRect: params.cropRect,
      repairMode: repairPlan.mode,
      repairManifest: repairPlan.manifest,
      selectedReferenceCount: repairPlan.references?.length ?? 0,
      providerInteractionId: edited.providerInteractionId ?? null,
    },
  };
}

async function validateAndRepairGraphicNovelPanelCrop(params: {
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  panelImage: Buffer;
  page: PlannedGraphicNovelPage;
  detectedPanel: GraphicNovelDetectedPanelBounds;
  characters: GraphicNovelCharacterManifest;
  validationReferenceImages: Parameters<
    typeof validateGraphicNovelPanelCrop
  >[0]['validationReferenceImages'];
  validationRefNamesNormalized: Set<string>;
  dressedTurnaroundValidationNames: Set<string>;
  referenceImages: GraphicNovelReferenceImage[];
  storyArtifactReference?: GraphicNovelStoryArtifactReference | null;
  style: string;
  ageGroup: string;
  scenarioCardId?: string;
  environmentsById: Map<string, StoryEnvironment>;
  requestId: string;
  userId: string;
  storyId: string;
  pageAttempt: number;
  allowRepair: boolean;
  imageSize?: GenerateImageRequest['imageSize'];
}): Promise<GraphicNovelPanelRenderedValidation> {
  const panel = params.page.panels[params.detectedPanel.panelNumber - 1];
  if (!panel) {
    throw new Error(`Missing planned panel ${params.detectedPanel.panelNumber}`);
  }
  const initialCrop = await normalizePanelCropForPaste(
    params.panelImage,
    params.detectedPanel.cropRect
  );
  const initialPanelAsset = await saveGraphicNovelPanelAttemptAsset({
    storyId: params.storyId,
    userId: params.userId,
    requestId: params.requestId,
    pageNumber: params.page.pageNumber,
    panelIndex: params.detectedPanel.panelNumber,
    panelId: params.detectedPanel.panelId,
    attempt: params.pageAttempt,
    operation: 'graphic_novel_panel_crop_validation_original',
    source: 'panel_validation_original',
    imageData: initialCrop,
    mimeType: 'image/png',
    cropRect: params.detectedPanel.cropRect,
    repairMode: 'original',
  });
  const initialRequestManifest = {
    operation: 'graphic_novel_panel_crop_validation_original',
    repairMode: 'original',
    cropRect: params.detectedPanel.cropRect,
    panelImageAssetId: initialPanelAsset.assetId,
    panelImageStoragePath: initialPanelAsset.storagePath,
    panelImageUrl:
      initialPanelAsset.storageUrl ?? `/api/v1/assets/${initialPanelAsset.storagePath}`,
    panelImageMimeType: initialPanelAsset.mimeType,
    panelImageFileSizeBytes: initialPanelAsset.fileSizeBytes,
  };
  const initialValidation = await validateGraphicNovelPanelCrop({
    imageDomain: params.imageDomain,
    panelImage: initialCrop,
    page: params.page,
    detectedPanel: params.detectedPanel,
    panel,
    characters: params.characters,
    validationReferenceImages: params.validationReferenceImages,
    validationRefNamesNormalized: params.validationRefNamesNormalized,
    dressedTurnaroundValidationNames: params.dressedTurnaroundValidationNames,
    userId: params.userId,
    storyId: params.storyId,
    attempt: params.pageAttempt,
    repairMode: 'original',
    requestManifest: initialRequestManifest,
  });

  if (!params.allowRepair || !shouldRetryGraphicNovelPanelValidation(initialValidation)) {
    return initialValidation;
  }

  const panelReferenceImages = graphicNovelPanelReferenceImagesForRepair(
    params.referenceImages,
    initialValidation.expectedCharacters,
    panel,
    params.storyArtifactReference,
    params.characters
  );
  const repairAttempt = params.pageAttempt + 1;
  let repaired: Awaited<ReturnType<typeof generateGraphicNovelPanelCrop>>;
  let repairMode: 'edit' | 'generate';

  if (
    config.image.validationUseEditRepair &&
    !shouldRegenerateGraphicNovelPanel(initialValidation)
  ) {
    try {
      repaired = await editGraphicNovelPanelCrop({
        imageDomain: params.imageDomain,
        page: params.page,
        panelNumber: params.detectedPanel.panelNumber,
        panel,
        cropRect: params.detectedPanel.cropRect,
        originalImage: initialCrop,
        validation: initialValidation,
        referenceImages: panelReferenceImages,
        userId: params.userId,
        storyId: params.storyId,
        imageSize: params.imageSize,
      });
      repairMode = 'edit';
    } catch (error) {
      logger.warn(
        {
          err: error,
          storyId: params.storyId,
          pageNumber: params.page.pageNumber,
          panelNumber: params.detectedPanel.panelNumber,
        },
        'Graphic novel panel edit repair failed; regenerating panel crop'
      );
      repaired = await generateGraphicNovelPanelCrop({
        imageDomain: params.imageDomain,
        page: params.page,
        panelIndex: params.detectedPanel.panelNumber - 1,
        cropRect: params.detectedPanel.cropRect,
        style: params.style,
        ageGroup: params.ageGroup,
        scenarioCardId: params.scenarioCardId,
        environmentsById: params.environmentsById,
        referenceImages: panelReferenceImages,
        storyArtifactReference: params.storyArtifactReference,
        userId: params.userId,
        storyId: params.storyId,
        imageSize: params.imageSize,
      });
      repairMode = 'generate';
    }
  } else {
    repaired = await generateGraphicNovelPanelCrop({
      imageDomain: params.imageDomain,
      page: params.page,
      panelIndex: params.detectedPanel.panelNumber - 1,
      cropRect: params.detectedPanel.cropRect,
      style: params.style,
      ageGroup: params.ageGroup,
      scenarioCardId: params.scenarioCardId,
      environmentsById: params.environmentsById,
      referenceImages: panelReferenceImages,
      storyArtifactReference: params.storyArtifactReference,
      userId: params.userId,
      storyId: params.storyId,
      imageSize: params.imageSize,
    });
    repairMode = 'generate';
  }
  const repairOperation =
    typeof repaired.requestManifest?.operation === 'string'
      ? repaired.requestManifest.operation
      : repairMode === 'edit'
        ? 'graphic_novel_panel_crop_validation_edit'
        : 'graphic_novel_panel_crop_validation_regenerate';
  const repairedPanelAsset = await saveGraphicNovelPanelAttemptAsset({
    storyId: params.storyId,
    userId: params.userId,
    requestId: params.requestId,
    pageNumber: params.page.pageNumber,
    panelIndex: params.detectedPanel.panelNumber,
    panelId: params.detectedPanel.panelId,
    attempt: repairAttempt,
    operation: repairOperation,
    source: 'panel_validation_repair',
    imageData: repaired.imageData,
    mimeType: repaired.mimeType || 'image/png',
    cropRect: params.detectedPanel.cropRect,
    repairMode,
  });
  const repairedRequestManifest = {
    ...(repaired.requestManifest ?? {}),
    repairMode,
    panelImageAssetId: repairedPanelAsset.assetId,
    panelImageStoragePath: repairedPanelAsset.storagePath,
    panelImageUrl:
      repairedPanelAsset.storageUrl ?? `/api/v1/assets/${repairedPanelAsset.storagePath}`,
    panelImageMimeType: repairedPanelAsset.mimeType,
    panelImageFileSizeBytes: repairedPanelAsset.fileSizeBytes,
  };

  const repairedValidation = await validateGraphicNovelPanelCrop({
    imageDomain: params.imageDomain,
    panelImage: repaired.imageData,
    page: params.page,
    detectedPanel: params.detectedPanel,
    panel,
    characters: params.characters,
    validationReferenceImages: params.validationReferenceImages,
    validationRefNamesNormalized: params.validationRefNamesNormalized,
    dressedTurnaroundValidationNames: params.dressedTurnaroundValidationNames,
    userId: params.userId,
    storyId: params.storyId,
    attempt: repairAttempt,
    repairMode,
    requestManifest: repairedRequestManifest,
  });

  const initialDecision = graphicNovelPanelQualityDecision(initialValidation);
  const repairedDecision = graphicNovelPanelQualityDecision(repairedValidation);
  const initialScore = initialValidation.score ?? -1;
  const repairedScore = repairedValidation.score ?? -1;
  const selectedValidation =
    repairedDecision.accepted !== initialDecision.accepted
      ? repairedDecision.accepted
        ? repairedValidation
        : initialValidation
      : repairedScore >= initialScore
        ? repairedValidation
        : initialValidation;
  return {
    ...selectedValidation,
    sourcePanelValidations: [initialValidation, repairedValidation],
  };
}

async function composeGraphicNovelPanelCropRepairs(params: {
  page: PlannedGraphicNovelPage;
  imageData: Buffer;
  panelValidations: GraphicNovelPanelRenderedValidation[];
}): Promise<{ imageData: Buffer; repairedPanelCount: number }> {
  const repairedPanels = params.panelValidations.filter(
    (panelValidation) => panelValidation.repairMode && panelValidation.repairMode !== 'original'
  );
  if (repairedPanels.length === 0) {
    return {
      imageData: await sharp(params.imageData).png().toBuffer(),
      repairedPanelCount: 0,
    };
  }

  const composites = await Promise.all(
    repairedPanels.map(async (panelValidation) => ({
      input: await normalizePanelCropForPaste(panelValidation.imageData!, panelValidation.cropRect),
      left: panelValidation.cropRect.left,
      top: panelValidation.cropRect.top,
    }))
  );

  return {
    imageData: await overlayGraphicNovelPanelFrames(
      await sharp(params.imageData).composite(composites).png().toBuffer(),
      params.page
    ),
    repairedPanelCount: repairedPanels.length,
  };
}

function bubbleVisionPanelImagesFromValidations(
  panelValidations: GraphicNovelPanelRenderedValidation[] | undefined
): GraphicNovelBubbleVisionPanelImage[] | undefined {
  const panelImages = (panelValidations ?? [])
    .filter((panelValidation) => !!panelValidation.imageData)
    .map((panelValidation) => ({
      panelIndex: panelValidation.panelNumber,
      panelId: panelValidation.panelId,
      imageData: Buffer.from(panelValidation.imageData!),
      mimeType: 'image/png' as const,
    }));
  return panelImages.length > 0 ? panelImages : undefined;
}

async function applyVisionBubblePlacementForRenderedPage(params: {
  page: PlannedGraphicNovelPage;
  userId: string;
  storyId: string;
  panelImages?: GraphicNovelBubbleVisionPanelImage[];
}): Promise<{
  page: PlannedGraphicNovelPage;
  analysis: GraphicNovelBubbleVisionAnalysis | null;
  placementSummary: Record<string, unknown>;
}> {
  if (config.image.skipGeneration) {
    return {
      page: params.page,
      analysis: null,
      placementSummary: {
        mode: 'script_fallback_skip_generation',
        skipped: true,
      },
    };
  }

  try {
    if (!params.panelImages?.length) {
      throw new Error(
        `Missing panel images for graphic novel bubble vision page ${params.page.pageNumber}`
      );
    }
    const analysis = await analyzeGraphicNovelBubbleVisionPanelImages({
      textProvider: getValidationTextProvider(),
      page: params.page,
      panelImages: params.panelImages,
      onUsage: (usage) => recordUsage(usage, { userId: params.userId, storyId: params.storyId }),
    });
    const planned = applyGraphicNovelBubbleVisionLayout(params.page, analysis);
    return {
      page: planned.page,
      analysis,
      placementSummary: {
        mode: 'post_art_vision_panel_images',
        ...planned.placementSummary,
      },
    };
  } catch (error) {
    logger.warn(
      { err: error, storyId: params.storyId, pageNumber: params.page.pageNumber },
      'Graphic novel bubble vision placement failed; falling back to script bubble geometry'
    );
    return {
      page: params.page,
      analysis: null,
      placementSummary: {
        mode: 'script_fallback_after_vision_error',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function validateGraphicNovelRenderedPage(params: {
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  imageData: Buffer;
  page: PlannedGraphicNovelPage;
  characters: GraphicNovelCharacterManifest;
  referenceImages?: GraphicNovelReferenceImage[];
  storyArtifactReference?: GraphicNovelStoryArtifactReference | null;
  userId: string;
  storyId: string;
  style: string;
  ageGroup: string;
  scenarioCardId?: string;
  environmentsById: Map<string, StoryEnvironment>;
  requestId: string;
  attempt?: number;
  imageSize?: GenerateImageRequest['imageSize'];
  panelImages?: GraphicNovelBubbleVisionPanelImage[];
}): Promise<GraphicNovelRenderedPageValidation | null> {
  if (!config.image.enableValidation) {
    return null;
  }

  const suppliedPanelIndexes = new Set(
    (params.panelImages ?? []).map((panelImage) => panelImage.panelIndex)
  );
  const missingPanelNumbers = params.page.panels
    .map((_, index) => index + 1)
    .filter((panelNumber) => !suppliedPanelIndexes.has(panelNumber));
  if (missingPanelNumbers.length > 0) {
    throw new Error(
      `Missing generated panel image(s) for graphic novel page ${params.page.pageNumber}: panels ${missingPanelNumbers.join(', ')}`
    );
  }

  try {
    const pageImageData = await normalizeGraphicNovelPageImageForCanvas(
      Buffer.from(params.imageData),
      params.page
    );
    const characterValidationReferenceImages = params.referenceImages
      ?.filter(
        (ref) =>
          ref.characterName && (ref.base64Data || ref.fileUri) && ref.referenceKind === 'character'
      )
      .map((ref) => ({
        characterName: ref.characterName!,
        imageData: ref.base64Data,
        fileUri: ref.fileUri,
        mimeType: ref.mimeType || 'image/png',
        referenceKind: 'identity' as const,
        identitySource:
          ref.source === 'character_outfit_turnaround' ||
          ref.type === 'dressed_turnaround_reference'
            ? ('dressed_turnaround' as const)
            : ref.isTurnaround
              ? ('turnaround' as const)
              : ('reference_photo' as const),
      }));
    const validationReferenceImages = characterValidationReferenceImages ?? [];
    const dressedTurnaroundValidationNames = new Set(
      validationReferenceImages
        .filter((ref) => ref.identitySource === 'dressed_turnaround')
        .map((ref) => normalizeCharacterName(ref.characterName))
        .filter(Boolean)
    );
    const validationRefNamesNormalized = new Set(
      (characterValidationReferenceImages || []).map((ref) =>
        stripCharacterIdFromName(ref.characterName).trim().toLowerCase()
      )
    );

    const detected = await buildTemplateGraphicNovelPanelBounds({
      page: params.page,
      imageData: pageImageData,
    });
    const allowPanelRepair = !detected.hasStructureIssue && !config.image.skipGeneration;
    const panelImageByIndex = new Map(
      (params.panelImages ?? []).map((panelImage) => [panelImage.panelIndex, panelImage.imageData])
    );
    const panelValidations = await Promise.all(
      detected.panels.map((detectedPanel) => {
        const panelImage = panelImageByIndex.get(detectedPanel.panelNumber);
        if (!panelImage) {
          throw new Error(
            `Missing generated panel image for graphic novel page ${params.page.pageNumber} panel ${detectedPanel.panelNumber}`
          );
        }
        return validateAndRepairGraphicNovelPanelCrop({
          imageDomain: params.imageDomain,
          panelImage,
          page: params.page,
          detectedPanel,
          characters: params.characters,
          validationReferenceImages,
          validationRefNamesNormalized,
          dressedTurnaroundValidationNames,
          referenceImages: params.referenceImages ?? [],
          storyArtifactReference: params.storyArtifactReference,
          style: params.style,
          ageGroup: params.ageGroup,
          scenarioCardId: params.scenarioCardId,
          environmentsById: params.environmentsById,
          requestId: params.requestId,
          userId: params.userId,
          storyId: params.storyId,
          pageAttempt: params.attempt ?? 1,
          allowRepair: allowPanelRepair,
          imageSize: params.imageSize,
        });
      })
    );
    const composed = await composeGraphicNovelPanelCropRepairs({
      page: params.page,
      imageData: pageImageData,
      panelValidations,
    });

    const validation = buildGraphicNovelPanelCompositeValidation({
      page: params.page,
      attempt: params.attempt ?? 1,
      detectedPanels: detected.panels,
      detectionFeedback: detected.feedback,
      hasStructureIssue: detected.hasStructureIssue,
      panelValidations,
    });
    const panelScores = panelValidations
      .map((panelValidation) => panelValidation.score)
      .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
    const score =
      validation.validationStatus === 'provider_blocked'
        ? null
        : panelScores.length > 0
          ? Math.min(...panelScores, detected.hasStructureIssue ? 20 : 100)
          : detected.hasStructureIssue
            ? 0
            : null;

    if (validation.validationStatus !== 'provider_blocked' && validation.hasExtraPanelStructure) {
      logger.warn(
        {
          storyId: params.storyId,
          pageNumber: params.page.pageNumber,
          layoutFeedback: validation.layoutFeedback,
          overallFeedback: validation.overallFeedback,
          hasArtworkOutsidePanelBounds: validation.hasArtworkOutsidePanelBounds,
          hasArtworkOverSpeechBubbles: validation.hasArtworkOverSpeechBubbles,
          hasExtraPanelStructure: validation.hasExtraPanelStructure,
          validationScore: score,
        },
        'Graphic novel layout validation reported issues'
      );
    }

    const panelQuality = panelValidations.map((panelValidation) => ({
      panelNumber: panelValidation.panelNumber,
      panelId: panelValidation.panelId,
      score: panelValidation.score,
      attempt: panelValidation.attempt,
      repairMode: panelValidation.repairMode ?? 'original',
      ...graphicNovelPanelQualityDecision(panelValidation),
    }));
    const failedPanels = panelQuality
      .filter((panel) => !panel.accepted)
      .map((panel) => ({
        panelNumber: panel.panelNumber,
        panelId: panel.panelId,
        score: panel.score,
        failureReasons: panel.failureReasons,
      }));

    return {
      validation,
      score,
      attempt: params.attempt ?? 1,
      panelValidations,
      imageData: composed.imageData,
      mimeType: 'image/png',
      panelRepairSummary: {
        enabled: allowPanelRepair,
        repairedPanelCount: composed.repairedPanelCount,
        panelCount: panelValidations.length,
        failedPanelCount: failedPanels.length,
        failedPanels,
        panels: panelQuality,
        modes: panelQuality.map((panel) => ({
          panelNumber: panel.panelNumber,
          score: panel.score,
          attempt: panel.attempt,
          repairMode: panel.repairMode,
        })),
      },
    };
  } catch (error) {
    logger.warn(
      {
        err: error,
        storyId: params.storyId,
        pageNumber: params.page.pageNumber,
      },
      'Graphic novel image validation failed; keeping generated page'
    );
    return null;
  }
}

async function persistGraphicNovelPanelValidationResults(params: {
  storyId: string;
  pageNumber: number;
  attempt: number;
  imageStoragePath: string;
  panelValidations?: GraphicNovelPanelRenderedValidation[];
}): Promise<void> {
  if (!params.panelValidations?.length) return;

  for (const panelValidation of params.panelValidations) {
    const sourcePanelValidations = panelValidation.sourcePanelValidations?.length
      ? panelValidation.sourcePanelValidations
      : [panelValidation];
    const persistedKeys = new Set<string>();
    for (const sourcePanelValidation of sourcePanelValidations) {
      const persistedKey = [
        sourcePanelValidation.panelNumber,
        sourcePanelValidation.attempt,
        sourcePanelValidation.repairMode ?? 'original',
      ].join(':');
      if (persistedKeys.has(persistedKey)) continue;
      persistedKeys.add(persistedKey);

      const panelImageStoragePath = sourcePanelValidation.requestManifest?.panelImageStoragePath;
      const manifestStoragePath =
        typeof panelImageStoragePath === 'string' && panelImageStoragePath.trim()
          ? panelImageStoragePath
          : null;
      if (!manifestStoragePath) {
        throw new Error(
          `Missing panelImageStoragePath for graphic novel panel validation ${params.storyId} page ${params.pageNumber} panel ${sourcePanelValidation.panelNumber}`
        );
      }

      await persistImageValidationResult({
        storyId: params.storyId,
        sceneIndex: params.pageNumber,
        attempt: sourcePanelValidation.attempt ?? params.attempt,
        subjectType: 'graphic_novel_panel',
        pageNumber: params.pageNumber,
        panelIndex: sourcePanelValidation.panelNumber,
        panelId: sourcePanelValidation.panelId,
        cropRect: {
          ...sourcePanelValidation.cropRect,
          normalizedRect: sourcePanelValidation.normalizedRect,
        },
        imageStoragePath: manifestStoragePath,
        validationScore: sourcePanelValidation.score,
        visionModel:
          sourcePanelValidation.validation.validationModelUsed ??
          config.ai.validationModel ??
          config.ai.geminiVisionModel,
        validation: sourcePanelValidation.validation,
      });
    }
  }
}

export async function createGraphicNovelRequest(
  userId: string,
  input: CreateStoryRequestInput
): Promise<string> {
  await assertGraphicNovelQuotaAvailable(userId);
  const requestId = await createStoryRequest(userId, input, {
    quotaSource: 'graphic_novel',
  });

  await getStoryRepository().updateRequest(requestId, {
    intermediateData: {
      generationKind: GRAPHIC_NOVEL_KIND,
      graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
      graphicNovelProgressStage: 'generating_script',
    },
  });
  await recordUsageEvent(userId, GRAPHIC_NOVEL_USAGE_EVENT, 1, {
    childProfileId: input.childProfileId ?? null,
    metadata: {
      requestId,
      quotaReservation: true,
      reservationSource: 'graphic_novel',
      reservedAt: new Date().toISOString(),
      reservationBehavior: 'consumed_on_queue_acceptance',
    },
  });

  return requestId;
}

export async function createMixedStoryRequest(
  userId: string,
  input: CreateStoryRequestInput
): Promise<string> {
  await assertMixedStoryAccessAvailable(userId);
  const requestId = await createStoryRequest(userId, input, {
    quotaSource: 'mixed_story',
  });

  await getStoryRepository().updateRequest(requestId, {
    intermediateData: {
      generationKind: MIXED_STORY_KIND,
      graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
      graphicNovelProgressStage: 'generating_script',
    },
  });

  return requestId;
}

function estimateMixedStorySceneCount(ageGroup: string): number {
  switch (ageGroup) {
    case '0-1':
    case '1y':
      return 5;
    case '2-3':
      return 6;
    case '4-5':
      return 8;
    case '6-8':
      return 8;
    case '9-12':
      return 11;
    default:
      return 8;
  }
}

export async function processGraphicNovelRequest(requestId: string): Promise<{ storyId: string }> {
  const request = await getStoryRepository().findRequestById(requestId);
  if (!request) {
    throw new Error(`Graphic novel request ${requestId} not found`);
  }

  const existingProject = await getGraphicNovelRepository().findProjectByRequestId(requestId);
  if (existingProject) {
    return { storyId: existingProject.storyId };
  }

  let storyId: string | undefined;
  const continuationData = getContinuationDataFromRequest(request);

  try {
    await getStoryRepository().updateRequest(requestId, {
      status: 'processing',
      errorMessage: null,
      updatedAt: new Date(),
    });

    const pageCount = applyGraphicNovelPageCountLimit(GRAPHIC_NOVEL_DEFAULT_PAGE_COUNT);
    const specData = await buildStorySpec(
      {
        ...request,
        selectedCharacters: Array.isArray(request.selectedCharacters)
          ? request.selectedCharacters
          : [],
        selectedChildren: Array.isArray(request.selectedChildren) ? request.selectedChildren : [],
      } as any,
      continuationData.isContinuation
        ? {
            continuationContext: continuationData.continuationContext,
          }
        : undefined
    );
    const spec = specData.spec;
    const visualReferenceLabels = visualCharacterReferenceLabelsFromCharacters(spec.characters);
    const closingArtifactReference = buildGraphicNovelStoryArtifactReference(spec.closingArtifact);

    await setPlannedTasks(requestId, [
      { task: STORY_TASKS.GENERATING_TEXT, estimatedMs: 45_000 },
      { task: STORY_TASKS.PRODUCING_VISUALS, estimatedMs: 20_000 },
      { task: STORY_TASKS.GENERATING_IMAGES, estimatedMs: 20_000 },
    ]);

    storyId = await createStoryStub({
      userId: request.userId,
      storyRequestId: request.id,
      childProfileId: request.childProfileId,
      ...getStoryCreationAttributionInputFromRequest(request),
      spec,
      ...(continuationData.isContinuation &&
        continuationData.seriesId &&
        continuationData.partNumber && {
          seriesData: {
            seriesId: continuationData.seriesId,
            partNumber: continuationData.partNumber,
          },
        }),
      isScheduledContinuation: continuationData.isScheduledContinuation,
    });
    await getStoryRepository().updateRequest(requestId, {
      intermediateData: {
        ...continuationData.intermediateData,
        generationKind: GRAPHIC_NOVEL_KIND,
        storyId,
        graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
        graphicNovelProgressStage: 'generating_script',
      },
    });

    const graphicNovelDomain = getGraphicNovelDomainService();
    await setGraphicNovelProgressStage(requestId, 'generating_script');
    await startTask(requestId, STORY_TASKS.GENERATING_TEXT, { estimatedMs: 45_000 });
    const script = await withStageTiming(
      {
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'text',
        operation: 'graphic_novel_script',
        targetType: 'story',
        metadata: {
          pageCount,
          requestedPageCount: GRAPHIC_NOVEL_DEFAULT_PAGE_COUNT,
          maxPageCount: config.image.graphicNovelMaxPageCount,
          isContinuation: continuationData.isContinuation,
          language: spec.language,
          ageGroup: spec.ageGroup,
        },
        successMetadata: (result) => ({
          environmentCount: result.environments?.length ?? 0,
          pageCount: result.pages?.length ?? pageCount,
          outfitCount: result.outfits?.length ?? 0,
        }),
      },
      () =>
        graphicNovelDomain.generateScript({
          spec,
          pageCount,
          visualReferenceLabels,
          ...(closingArtifactReference && {
            visualArtifactReferenceLabel: closingArtifactReference.referenceBindingId,
          }),
          ...(continuationData.isContinuation &&
            continuationData.continuationContext && {
              isContinuation: true,
              continuationContext: continuationData.continuationContext,
            }),
          onUsage: (usage) => recordUsage(usage, { userId: request.userId, storyId: storyId! }),
        })
    );

    const { characters: graphicNovelCharacters, llmCharacters: graphicNovelLlmCharacters } =
      await prepareGraphicNovelCharactersForScript({
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: GRAPHIC_NOVEL_KIND,
        spec,
        script,
        imageStyle: (spec as any).imageStyle,
      });

    await transitionTask(requestId, STORY_TASKS.GENERATING_TEXT, STORY_TASKS.PRODUCING_VISUALS, {
      estimatedMs: 20_000,
    });
    await setGraphicNovelProgressStage(requestId, 'planning_pages');
    const graphicNovelEnvironmentImages = await ensureGraphicNovelEnvironmentImages({
      storyId,
      storyRequestId: requestId,
      userId: request.userId,
      environments: script.environments,
      scenarioCardId: spec.scenarioCard?.id,
      generationKind: GRAPHIC_NOVEL_KIND,
    });
    const readingTextSettings = await resolveGraphicNovelReadingTextSettings({
      ageGroup: spec.ageGroup,
      userId: request.userId,
      childProfileId: request.childProfileId ?? request.createdByChildProfileId ?? null,
    });
    const { characterManifest, plannedPages } = await withStageTiming(
      {
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'visual_planning',
        operation: 'graphic_novel_layout',
        targetType: 'story',
        metadata: {
          pageCount,
          environmentCount: script.environments.length,
        },
        successMetadata: (result) => ({
          plannedPageCount: result.plannedPages.length,
          characterCount: result.characterManifest.length,
          textSizePx: readingTextSettings.textSizePx,
        }),
      },
      async () => {
        const manifest = await buildGraphicNovelCharacterManifest(graphicNovelCharacters);
        const aliases = buildGraphicNovelCharacterAliasMap(manifest);
        const pages = graphicNovelDomain
          .planLayouts({
            spec,
            script,
            bubbleTextSizing: readingTextSettings.bubbleTextSizing,
          })
          .map((page) => ({ ...page, characterAliases: aliases }));
        return {
          characterManifest: manifest,
          plannedPages: augmentGraphicNovelPagesWithMentionedCharacters({
            pages,
            characters: manifest,
            aliases,
            outfits: script.outfits || [],
          }),
        };
      }
    );
    await setGraphicNovelProgressStage(requestId, 'placing_bubbles');
    await completeTask(requestId, STORY_TASKS.PRODUCING_VISUALS);

    const textManifest = buildGraphicNovelTextManifest(plannedPages);
    const closingKeepsakeLabel = extractClosingKeepsakeFromEpisodeText({
      fullText: textManifest.fullText,
      scenes: textManifest.scenes,
    });
    await getStoryRepository().updateStory(storyId, {
      title: stripCharacterIds(script.title),
      language: spec.language,
      ageGroup: spec.ageGroup,
      moralTheme: request.goal,
      scenes: textManifest.scenes,
      fullText: textManifest.fullText,
      wordCount: countNarrationWords(textManifest.fullText),
      closingKeepsakeLabel,
      closingArtifactId: spec.closingArtifact?.id ?? null,
      modelVersion: config.ai.modelVersion,
      generationTimeMs: null,
      metadata: {
        storyFormat: GRAPHIC_NOVEL_KIND,
        graphicNovelTextMode: 'html_overlay',
        storyComplexityAgeGroup: spec.storyComplexityAgeGroup ?? spec.ageGroup,
        storyComplexityAdjustment: spec.storyComplexityAdjustment ?? 0,
        graphicNovelTextManifestVersion: textManifest.version,
        firstPageReady: false,
        graphicNovelGenerationComplete: false,
        readingSettings: {
          baseTextSizePx: readingTextSettings.baseTextSizePx,
          textSizeMultiplier: readingTextSettings.textSizeMultiplier,
          textSizePx: readingTextSettings.textSizePx,
        },
        graphicNovelBubbleTextSizing: readingTextSettings.bubbleTextSizing,
        imageStyle: (spec as any).imageStyle,
        scenarioCardId: spec.scenarioCard?.id,
        llmGeneratedCharacters: graphicNovelLlmCharacters,
        graphicNovelPageCount: pageCount,
        graphicNovelRequestedPageCount: GRAPHIC_NOVEL_DEFAULT_PAGE_COUNT,
        graphicNovelMaxPageCount: config.image.graphicNovelMaxPageCount,
        graphicNovelPlannedPageCount: plannedPages.length,
        environments: script.environments,
        outfits: script.outfits || [],
        graphicNovelEnvironmentImages,
        seoDescription: script.description,
        ...(spec.closingArtifact && {
          storyArtifactId: spec.closingArtifact.id,
          storyArtifactCode: spec.closingArtifact.artifactCode,
          storyArtifactTitle: spec.closingArtifact.title,
          storyArtifactDescription: spec.closingArtifact.description,
          storyArtifactImagePath: spec.closingArtifact.imagePath,
          storyArtifactReferenceBindingId: closingArtifactReference?.referenceBindingId,
          storyArtifactSelection: (spec.closingArtifact as any).selection,
        }),
      },
      policyChecks: {
        textValidated: true,
        graphicNovelScriptGenerated: true,
        timestamp: new Date().toISOString(),
      },
    });
    await linkGraphicNovelStoryCharacters({
      storyId,
      characters: graphicNovelCharacters,
    });

    const project = await getGraphicNovelRepository().createProject({
      storyId,
      storyRequestId: requestId,
      userId: request.userId,
      language: spec.language,
      ageGroup: spec.ageGroup,
      pageCount,
      status: 'generating',
      scriptJson: script,
      layoutManifest: {
        layoutMode: 'template_panel_composition',
        minimumPanelsPerPage: 2,
        pageSize: { width: 1536, height: 2048 },
        textMode: 'html_overlay',
        textManifestVersion: textManifest.version,
        readingSettings: {
          baseTextSizePx: readingTextSettings.baseTextSizePx,
          textSizeMultiplier: readingTextSettings.textSizeMultiplier,
          textSizePx: readingTextSettings.textSizePx,
        },
        bubbleTextSizing: readingTextSettings.bubbleTextSizing,
        characters: characterManifest,
        environments: script.environments.map((environment) => ({
          id: environment.id,
          name: environment.name,
        })),
        outfits: script.outfits || [],
        environmentImages: graphicNovelEnvironmentImages,
        ...(closingArtifactReference && { closingArtifactReference }),
        pageTextSegments: textManifest.pages.map((page) => ({
          pageNumber: page.pageNumber,
          segmentIds: page.items.map((item) => item.segmentId),
        })),
      },
    });

    const textOverlayByPage = new Map(textManifest.pages.map((page) => [page.pageNumber, page]));

    for (const plannedPage of plannedPages) {
      const textOverlay = textOverlayByPage.get(plannedPage.pageNumber);
      const page = await getGraphicNovelRepository().createPage({
        projectId: project.id,
        storyId,
        pageNumber: plannedPage.pageNumber,
        pageRole: plannedPage.pageRole,
        layoutJson: plannedPage,
        bubbleLayoutJson: {
          ...buildGraphicNovelBubbleLayoutJson(plannedPage, 'script_initial'),
          textOverlay,
        },
        status: 'pending',
        generationParams: {
          renderingMode: 'edit',
          bubblePlacement: 'script_initial_pending_post_art_vision',
          textRenderingMode: 'html_overlay',
        },
      });

      await getGraphicNovelRepository().createPanels(
        plannedPage.panels.map((panel, index) => ({
          pageId: page.id,
          projectId: project.id,
          storyId,
          pageNumber: plannedPage.pageNumber,
          panelIndex: index + 1,
          panelId: panel.script.panelId,
          speakerLines: panel.script.dialogue,
          thoughtLines: panel.script.thoughts,
          caption: panel.script.caption ?? null,
          visualAction: panel.script.visual.primaryRead,
          charactersPresent: panelCharacterNames(panel.script),
          artPrompt: panelVisualSummary(panel.script),
          bubbleGeometry: panel.bubbles,
        }))
      );
    }

    await getStoryRepository().updateRequest(requestId, {
      errorMessage: null,
      intermediateData: {
        ...continuationData.intermediateData,
        generationKind: GRAPHIC_NOVEL_KIND,
        storyId,
        projectId: project.id,
        graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
        graphicNovelProgressStage: 'generating_first_page',
      },
    });

    logger.info(
      { requestId, storyId, projectId: project.id, pageCount },
      'Graphic novel script/layout saved'
    );
    if (
      continuationData.isContinuation &&
      continuationData.seriesId &&
      continuationData.partNumber
    ) {
      const createdStory = await getStoryRepository().findById(storyId);
      if (createdStory) {
        const { addContinuationToSeries } = await import('./seriesService');
        await addContinuationToSeries(continuationData.seriesId, storyId, createdStory);
        logger.info(
          {
            requestId,
            storyId,
            seriesId: continuationData.seriesId,
            partNumber: continuationData.partNumber,
          },
          'Added graphic novel continuation to series'
        );
      }
    }
    return { storyId };
  } catch (error) {
    logger.error(
      {
        err: error,
        requestId,
        storyId,
      },
      'Graphic novel script/layout generation failed'
    );

    if (storyId) {
      const existingStory = await getStoryRepository().findById(storyId);
      if (existingStory?.title === 'Generating...') {
        await getStoryRepository().deleteStory(storyId, request.userId);
        logger.info({ requestId, storyId }, 'Deleted graphic novel story stub after failure');
      }
    }

    await getStoryRepository().updateRequest(requestId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      updatedAt: new Date(),
    });

    throw error;
  }
}

export async function processMixedStoryRequest(requestId: string): Promise<{ storyId: string }> {
  const request = await getStoryRepository().findRequestById(requestId);
  if (!request) {
    throw new Error(`Mixed story request ${requestId} not found`);
  }

  const existingProject = await getGraphicNovelRepository().findProjectByRequestId(requestId);
  if (existingProject) {
    return { storyId: existingProject.storyId };
  }

  let storyId: string | undefined;
  const continuationData = getContinuationDataFromRequest(request);

  try {
    await getStoryRepository().updateRequest(requestId, {
      status: 'processing',
      errorMessage: null,
      updatedAt: new Date(),
    });

    const specData = await buildStorySpec(
      {
        ...request,
        selectedCharacters: Array.isArray(request.selectedCharacters)
          ? request.selectedCharacters
          : [],
        selectedChildren: Array.isArray(request.selectedChildren) ? request.selectedChildren : [],
      } as any,
      continuationData.isContinuation
        ? {
            continuationContext: continuationData.continuationContext,
          }
        : undefined
    );
    const spec = specData.spec;
    const visualReferenceLabels = visualCharacterReferenceLabelsFromCharacters(spec.characters);
    const closingArtifactReference = buildGraphicNovelStoryArtifactReference(spec.closingArtifact);
    const userPlan = await getPlanFeatures(request.userId);
    const planComicBlockCount = Number(userPlan.imagesPerStory || 0);
    if (planComicBlockCount <= 0) {
      throw new Error('Mixed story mode is unavailable when the plan has no story illustrations.');
    }
    const comicBlockCount = applyGraphicNovelPageCountLimit(planComicBlockCount);

    const sceneCount = estimateMixedStorySceneCount(spec.ageGroup);
    const comicSceneIds = getIllustrationBlockStartSceneIds(sceneCount, comicBlockCount);

    await setPlannedTasks(requestId, [
      { task: STORY_TASKS.GENERATING_TEXT, estimatedMs: 45_000 },
      { task: STORY_TASKS.PRODUCING_VISUALS, estimatedMs: 15_000 },
      { task: STORY_TASKS.GENERATING_IMAGES, estimatedMs: 20_000 },
    ]);

    storyId = await createStoryStub({
      userId: request.userId,
      storyRequestId: request.id,
      childProfileId: request.childProfileId,
      ...getStoryCreationAttributionInputFromRequest(request),
      spec,
      ...(continuationData.isContinuation &&
        continuationData.seriesId &&
        continuationData.partNumber && {
          seriesData: {
            seriesId: continuationData.seriesId,
            partNumber: continuationData.partNumber,
          },
        }),
      isScheduledContinuation: continuationData.isScheduledContinuation,
    });
    await getStoryRepository().updateRequest(requestId, {
      intermediateData: {
        ...continuationData.intermediateData,
        generationKind: MIXED_STORY_KIND,
        storyId,
        mixedStoryComicBlockCount: comicBlockCount,
        mixedStoryRequestedComicBlockCount: planComicBlockCount,
        graphicNovelMaxPageCount: config.image.graphicNovelMaxPageCount,
        mixedStorySceneCount: sceneCount,
        mixedStoryAnchorSceneIds: comicSceneIds,
        graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
        graphicNovelProgressStage: 'generating_script',
      },
    });

    const mixedStoryDomain = getMixedStoryDomainService();
    await setGraphicNovelProgressStage(requestId, 'generating_script', MIXED_STORY_KIND);
    await startTask(requestId, STORY_TASKS.GENERATING_TEXT, { estimatedMs: 45_000 });
    const { script, repairs } = await withStageTiming(
      {
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: MIXED_STORY_KIND,
        pipelinePhase: 'text',
        operation: 'mixed_story_script',
        targetType: 'story',
        metadata: {
          sceneCount,
          comicBlockCount,
          requestedComicBlockCount: planComicBlockCount,
          maxPageCount: config.image.graphicNovelMaxPageCount,
          isContinuation: continuationData.isContinuation,
          language: spec.language,
          ageGroup: spec.ageGroup,
        },
        successMetadata: (result) => ({
          environmentCount: result.script.environments?.length ?? 0,
          readingBlockCount: result.script.readingBlocks?.length ?? 0,
          repairCount: result.repairs?.length ?? 0,
          outfitCount: result.script.outfits?.length ?? 0,
        }),
      },
      () =>
        mixedStoryDomain.generateScript({
          spec,
          sceneCount,
          comicSceneIds,
          comicBlockCount,
          visualReferenceLabels,
          ...(closingArtifactReference && {
            visualArtifactReferenceLabel: closingArtifactReference.referenceBindingId,
          }),
          ...(continuationData.isContinuation &&
            continuationData.continuationContext && {
              isContinuation: true,
              continuationContext: continuationData.continuationContext,
            }),
          onUsage: (usage) => recordUsage(usage, { userId: request.userId, storyId: storyId! }),
        })
    );

    const { characters: mixedStoryCharacters, llmCharacters: mixedStoryLlmCharacters } =
      await prepareGraphicNovelCharactersForScript({
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: MIXED_STORY_KIND,
        spec,
        script,
        imageStyle: (spec as any).imageStyle,
      });

    await transitionTask(requestId, STORY_TASKS.GENERATING_TEXT, STORY_TASKS.PRODUCING_VISUALS, {
      estimatedMs: 15_000,
    });
    await setGraphicNovelProgressStage(requestId, 'planning_pages', MIXED_STORY_KIND);
    const graphicNovelEnvironmentImages = await ensureGraphicNovelEnvironmentImages({
      storyId,
      storyRequestId: requestId,
      userId: request.userId,
      environments: script.environments,
      scenarioCardId: spec.scenarioCard?.id,
      generationKind: MIXED_STORY_KIND,
    });
    const readingTextSettings = await resolveGraphicNovelReadingTextSettings({
      ageGroup: spec.ageGroup,
      userId: request.userId,
      childProfileId: request.childProfileId ?? request.createdByChildProfileId ?? null,
    });
    const { characterManifest, plannedPages } = await withStageTiming(
      {
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: MIXED_STORY_KIND,
        pipelinePhase: 'visual_planning',
        operation: 'mixed_story_layout',
        targetType: 'story',
        metadata: {
          sceneCount,
          comicBlockCount,
          environmentCount: script.environments.length,
        },
        successMetadata: (result) => ({
          plannedPageCount: result.plannedPages.length,
          characterCount: result.characterManifest.length,
          textSizePx: readingTextSettings.textSizePx,
        }),
      },
      async () => {
        const manifest = await buildGraphicNovelCharacterManifest(mixedStoryCharacters);
        const aliases = buildGraphicNovelCharacterAliasMap(manifest);
        const pages = planGraphicNovelLayouts({
          ageGroup: spec.storyComplexityAgeGroup ?? spec.ageGroup,
          pages: mixedStoryComicPages(script),
          outfits: script.outfits,
          bubbleTextSizing: readingTextSettings.bubbleTextSizing,
        }).map((page) => ({ ...page, characterAliases: aliases }));
        return {
          characterManifest: manifest,
          plannedPages: augmentGraphicNovelPagesWithMentionedCharacters({
            pages,
            characters: manifest,
            aliases,
            outfits: script.outfits || [],
          }),
        };
      }
    );
    const comicPanelRange = graphicNovelPanelCountRange(
      spec.storyComplexityAgeGroup ?? spec.ageGroup
    );
    await setGraphicNovelProgressStage(requestId, 'placing_bubbles', MIXED_STORY_KIND);
    await completeTask(requestId, STORY_TASKS.PRODUCING_VISUALS);

    const textManifest = buildMixedStoryTextManifest({ script, plannedPages });
    const closingKeepsakeLabel = extractClosingKeepsakeFromEpisodeText({
      fullText: textManifest.fullText,
      scenes: textManifest.scenes,
    });
    await getStoryRepository().updateStory(storyId, {
      title: stripCharacterIds(script.title),
      language: spec.language,
      ageGroup: spec.ageGroup,
      moralTheme: request.goal,
      scenes: textManifest.scenes,
      fullText: textManifest.fullText,
      wordCount: countNarrationWords(textManifest.fullText),
      closingKeepsakeLabel,
      closingArtifactId: spec.closingArtifact?.id ?? null,
      modelVersion: config.ai.modelVersion,
      generationTimeMs: null,
      metadata: {
        storyFormat: MIXED_STORY_KIND,
        graphicNovelTextMode: 'html_overlay',
        mixedStoryVersion: 1,
        storyComplexityAgeGroup: spec.storyComplexityAgeGroup ?? spec.ageGroup,
        storyComplexityAdjustment: spec.storyComplexityAdjustment ?? 0,
        mixedStoryTextMode: textManifest.textMode,
        mixedStoryTextManifestVersion: textManifest.version,
        mixedStoryComicBlockCount: comicBlockCount,
        mixedStoryRequestedComicBlockCount: planComicBlockCount,
        mixedStorySceneCount: sceneCount,
        mixedStoryAnchorSceneIds: comicSceneIds,
        mixedStoryReadingOrder: textManifest.readingOrder,
        mixedStoryComicTextRepairs: repairs,
        firstPageReady: false,
        graphicNovelGenerationComplete: false,
        imageGenerationComplete: true,
        readingSettings: {
          baseTextSizePx: readingTextSettings.baseTextSizePx,
          textSizeMultiplier: readingTextSettings.textSizeMultiplier,
          textSizePx: readingTextSettings.textSizePx,
        },
        graphicNovelBubbleTextSizing: readingTextSettings.bubbleTextSizing,
        sceneIdsWithImages: [],
        imageStyle: (spec as any).imageStyle,
        scenarioCardId: spec.scenarioCard?.id,
        llmGeneratedCharacters: mixedStoryLlmCharacters,
        graphicNovelPageCount: comicBlockCount,
        graphicNovelMaxPageCount: config.image.graphicNovelMaxPageCount,
        graphicNovelPlannedPageCount: plannedPages.length,
        graphicNovelLayoutMode: 'template_panel_composition',
        environments: script.environments,
        outfits: script.outfits || [],
        graphicNovelEnvironmentImages,
        seoDescription: script.description,
        ...(spec.closingArtifact && {
          storyArtifactId: spec.closingArtifact.id,
          storyArtifactCode: spec.closingArtifact.artifactCode,
          storyArtifactTitle: spec.closingArtifact.title,
          storyArtifactDescription: spec.closingArtifact.description,
          storyArtifactImagePath: spec.closingArtifact.imagePath,
          storyArtifactReferenceBindingId: closingArtifactReference?.referenceBindingId,
          storyArtifactSelection: (spec.closingArtifact as any).selection,
        }),
      },
      policyChecks: {
        textValidated: true,
        mixedStoryScriptGenerated: true,
        graphicNovelScriptGenerated: true,
        timestamp: new Date().toISOString(),
      },
    });

    const existingSceneRows = await getSceneRepository().findByStoryId(storyId);
    if (existingSceneRows.length === 0) {
      await getSceneRepository().createMany(
        textManifest.scenes.map((scene) => ({
          storyId: storyId!,
          sceneId: scene.sceneId,
          text: scene.text,
          visualPrompt: '',
          charactersPresent: [],
          generationParams: {
            source: MIXED_STORY_KIND,
            mixedStoryBlockKind: scene.mixedStoryBlockKind,
            mixedStoryScreenOrder: scene.mixedStoryScreenOrder,
            mixedStorySourceSceneIds: scene.mixedStorySourceSceneIds,
            mixedStoryAnchorSceneId: scene.mixedStoryAnchorSceneId ?? null,
            graphicNovelPageNumber: scene.graphicNovelPageNumber ?? null,
            graphicNovelTextSegmentIds: scene.graphicNovelTextSegmentIds ?? [],
          },
        }))
      );
    }

    await linkGraphicNovelStoryCharacters({
      storyId,
      characters: mixedStoryCharacters,
    });

    const project = await getGraphicNovelRepository().createProject({
      storyId,
      storyRequestId: requestId,
      userId: request.userId,
      language: spec.language,
      ageGroup: spec.ageGroup,
      pageCount: comicBlockCount,
      status: 'generating',
      scriptJson: script,
      layoutManifest: {
        storyFormat: MIXED_STORY_KIND,
        layoutMode: 'template_panel_composition',
        minimumPanelsPerPage: comicPanelRange.min,
        maximumPanelsPerPage: comicPanelRange.max,
        pageSize: GRAPHIC_NOVEL_PAGE_SIZE,
        textMode: 'html_overlay',
        textManifestVersion: textManifest.version,
        readingSettings: {
          baseTextSizePx: readingTextSettings.baseTextSizePx,
          textSizeMultiplier: readingTextSettings.textSizeMultiplier,
          textSizePx: readingTextSettings.textSizePx,
        },
        bubbleTextSizing: readingTextSettings.bubbleTextSizing,
        mixedStoryReadingOrder: textManifest.readingOrder,
        characters: characterManifest,
        environments: script.environments.map((environment) => ({
          id: environment.id,
          name: environment.name,
        })),
        outfits: script.outfits || [],
        environmentImages: graphicNovelEnvironmentImages,
        ...(closingArtifactReference && { closingArtifactReference }),
        pageTextSegments: textManifest.pages.map((page) => ({
          pageNumber: page.pageNumber,
          segmentIds: page.items.map((item) => item.segmentId),
        })),
      },
    });

    const textOverlayByPage = new Map(textManifest.pages.map((page) => [page.pageNumber, page]));
    const comicBlockByPage = new Map(
      script.readingBlocks
        .filter((block) => block.kind === 'comic')
        .map((block) => [block.comicPageNumber, block])
    );

    for (const plannedPage of plannedPages) {
      const textOverlay = textOverlayByPage.get(plannedPage.pageNumber);
      const comicBlock = comicBlockByPage.get(plannedPage.pageNumber);
      const page = await getGraphicNovelRepository().createPage({
        projectId: project.id,
        storyId,
        pageNumber: plannedPage.pageNumber,
        pageRole: plannedPage.pageRole,
        layoutJson: {
          ...plannedPage,
          mixedStorySceneId: comicBlock?.sceneId ?? null,
          mixedStoryScreenOrder: comicBlock?.screenOrder ?? null,
        },
        bubbleLayoutJson: {
          ...buildGraphicNovelBubbleLayoutJson(plannedPage, 'script_initial'),
          textOverlay,
        },
        status: 'pending',
        generationParams: {
          renderingMode: 'edit',
          bubblePlacement: 'script_initial_pending_post_art_vision',
          textRenderingMode: 'html_overlay',
          storyFormat: MIXED_STORY_KIND,
          mixedStorySceneId: comicBlock?.sceneId ?? null,
          mixedStoryScreenOrder: comicBlock?.screenOrder ?? null,
        },
      });

      await getGraphicNovelRepository().createPanels(
        plannedPage.panels.map((panel, index) => ({
          pageId: page.id,
          projectId: project.id,
          storyId,
          pageNumber: plannedPage.pageNumber,
          panelIndex: index + 1,
          panelId: panel.script.panelId,
          speakerLines: panel.script.dialogue,
          thoughtLines: panel.script.thoughts,
          caption: panel.script.caption ?? null,
          visualAction: panel.script.visual.primaryRead,
          charactersPresent: panelCharacterNames(panel.script),
          artPrompt: panelVisualSummary(panel.script),
          bubbleGeometry: panel.bubbles,
        }))
      );
    }

    await getStoryRepository().updateRequest(requestId, {
      errorMessage: null,
      intermediateData: {
        ...continuationData.intermediateData,
        generationKind: MIXED_STORY_KIND,
        storyId,
        projectId: project.id,
        mixedStoryComicBlockCount: comicBlockCount,
        mixedStoryRequestedComicBlockCount: planComicBlockCount,
        graphicNovelMaxPageCount: config.image.graphicNovelMaxPageCount,
        mixedStorySceneCount: sceneCount,
        mixedStoryAnchorSceneIds: comicSceneIds,
        graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
        graphicNovelProgressStage: 'generating_first_page',
      },
    });

    logger.info(
      { requestId, storyId, projectId: project.id, comicBlockCount, sceneCount },
      'Mixed story script/layout saved'
    );
    if (
      continuationData.isContinuation &&
      continuationData.seriesId &&
      continuationData.partNumber
    ) {
      const createdStory = await getStoryRepository().findById(storyId);
      if (createdStory) {
        const { addContinuationToSeries } = await import('./seriesService');
        await addContinuationToSeries(continuationData.seriesId, storyId, createdStory);
        logger.info(
          {
            requestId,
            storyId,
            seriesId: continuationData.seriesId,
            partNumber: continuationData.partNumber,
          },
          'Added mixed story continuation to series'
        );
      }
    }
    return { storyId };
  } catch (error) {
    logger.error(
      {
        err: error,
        requestId,
        storyId,
      },
      'Mixed story script/layout generation failed'
    );

    if (storyId) {
      const existingStory = await getStoryRepository().findById(storyId);
      if (existingStory?.title === 'Generating...') {
        await getStoryRepository().deleteStory(storyId, request.userId);
        logger.info({ requestId, storyId }, 'Deleted mixed story stub after failure');
      }
    }

    await getStoryRepository().updateRequest(requestId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      updatedAt: new Date(),
    });

    throw error;
  }
}

async function renderAndStorePage(params: {
  requestId: string;
  storyId: string;
  userId: string;
  generationKind?: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND;
  page: any;
  style: string;
  ageGroup: string;
  scenarioCardId?: string;
  environments: StoryEnvironment[];
  characters: GraphicNovelCharacterManifest;
  storyArtifactReference?: GraphicNovelStoryArtifactReference | null;
  createCoverCandidate?: boolean;
}): Promise<RenderedGraphicNovelPageAssets> {
  if (graphicNovelPageRenderTestOverride) {
    return graphicNovelPageRenderTestOverride(params);
  }

  const pageStartedAt = new Date();
  const plannedPage = params.page.layoutJson as PlannedGraphicNovelPage;
  bindLegacyPlannedPageCharacterIdentity(plannedPage, params.characters);
  const complexImageDomain = getComplexImageDomainService();
  const panelImageDomain = getImageDomainService();
  const panelImageProvider = config.image.simpleProvider || 'nanobananapro';
  const panelImageModel = config.image.simpleModel || 'gemini-3.1-flash-lite-image';
  const comicPanelImageSize: GenerateImageRequest['imageSize'] = '1K';
  const pageSize = pageSizeForGraphicNovelPage(plannedPage);
  const environmentsById = environmentMapForPage(plannedPage, params.environments);
  const environmentReferenceImages = await buildPageEnvironmentReferenceImages({
    storyId: params.storyId,
    storyRequestId: params.requestId,
    userId: params.userId,
    page: plannedPage,
    environments: params.environments,
    generationKind: params.generationKind,
  });
  const storyArtifactReferenceImage = await buildStoryArtifactReferenceImage(
    params.storyArtifactReference
  );
  const characterReferenceImages = await buildPageCharacterReferenceImages({
    page: plannedPage,
    characters: params.characters,
    imageDomain: complexImageDomain,
  });
  const dressedTurnaroundReferenceImages = await buildPageDressedTurnaroundReferenceImages({
    storyId: params.storyId,
    storyRequestId: params.requestId,
    userId: params.userId,
    generationKind: params.generationKind,
    page: plannedPage,
    characters: params.characters,
    environmentsById,
    characterReferences: characterReferenceImages,
    imageDomain: complexImageDomain,
    style: params.style,
    ageGroup: params.ageGroup,
    scenarioCardId: params.scenarioCardId,
  });
  const characterReferencesForImage = [
    ...applySceneDressedTurnaroundOverrides(
      characterReferenceImages,
      dressedTurnaroundReferenceImages
    ),
    ...dressedTurnaroundReferenceImages,
  ];
  const objectReferenceImages = storyArtifactReferenceImage ? [storyArtifactReferenceImage] : [];
  const validationReferenceImages = [
    ...environmentReferenceImages,
    ...characterReferencesForImage,
    ...objectReferenceImages,
  ];
  const pageForImage = plannedPage;
  const referenceImages = prepareGraphicNovelPageReferences({
    storyId: params.storyId,
    pageNumber: plannedPage.pageNumber,
    environmentReferences: environmentReferenceImages,
    characterReferences: characterReferencesForImage,
    objectReferences: objectReferenceImages,
  });

  const renderGraphicNovelPageArtAttempt = async (
    pageGenerationAttempt: number
  ): Promise<RenderedGraphicNovelPageArt> => {
    if (config.image.skipGeneration) {
      const imageData = await composeGraphicNovelPanelArtPage(pageForImage, []);
      return {
        imageData,
        mimeType: 'image/png',
        generationParams: {
          mode: 'graphic_novel_template_panel_placeholder_only',
          skippedImageGeneration: true,
          pageGenerationAttempt,
          requestedPanelCount: pageForImage.panels.length,
          layoutMode: 'template_panel_composition',
          planningLayoutId: plannedPage.template.id,
          templateFamily: plannedPage.template.templateFamily ?? null,
          textRenderingMode: 'html_overlay',
          bubbleShapeRenderingMode:
            'script_fallback_svg_translucent_cloud_outline_rounded_rect_24_short_beaded_tail',
          referenceCount: referenceImages.length,
          characterReferenceCount: referenceImages.filter(
            (ref) => ref.referenceKind === 'character'
          ).length,
          objectReferenceCount: referenceImages.filter((ref) => ref.referenceKind === 'object')
            .length,
          environmentReferenceCount: environmentReferenceImages.length,
          dressedTurnaroundReferenceCount: dressedTurnaroundReferenceImages.length,
        },
      };
    }

    const panelArt = await Promise.all(
      pageForImage.panels.map(async (panel, index) => {
        const cropRect = pixelCropRectFromNormalizedRect(
          panel.templatePanel.rect,
          pageSize.width,
          pageSize.height
        );
        const expectedCharacters = buildGraphicNovelExpectedCharactersForPanel({
          panel,
          characters: params.characters,
          dressedTurnaroundValidationNames: new Set<string>(),
        });
        const panelReferenceImages = selectGraphicNovelPanelReferenceImagesForGeneration({
          storyId: params.storyId,
          pageNumber: plannedPage.pageNumber,
          environmentReferences: environmentReferenceImages,
          characterReferences: characterReferencesForImage,
          objectReferences: objectReferenceImages,
          expectedCharacters,
          panel,
          storyArtifactReference: params.storyArtifactReference,
          characters: params.characters,
        });
        const operation =
          pageGenerationAttempt === 1
            ? 'graphic_novel_template_panel_generate'
            : 'graphic_novel_template_panel_regenerate';
        const generated = await generateGraphicNovelPanelCrop({
          imageDomain: panelImageDomain,
          page: pageForImage,
          panelIndex: index,
          cropRect,
          style: params.style,
          ageGroup: params.ageGroup,
          scenarioCardId: params.scenarioCardId,
          environmentsById,
          referenceImages: panelReferenceImages,
          storyArtifactReference: params.storyArtifactReference,
          userId: params.userId,
          storyId: params.storyId,
          operation,
          imageSize: comicPanelImageSize,
        });
        await saveGraphicNovelDebugImage({
          pageNumber: params.page.pageNumber,
          label: `template-panel-${index + 1}-attempt-${pageGenerationAttempt}`,
          imageData: generated.imageData,
        });
        const panelAttemptAsset = await saveGraphicNovelPanelAttemptAsset({
          storyId: params.storyId,
          userId: params.userId,
          requestId: params.requestId,
          pageNumber: params.page.pageNumber,
          panelIndex: index + 1,
          panelId: panel.script.panelId,
          attempt: pageGenerationAttempt,
          operation,
          source: 'template_panel_generate',
          imageData: generated.imageData,
          mimeType: generated.mimeType || 'image/png',
          cropRect,
        });
        const imageRequestManifest = annotateGraphicNovelRequestManifest(
          generated.requestManifest,
          {
            providerRoute: 'simple',
            provider: panelImageProvider,
            model: panelImageModel,
            providerInteractionId: generated.providerInteractionId ?? null,
          }
        );
        const panelImageRequestManifest = imageRequestManifest
          ? {
              ...imageRequestManifest,
              panelImageAssetId: panelAttemptAsset.assetId,
              panelImageStoragePath: panelAttemptAsset.storagePath,
              panelImageUrl:
                panelAttemptAsset.storageUrl ?? `/api/v1/assets/${panelAttemptAsset.storagePath}`,
              panelImageMimeType: panelAttemptAsset.mimeType,
              panelImageFileSizeBytes: panelAttemptAsset.fileSizeBytes,
            }
          : null;

        return {
          panelId: panel.script.panelId,
          panelIndex: index + 1,
          imageData: generated.imageData,
          mimeType: generated.mimeType,
          cropRect,
          aspectRatio: aspectRatioForCropRect(cropRect),
          referenceCount: panelReferenceImages.length,
          characterReferenceCount: panelReferenceImages.filter(
            (ref) => ref.referenceKind === 'character'
          ).length,
          objectReferenceCount: panelReferenceImages.filter((ref) => ref.referenceKind === 'object')
            .length,
          providerInteractionId: generated.providerInteractionId ?? null,
          panelImageAssetId: panelAttemptAsset.assetId,
          panelImageStoragePath: panelAttemptAsset.storagePath,
          panelImageUrl:
            panelAttemptAsset.storageUrl ?? `/api/v1/assets/${panelAttemptAsset.storagePath}`,
          panelImageMimeType: panelAttemptAsset.mimeType,
          panelImageFileSizeBytes: panelAttemptAsset.fileSizeBytes,
          imageRequestManifest: panelImageRequestManifest,
        };
      })
    );
    const imageData = await composeGraphicNovelPanelArtPage(pageForImage, panelArt);
    const imageRequestManifests = compactGraphicNovelRequestManifests(
      ...panelArt.map((panel) => panel.imageRequestManifest)
    );

    return {
      imageData,
      mimeType: 'image/png',
      panelImages: panelArt.map((panel) => ({
        panelIndex: panel.panelIndex,
        panelId: panel.panelId,
        imageData: Buffer.from(panel.imageData),
        mimeType: 'image/png',
      })),
      generationParams: {
        mode: 'graphic_novel_template_panel_compose',
        renderingMode: 'template_panel_images',
        layoutMode: 'template_panel_composition',
        pageGenerationAttempt,
        requestedPanelCount: pageForImage.panels.length,
        planningLayoutId: plannedPage.template.id,
        templateFamily: plannedPage.template.templateFamily ?? null,
        textRenderingMode: 'html_overlay',
        bubbleShapeRenderingMode:
          'script_fallback_svg_translucent_cloud_outline_rounded_rect_24_short_beaded_tail',
        panelImageSize: comicPanelImageSize,
        initialImageProviderRoute: 'simple',
        initialImageProvider: panelImageProvider,
        initialImageModel: panelImageModel,
        finalArtProviderRoute: 'simple',
        finalArtProvider: panelImageProvider,
        finalArtModel: panelImageModel,
        referenceCount: referenceImages.length,
        characterReferenceCount: referenceImages.filter((ref) => ref.referenceKind === 'character')
          .length,
        objectReferenceCount: referenceImages.filter((ref) => ref.referenceKind === 'object')
          .length,
        environmentReferenceCount: environmentReferenceImages.length,
        dressedTurnaroundReferenceCount: dressedTurnaroundReferenceImages.length,
        panelImageGeneration: {
          mode: 'parallel_template_panel_generate_then_compose',
          providerRoute: 'simple',
          provider: panelImageProvider,
          model: panelImageModel,
          imageSize: comicPanelImageSize,
          panelCount: panelArt.length,
          panels: panelArt.map((panel) => ({
            panelId: panel.panelId,
            panelIndex: panel.panelIndex,
            cropRect: panel.cropRect,
            aspectRatio: panel.aspectRatio,
            referenceCount: panel.referenceCount,
            characterReferenceCount: panel.characterReferenceCount,
            objectReferenceCount: panel.objectReferenceCount,
            providerInteractionId: panel.providerInteractionId,
            panelImageAssetId: panel.panelImageAssetId,
            panelImageStoragePath: panel.panelImageStoragePath,
            panelImageUrl: panel.panelImageUrl,
            panelImageMimeType: panel.panelImageMimeType,
            panelImageFileSizeBytes: panel.panelImageFileSizeBytes,
          })),
        },
        imageRequestManifests,
      },
    };
  };

  const artValidationAttempts: Array<{
    result: GraphicNovelRenderedPageValidation;
    imageData: Buffer;
    mimeType: string;
  }> = [];
  let pageGenerationAttempt = 1;
  let rendered = await renderGraphicNovelPageArtAttempt(pageGenerationAttempt);
  let firstArtValidationResult: GraphicNovelRenderedPageValidation | null = null;

  while (true) {
    const validationResult = await validateGraphicNovelRenderedPage({
      imageDomain: panelImageDomain,
      imageData: Buffer.from(rendered.imageData),
      page: pageForImage,
      characters: params.characters,
      referenceImages: validationReferenceImages,
      storyArtifactReference: params.storyArtifactReference,
      userId: params.userId,
      storyId: params.storyId,
      requestId: params.requestId,
      style: params.style,
      ageGroup: params.ageGroup,
      scenarioCardId: params.scenarioCardId,
      environmentsById,
      attempt: pageGenerationAttempt,
      imageSize: comicPanelImageSize,
      panelImages: rendered.panelImages,
    });

    if (!validationResult) {
      break;
    }

    artValidationAttempts.push({
      result: validationResult,
      imageData: Buffer.from(validationResult.imageData ?? rendered.imageData),
      mimeType: validationResult.mimeType ?? rendered.mimeType,
    });

    firstArtValidationResult = validationResult;
    if (validationResult.imageData) {
      const validationPanelImages =
        bubbleVisionPanelImagesFromValidations(validationResult.panelValidations) ??
        rendered.panelImages;
      if (!validationPanelImages || validationPanelImages.length !== pageForImage.panels.length) {
        throw new Error(
          `Missing validated panel images for graphic novel page ${pageForImage.pageNumber}: expected ${pageForImage.panels.length}, got ${validationPanelImages?.length ?? 0}`
        );
      }
      rendered = {
        ...rendered,
        imageData: validationResult.imageData,
        mimeType: validationResult.mimeType || 'image/png',
        panelImages: validationPanelImages,
        generationParams: {
          ...rendered.generationParams,
          panelRepair: validationResult.panelRepairSummary ?? null,
        },
      };
    }
    break;
  }

  rendered = {
    ...rendered,
    imageData: await normalizeGraphicNovelPageImageForCanvas(
      Buffer.from(rendered.imageData),
      pageForImage
    ),
    mimeType: 'image/png',
    generationParams: {
      ...rendered.generationParams,
      normalizedPageCanvas: {
        width: pageSize.width,
        height: pageSize.height,
        mimeType: 'image/png',
        mode: 'pre_validation_panel_repair_canvas',
      },
    },
  };
  await saveGraphicNovelDebugImage({
    pageNumber: params.page.pageNumber,
    label: 'art-only',
    imageData: Buffer.from(rendered.imageData),
  });

  const selectedArtValidationResult = firstArtValidationResult;
  const validationRepairSummary: Record<string, unknown> = {
    enabled: config.image.enableValidation,
    mode: 'template_panel_validation_repair',
    panelEditRepairEnabled: config.image.validationUseEditRepair,
    attempted: false,
    selectedAttempt: selectedArtValidationResult?.attempt ?? 1,
    selectedScore: selectedArtValidationResult?.score ?? null,
    attempts: [summarizeGraphicNovelValidationAttempt(firstArtValidationResult)].filter(Boolean),
  };

  if (
    !config.image.skipGeneration &&
    (!rendered.panelImages || rendered.panelImages.length !== pageForImage.panels.length)
  ) {
    throw new Error(
      `Missing final panel images for graphic novel page ${pageForImage.pageNumber}: expected ${pageForImage.panels.length}, got ${rendered.panelImages?.length ?? 0}`
    );
  }

  const bubbleVision = await applyVisionBubblePlacementForRenderedPage({
    page: plannedPage,
    userId: params.userId,
    storyId: params.storyId,
    panelImages: rendered.panelImages,
  });
  const artOnlyImageData = Buffer.from(rendered.imageData);
  const assetStorage = getAssetStorageService();
  const artOnlyUploadResult = await assetStorage.uploadAsset({
    data: artOnlyImageData,
    mimeType: rendered.mimeType,
    userId: params.userId,
    storyId: params.storyId,
    assetType: 'image',
  });
  const finalPlannedPage = bubbleVision.page;
  const finalImage = await overlayGraphicNovelBubblesOnly(artOnlyImageData, finalPlannedPage);
  const layoutValidation = selectedArtValidationResult?.validation ?? null;
  const layoutValidationScore = selectedArtValidationResult?.score ?? null;
  const layoutValidationAttempt = selectedArtValidationResult?.attempt ?? 1;
  const generationParams: Record<string, unknown> = {
    ...rendered.generationParams,
    bubblePlacement: bubbleVision.placementSummary,
    bubbleVisionAnalysis: bubbleVision.analysis,
    artValidationRepair: validationRepairSummary,
    artOnlyImageStoragePath: artOnlyUploadResult.storagePath,
    artOnlyImageMimeType: rendered.mimeType,
    artOnlyImageFileSizeBytes: artOnlyUploadResult.fileSizeBytes,
    finalOverlayMode: 'bubbles_only',
    finalOverlayApplied: true,
    deterministicOverlayApplied: true,
    bubbleShapeRenderingMode:
      'post_art_vision_svg_translucent_cloud_outline_rounded_rect_24_short_beaded_tail',
  };

  const uploadResult = await assetStorage.uploadAsset({
    data: finalImage,
    mimeType: 'image/png',
    userId: params.userId,
    storyId: params.storyId,
    assetType: 'image',
  });

  const asset = await getAssetRepository().create({
    storyId: params.storyId,
    sceneId: null,
    assetType: 'image',
    storagePath: uploadResult.storagePath,
    storageUrl: uploadResult.storageUrl,
    signedUrl: uploadResult.signedUrl,
    signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
    mimeType: 'image/png',
    fileSizeBytes: uploadResult.fileSizeBytes,
    generationParams: {
      ...generationParams,
      kind: 'graphic_novel_page',
      pageNumber: params.page.pageNumber,
      requestId: params.requestId,
      storyFormat: params.generationKind ?? GRAPHIC_NOVEL_KIND,
    },
    generationTimeMs: Date.now() - pageStartedAt.getTime(),
    status: 'completed',
  });

  await saveThumbnail(asset.id, uploadResult.storagePath, finalImage);
  for (const attempt of artValidationAttempts) {
    if (!layoutValidation || attempt.result.attempt === layoutValidationAttempt) continue;
    const attemptStoragePath = await saveGraphicNovelValidationAttemptImage({
      storyId: params.storyId,
      userId: params.userId,
      pageNumber: params.page.pageNumber,
      attempt: attempt.result.attempt,
      imageData: attempt.imageData,
      mimeType: attempt.mimeType,
      feedback: attempt.result.validation.overallFeedback ?? '',
    });
    if (!attemptStoragePath) continue;
    await persistGraphicNovelPanelValidationResults({
      storyId: params.storyId,
      pageNumber: params.page.pageNumber,
      attempt: attempt.result.attempt,
      imageStoragePath: attemptStoragePath,
      panelValidations: attempt.result.panelValidations,
    });
  }
  if (layoutValidation) {
    await persistGraphicNovelPanelValidationResults({
      storyId: params.storyId,
      pageNumber: params.page.pageNumber,
      attempt: layoutValidationAttempt,
      imageStoragePath: artOnlyUploadResult.storagePath,
      panelValidations: selectedArtValidationResult?.panelValidations,
    });
  }

  await getGraphicNovelRepository().updatePage(params.page.id, {
    imageAssetId: asset.id,
    imageUrl: uploadResult.storageUrl,
    layoutJson: finalPlannedPage,
    bubbleLayoutJson: buildGraphicNovelBubbleLayoutJson(
      finalPlannedPage,
      typeof bubbleVision.placementSummary.mode === 'string' &&
        bubbleVision.placementSummary.mode.startsWith('post_art_vision')
        ? 'post_art_vision'
        : 'script_fallback'
    ),
    status: 'completed',
    generationParams: {
      ...(params.page.generationParams as Record<string, unknown> | null),
      ...generationParams,
      assetId: asset.id,
      storagePath: uploadResult.storagePath,
      completedAt: new Date().toISOString(),
    },
  });

  const pagePanels = await getGraphicNovelRepository().findPanelsByPageId(params.page.id);
  await Promise.all(
    pagePanels.map((panelRow) => {
      const plannedPanel = finalPlannedPage.panels[panelRow.panelIndex - 1];
      if (!plannedPanel) return Promise.resolve();
      return getGraphicNovelRepository().updatePanel(panelRow.id, {
        bubbleGeometry: plannedPanel.bubbles,
      });
    })
  );

  let coverAssetId: string | undefined;
  let coverSource: RenderedGraphicNovelPageAssets['coverSource'];
  if (params.createCoverCandidate === true) {
    try {
      const coverAsset = await createGraphicNovelCoverPanelAsset({
        storyId: params.storyId,
        userId: params.userId,
        requestId: params.requestId,
        page: finalPlannedPage,
        pageAssetId: asset.id,
        panelImages: rendered.panelImages,
      });
      coverAssetId = coverAsset?.assetId;
      coverSource = coverAsset?.source;
    } catch (error) {
      logger.warn(
        { err: error, storyId: params.storyId, pageNumber: params.page.pageNumber },
        'Graphic novel cover panel selection failed'
      );
    }
  }

  await recordStageTiming({
    storyId: params.storyId,
    storyRequestId: params.requestId,
    userId: params.userId,
    generationKind: params.generationKind ?? GRAPHIC_NOVEL_KIND,
    pipelinePhase: 'asset_generation',
    operation: 'comic_page_image',
    targetType: 'comic_page',
    targetKey: String(params.page.pageNumber),
    pageNumber: params.page.pageNumber,
    assetId: asset.id,
    provider:
      typeof generationParams.finalArtProvider === 'string'
        ? generationParams.finalArtProvider
        : null,
    model:
      typeof generationParams.finalArtModel === 'string' ? generationParams.finalArtModel : null,
    startedAt: pageStartedAt,
    completedAt: new Date(),
    metadata: {
      layoutMode: 'template_panel_composition',
      planningLayoutId: plannedPage.template.id,
      pageRole: plannedPage.pageRole,
      panelCount: plannedPage.panels.length,
      referenceCount: referenceImages.length,
      environmentReferenceCount: environmentReferenceImages.length,
      characterReferenceCount: characterReferencesForImage.length,
      dressedTurnaroundReferenceCount: dressedTurnaroundReferenceImages.length,
      bubblePlacementMode:
        typeof bubbleVision.placementSummary.mode === 'string'
          ? bubbleVision.placementSummary.mode
          : null,
      validationScore: layoutValidationScore,
      validationAttempt: layoutValidationAttempt,
      createCoverCandidate: params.createCoverCandidate === true,
      coverAssetId: coverAssetId ?? null,
    },
  });

  return {
    pageAssetId: asset.id,
    coverAssetId,
    coverSource,
  };
}

async function saveGraphicNovelDebugImage(params: {
  pageNumber: number;
  label: string;
  imageData: Buffer;
}): Promise<void> {
  const outputDir = process.env.GRAPHIC_NOVEL_DEBUG_OUTPUT_DIR;
  if (!outputDir) return;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, `page-${params.pageNumber}-${params.label}.png`),
    params.imageData
  );
}

async function saveGraphicNovelValidationAttemptImage(params: {
  storyId: string;
  userId: string;
  pageNumber: number;
  attempt: number;
  imageData: Buffer;
  mimeType: string;
  feedback: string;
}): Promise<string | null> {
  try {
    const ext = params.mimeType.includes('png') ? '.png' : '.jpg';
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const rejectedDir = path.join(
      uploadsDir,
      config.nodeEnv,
      params.userId,
      params.storyId,
      'rejected'
    );
    await fs.mkdir(rejectedDir, { recursive: true });

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baseName = `graphic_page${params.pageNumber}_attempt${params.attempt}_${suffix}`;
    const imageFilename = `${baseName}${ext}`;
    const imagePath = path.join(rejectedDir, imageFilename);
    await fs.writeFile(imagePath, params.imageData);

    if (params.feedback.trim()) {
      await fs.writeFile(path.join(rejectedDir, `${baseName}.txt`), params.feedback, 'utf-8');
    }

    const storagePath = `${config.nodeEnv}/${params.userId}/${params.storyId}/rejected/${imageFilename}`;
    logger.debug(
      {
        storyId: params.storyId,
        pageNumber: params.pageNumber,
        attempt: params.attempt,
        storagePath,
        size: params.imageData.length,
      },
      'Graphic novel non-selected validation attempt image saved'
    );
    return storagePath;
  } catch (error) {
    logger.warn(
      {
        err: error,
        storyId: params.storyId,
        pageNumber: params.pageNumber,
        attempt: params.attempt,
      },
      'Failed to save graphic novel non-selected validation attempt image'
    );
    return null;
  }
}

export function shouldCompleteGraphicNovelRequestAfterPage(params: {
  pageNumber: number;
  firstPageReady: boolean;
}): boolean {
  return params.pageNumber === 1 && !params.firstPageReady;
}

function replanGraphicNovelPageFromSavedScript(params: {
  savedPage: PlannedGraphicNovelPage;
  ageGroup: string;
  storyFormat?: string;
  bubbleTextSizing?: GraphicNovelBubbleTextSizing;
}): PlannedGraphicNovelPage {
  const scenePanels = params.savedPage.panels.map((panel) => panel.script);
  const [page] = planGraphicNovelLayouts({
    ageGroup: params.ageGroup,
    pages: [
      {
        pageNumber: params.savedPage.pageNumber,
        pageRole: params.savedPage.pageRole,
        panels: scenePanels,
      },
    ],
    outfits: params.savedPage.outfits,
    preservePanelCount: true,
    bubbleTextSizing: params.bubbleTextSizing,
  });

  if (!page) {
    throw new Error(`Failed to plan graphic novel page ${params.savedPage.pageNumber}`);
  }

  if (
    page.panels.length !== scenePanels.length ||
    page.template.panelCount !== scenePanels.length
  ) {
    throw new Error(
      `Layout/panel mismatch after planning page ${params.savedPage.pageNumber}: ` +
        `layout=${page.template.id} panels=${page.template.panelCount}, ` +
        `scenes=${scenePanels.length}, plannedPanels=${page.panels.length}`
    );
  }

  return page;
}

export async function regenerateGraphicNovelPageImage(params: {
  storyId: string;
  pageNumber: number;
  style?: string;
}): Promise<RenderedGraphicNovelPageAssets> {
  const story = await getStoryRepository().findById(params.storyId);
  if (!story) {
    throw new Error(`Story ${params.storyId} not found`);
  }

  const storyMetadata = (story.metadata as Record<string, unknown> | null) || {};
  if (
    storyMetadata.storyFormat !== GRAPHIC_NOVEL_KIND &&
    storyMetadata.storyFormat !== MIXED_STORY_KIND
  ) {
    throw new Error(`Story ${params.storyId} is not a graphic novel or mixed story`);
  }

  const project = await getGraphicNovelRepository().findProjectByStoryId(params.storyId);
  if (!project) {
    throw new Error(`Graphic novel project for story ${params.storyId} not found`);
  }

  const pageRow = await getGraphicNovelRepository().findPageByProjectAndNumber(
    project.id,
    params.pageNumber
  );
  if (!pageRow) {
    throw new Error(
      `Graphic novel page ${params.pageNumber} for story ${params.storyId} not found`
    );
  }

  const savedPage = pageRow.layoutJson as PlannedGraphicNovelPage;
  if (!savedPage || !Array.isArray(savedPage.panels) || savedPage.panels.length < 1) {
    throw new Error(`Graphic novel page ${params.pageNumber} has no saved panel script`);
  }

  const ageGroup = project.ageGroup || story.ageGroup || '6-8';
  const layoutAgeGroup = (storyMetadata.storyComplexityAgeGroup as string | undefined) || ageGroup;
  const readingTextSettings = await resolveGraphicNovelReadingTextSettings({
    ageGroup,
    userId: story.userId,
    childProfileId: story.childProfileId ?? story.createdByChildProfileId ?? null,
  });
  let layoutManifest =
    (project.layoutManifest as { characters?: GraphicNovelCharacterManifest } | null) || {};
  const generationKind =
    storyMetadata.storyFormat === MIXED_STORY_KIND ? MIXED_STORY_KIND : GRAPHIC_NOVEL_KIND;
  const script = project.scriptJson as ComicScriptWithCharacters;
  const manifestState = await ensureGraphicNovelProjectManifestCharacters({
    project,
    story,
    userId: story.userId,
    generationKind,
    script,
    imageStyle: params.style || (storyMetadata.imageStyle as string | undefined),
  });
  layoutManifest = manifestState.layoutManifest as { characters?: GraphicNovelCharacterManifest };
  const plannedPageWithoutAliases = replanGraphicNovelPageFromSavedScript({
    savedPage,
    ageGroup: layoutAgeGroup,
    storyFormat: storyMetadata.storyFormat as string | undefined,
    bubbleTextSizing: readingTextSettings.bubbleTextSizing,
  });
  const plannedPage: PlannedGraphicNovelPage = {
    ...plannedPageWithoutAliases,
    characterAliases:
      savedPage.characterAliases ||
      buildGraphicNovelCharacterAliasMap(layoutManifest.characters || []),
  };

  const generationParams = {
    ...(pageRow.generationParams as Record<string, unknown> | null),
    adminRegeneration: true,
    adminRegenerationSource: 'graphic_novel_page_endpoint',
    adminRegeneratedAt: new Date().toISOString(),
    previousPlanningLayoutId: savedPage.template?.id ?? null,
    selectedPlanningLayoutId: plannedPage.template.id,
    graphicNovelBubbleTextSizing: readingTextSettings.bubbleTextSizing,
  };

  await getGraphicNovelRepository().updatePage(pageRow.id, {
    status: 'generating',
    errorMessage: null,
    pageRole: plannedPage.pageRole,
    layoutJson: plannedPage,
    generationParams,
  });

  const pageForRender = {
    ...pageRow,
    status: 'generating',
    errorMessage: null,
    pageRole: plannedPage.pageRole,
    layoutJson: plannedPage,
    generationParams,
  };
  const hasGraphicNovelCover = await hasReusableGraphicNovelCover(
    storyMetadata,
    story.coverAssetId
  );

  try {
    const renderedAssets = await renderAndStorePage({
      requestId: project.storyRequestId || `admin-regenerate-${params.storyId}`,
      storyId: params.storyId,
      userId: story.userId,
      generationKind,
      page: pageForRender,
      style: params.style || (storyMetadata.imageStyle as string | undefined) || 'soft_watercolor',
      ageGroup,
      scenarioCardId: storyMetadata.scenarioCardId as string | undefined,
      environments: script.environments || [],
      characters: layoutManifest.characters || [],
      storyArtifactReference: storyArtifactReferenceFromManifest(layoutManifest, storyMetadata),
      createCoverCandidate: !hasGraphicNovelCover,
    });

    if (renderedAssets.coverAssetId) {
      const latestStoryForCover = await getStoryRepository().findById(params.storyId);
      await getStoryRepository().updateStory(params.storyId, {
        coverAssetId: renderedAssets.coverAssetId,
        metadata: {
          ...((latestStoryForCover?.metadata as Record<string, unknown> | null) || {}),
          graphicNovelCoverSource:
            renderedAssets.coverSource ?? 'matching_story_card_aspect_ratio_panel',
          graphicNovelCoverPageNumber: params.pageNumber,
          graphicNovelCoverPanelAssetId: renderedAssets.coverAssetId,
          graphicNovelCoverPending: false,
        },
      });
    }

    const pages = await getGraphicNovelRepository().findPagesByProjectId(project.id);
    const failedPages = pages
      .filter((page) => page.status === 'failed' && page.pageNumber !== params.pageNumber)
      .map((page) => ({
        pageNumber: page.pageNumber,
        errorMessage: page.errorMessage || 'Page generation failed',
      }));
    const generationComplete = pages.every(
      (page) =>
        page.pageNumber === params.pageNumber ||
        page.status === 'completed' ||
        page.status === 'failed'
    );

    await getGraphicNovelRepository().updateProject(project.id, {
      status: generationComplete
        ? failedPages.length > 0
          ? 'completed_with_errors'
          : 'completed'
        : 'generating',
    });
    const latestStory = await getStoryRepository().findById(params.storyId);
    await getStoryRepository().updateStory(params.storyId, {
      metadata: {
        ...((latestStory?.metadata as Record<string, unknown> | null) || {}),
        firstPageReady: true,
        graphicNovelGenerationComplete: generationComplete,
        ...(failedPages.length > 0
          ? { failedGraphicNovelPages: failedPages }
          : { failedGraphicNovelPages: [] }),
      },
    });

    logger.info(
      {
        storyId: params.storyId,
        pageNumber: params.pageNumber,
        planningLayoutId: plannedPage.template.id,
        assetId: renderedAssets.pageAssetId,
      },
      'Admin graphic novel page regeneration completed'
    );

    return renderedAssets;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await getGraphicNovelRepository().updatePage(pageRow.id, {
      status: 'failed',
      errorMessage: message,
      generationParams: {
        ...generationParams,
        failedAt: new Date().toISOString(),
        errorMessage: message,
      },
    });
    throw error;
  }
}

const MANUAL_PANEL_SUBJECT_REPLACEMENT_KINDS = new Set<ImageEditRepairIssueKind>([
  'presence',
  'head',
  'face',
  'hair',
  'age',
  'body',
  'design',
  'silhouette',
  'colors',
  'outfit',
]);

const MANUAL_PANEL_EDIT_MAX_ATTEMPTS = 2;

function compactManualPanelRepairComment(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function manualPanelRepairInstructionForKind(kind: ImageEditRepairIssueKind): string {
  switch (kind) {
    case 'presence':
      return 'Add only the missing expected subject from the selected visual reference.';
    case 'duplicate':
      return 'Remove only the duplicate copy of the expected subject.';
    case 'head':
    case 'face':
    case 'hair':
    case 'age':
    case 'body':
    case 'design':
    case 'silhouette':
    case 'colors':
    case 'outfit':
      return 'Replace the selected mismatched subject with the matching visual reference.';
    case 'unexpected':
      return 'Remove only the unexpected extra subject.';
    case 'text':
      return 'Remove only visible text or lettering.';
    case 'generic':
    default:
      return 'Correct only the selected visual mismatch.';
  }
}

function resolveManualPanelRepairCharacter(params: {
  issue: GraphicNovelPanelRepairIssue;
  characters: GraphicNovelCharacterManifest;
  panel: PlannedGraphicNovelPage['panels'][number];
}): GraphicNovelCharacterManifest[number] | null {
  const character = params.issue.characterId
    ? params.characters.find((candidate) => candidate.id === params.issue.characterId)
    : params.issue.characterName
      ? characterManifestForPageName(params.characters, params.issue.characterName)
      : undefined;
  if (!character) {
    if (params.issue.characterId || params.issue.characterName) {
      throw new Error(
        `Panel repair character ${params.issue.characterId || params.issue.characterName} is not in the graphic novel manifest`
      );
    }
    return null;
  }

  const expectedNames = new Set(
    panelCharacterNames(params.panel.script).map(normalizeCharacterName)
  );
  const expectedRefs = new Set(panelCharacterRefs(params.panel.script));
  if (!characterManifestMatchesPage(character, expectedNames, expectedRefs, params.characters)) {
    throw new Error(
      `Panel repair character ${character.id || character.name} is not expected in the selected panel`
    );
  }
  return character;
}

function manualPanelRepairReferenceMode(
  issues: GraphicNovelPanelRepairIssue[]
): ImageEditRepairManifest['referenceMode'] {
  const hasOutfit = issues.some((issue) => issue.kind === 'outfit');
  const hasIdentity = issues.some(
    (issue) => MANUAL_PANEL_SUBJECT_REPLACEMENT_KINDS.has(issue.kind) && issue.kind !== 'outfit'
  );
  if (hasIdentity && hasOutfit) return 'identity_and_outfit';
  if (hasIdentity) return 'identity';
  if (hasOutfit) return 'outfit';
  return 'none';
}

function buildManualPanelRepairManifest(params: {
  target: GraphicNovelPanelRepairTarget;
  panel: PlannedGraphicNovelPage['panels'][number];
  characters: GraphicNovelCharacterManifest;
}): ImageEditRepairManifest {
  const replacements = new Map<
    string,
    NonNullable<ImageEditRepairManifest['subjectReplacements']>[number]
  >();

  for (const issue of params.target.issues) {
    if (!MANUAL_PANEL_SUBJECT_REPLACEMENT_KINDS.has(issue.kind)) continue;
    const character = resolveManualPanelRepairCharacter({
      issue,
      characters: params.characters,
      panel: params.panel,
    });
    if (!character) continue;
    const key = character.id || normalizeCharacterName(character.name);
    const current = replacements.get(key);
    replacements.set(key, {
      characterName: character.name,
      referenceId: character.referenceBindingId,
      sceneSlotDescription: manualPanelCharacterSceneSlotDescription(params.panel, character.name),
      found: issue.kind !== 'presence',
      repairKinds: [
        ...new Set([...(current?.repairKinds ?? []), issue.kind] as ImageEditRepairIssueKind[]),
      ],
    });
  }

  return {
    referenceMode: manualPanelRepairReferenceMode(params.target.issues),
    issues: params.target.issues.map((issue) => ({
      kind: issue.kind,
      note: manualPanelRepairInstructionForKind(issue.kind),
    })),
    subjectReplacements: [...replacements.values()],
  };
}

function manualPanelCharacterSceneSlotDescription(
  panel: PlannedGraphicNovelPage['panels'][number],
  characterName: string
): string {
  const composition = panel.script.visual.sceneVisual.cameraComposition;
  if (composition && typeof composition !== 'string') {
    const targetName = normalizeCharacterName(characterName);
    const character = composition.characters.find(
      (candidate) => normalizeCharacterName(candidate.name) === targetName
    );
    const description = character?.description?.replace(/\s+/g, ' ').trim();
    if (description) return description;
  }
  return panel.script.visual.primaryRead;
}

function buildManualPanelEditRepairPlan(params: {
  target: GraphicNovelPanelRepairTarget;
  page: PlannedGraphicNovelPage;
  panel: PlannedGraphicNovelPage['panels'][number];
  characters: GraphicNovelCharacterManifest;
  referenceImages: GraphicNovelReferenceImage[];
  currentValidation?: GraphicNovelPanelRenderedValidation | null;
}): {
  source: 'validator' | 'admin_fallback';
  references: ReturnType<typeof editableGraphicNovelReferences> | undefined;
  manifest: ImageEditRepairManifest;
} {
  if (
    params.currentValidation &&
    !graphicNovelPanelQualityDecision(params.currentValidation).accepted
  ) {
    const panelNumber = params.currentValidation.panelNumber;
    const sceneVisual = buildGraphicNovelPanelValidationSceneVisual({
      pageNumber: params.page.pageNumber,
      panelNumber,
      panel: params.panel,
    });
    const scene = graphicNovelPanelSceneData({
      page: params.page,
      panelNumber,
      panel: params.panel,
      sceneVisual,
    });
    const validatorPlan = buildTargetedEditRepairPlan(
      editableGraphicNovelReferences(params.referenceImages),
      params.currentValidation.validation,
      scene
    );
    if (validatorPlan.manifest.issues.length > 0) {
      return {
        source: 'validator',
        references: validatorPlan.references,
        manifest: validatorPlan.manifest,
      };
    }
  }

  return {
    source: 'admin_fallback',
    references: editableGraphicNovelReferences(params.referenceImages),
    manifest: buildManualPanelRepairManifest({
      target: params.target,
      panel: params.panel,
      characters: params.characters,
    }),
  };
}

async function refreshGraphicNovelManifestTurnarounds(params: {
  characters: GraphicNovelCharacterManifest;
  characterIds: string[];
  page: PlannedGraphicNovelPage;
  userId: string;
}): Promise<GraphicNovelCharacterManifest> {
  if (params.characterIds.length === 0) return params.characters;
  const pageNames = pageCharacterNameKeys(params.page);
  const pageRefs = pageCharacterRefKeys(params.page);
  const refreshed = params.characters.map((character) => ({
    ...character,
    references: character.references?.map((reference) => ({ ...reference })),
  }));

  for (const characterId of [...new Set(params.characterIds)]) {
    const manifestCharacter = refreshed.find((character) => character.id === characterId);
    if (!manifestCharacter) {
      throw new Error(`Turnaround refresh character ${characterId} is not in the story manifest`);
    }
    if (!characterManifestMatchesPage(manifestCharacter, pageNames, pageRefs, refreshed)) {
      throw new Error(`Turnaround refresh character ${characterId} is not used on this page`);
    }
    const currentCharacter = await getCharacterRepository().findById(characterId, params.userId);
    if (!currentCharacter) {
      throw new Error(`Turnaround refresh character ${characterId} was not found`);
    }
    const references = buildGraphicNovelCharacterReferences(
      currentCharacter,
      manifestCharacter.referenceBindingId
    );
    if (!references.some((reference) => reference.isTurnaround)) {
      throw new Error(`Turnaround refresh character ${characterId} has no current turnaround`);
    }
    manifestCharacter.references = references;
  }

  return refreshed;
}

async function cropGraphicNovelPagePanels(params: {
  imageData: Buffer;
  page: PlannedGraphicNovelPage;
}): Promise<GraphicNovelBubbleVisionPanelImage[]> {
  const pageSize = pageSizeForGraphicNovelPage(params.page);
  return Promise.all(
    params.page.panels.map(async (panel, index) => {
      const cropRect = pixelCropRectFromNormalizedRect(
        panel.templatePanel.rect,
        pageSize.width,
        pageSize.height
      );
      return {
        panelIndex: index + 1,
        panelId: panel.script.panelId,
        imageData: await sharp(params.imageData).extract(cropRect).png().toBuffer(),
        mimeType: 'image/png' as const,
      };
    })
  );
}

function graphicNovelPanelValidationReferenceContext(
  referenceImages: GraphicNovelReferenceImage[]
) {
  const validationReferenceImages = referenceImages
    .filter(
      (ref) =>
        ref.characterName && (ref.base64Data || ref.fileUri) && ref.referenceKind === 'character'
    )
    .map((ref) => ({
      characterName: ref.characterName!,
      characterId: ref.characterId,
      imageData: ref.base64Data,
      fileUri: ref.fileUri,
      mimeType: ref.mimeType || 'image/png',
      referenceKind: 'identity' as const,
      identitySource:
        ref.source === 'character_outfit_turnaround' || ref.type === 'dressed_turnaround_reference'
          ? ('dressed_turnaround' as const)
          : ref.isTurnaround
            ? ('turnaround' as const)
            : ('reference_photo' as const),
    }));
  return {
    validationReferenceImages,
    dressedTurnaroundValidationNames: new Set(
      validationReferenceImages
        .filter((ref) => ref.identitySource === 'dressed_turnaround')
        .map((ref) => normalizeCharacterName(ref.characterName))
        .filter(Boolean)
    ),
    validationRefNamesNormalized: new Set(
      validationReferenceImages.map((ref) =>
        stripCharacterIdFromName(ref.characterName).trim().toLowerCase()
      )
    ),
  };
}

function panelRepairFailedPanelsAfterRun(params: {
  previousPanelRepair: Record<string, unknown> | null;
  requestedPanelNumbers: Set<number>;
  failedPanels: Array<Record<string, unknown>>;
}): Array<Record<string, unknown>> {
  const previousFailedPanels = Array.isArray(params.previousPanelRepair?.failedPanels)
    ? params.previousPanelRepair.failedPanels
    : [];
  return [
    ...previousFailedPanels.filter(
      (failedPanel): failedPanel is Record<string, unknown> =>
        !!failedPanel &&
        typeof failedPanel === 'object' &&
        !params.requestedPanelNumbers.has(
          Number((failedPanel as Record<string, unknown>).panelNumber)
        )
    ),
    ...params.failedPanels,
  ];
}

export async function repairGraphicNovelPagePanels(
  params: GraphicNovelPanelRepairRequest
): Promise<{
  outcome: 'completed' | 'partial' | 'no_change';
  pageAssetId: string | null;
  panelResults: Array<{
    panelNumber: number;
    panelId: string;
    requestedMode: GraphicNovelPanelRepairTarget['mode'];
    appliedMode: GraphicNovelPanelRepairTarget['mode'] | null;
    accepted: boolean;
    score: number | null;
    failureReasons: string[];
  }>;
}> {
  const repairStartedAt = new Date();
  if (!params.panels.length) throw new Error('At least one panel repair target is required');
  const requestedPanelNumbers = new Set(params.panels.map((target) => target.panelNumber));
  if (requestedPanelNumbers.size !== params.panels.length) {
    throw new Error('Panel repair targets must use unique panel numbers');
  }

  const story = await getStoryRepository().findById(params.storyId);
  if (!story) throw new Error(`Story ${params.storyId} not found`);
  const storyMetadata = (story.metadata as Record<string, unknown> | null) || {};
  if (
    storyMetadata.storyFormat !== GRAPHIC_NOVEL_KIND &&
    storyMetadata.storyFormat !== MIXED_STORY_KIND
  ) {
    throw new Error(`Story ${params.storyId} is not a graphic novel or mixed story`);
  }

  const project = await getGraphicNovelRepository().findProjectByStoryId(params.storyId);
  if (!project) throw new Error(`Graphic novel project for story ${params.storyId} not found`);
  const pageRow = await getGraphicNovelRepository().findPageByProjectAndNumber(
    project.id,
    params.pageNumber
  );
  if (!pageRow) {
    throw new Error(
      `Graphic novel page ${params.pageNumber} for story ${params.storyId} not found`
    );
  }
  if (pageRow.status !== 'completed') {
    throw new Error(
      `Graphic novel page ${params.pageNumber} must be completed before panel repair`
    );
  }
  const page = pageRow.layoutJson as PlannedGraphicNovelPage;
  if (!page?.panels?.length) {
    throw new Error(`Graphic novel page ${params.pageNumber} has no saved panel layout`);
  }
  for (const target of params.panels) {
    const panel = page.panels[target.panelNumber - 1];
    if (!panel) throw new Error(`Graphic novel panel ${target.panelNumber} not found`);
    if (target.panelId && target.panelId !== panel.script.panelId) {
      throw new Error(`Graphic novel panel ${target.panelNumber} id does not match saved layout`);
    }
    if (!target.issues.length) {
      throw new Error(`Graphic novel panel ${target.panelNumber} has no repair issues`);
    }
    for (const issue of target.issues) {
      if (!compactManualPanelRepairComment(issue.comment)) {
        throw new Error(`Graphic novel panel ${target.panelNumber} has an empty repair comment`);
      }
    }
  }

  const pageGenerationParams = (pageRow.generationParams as Record<string, unknown> | null) || {};
  const sourceArtOnlyStoragePath = pageGenerationParams.artOnlyImageStoragePath;
  if (typeof sourceArtOnlyStoragePath !== 'string' || !sourceArtOnlyStoragePath.trim()) {
    throw new Error(`Graphic novel page ${params.pageNumber} has no reusable art-only image`);
  }
  const assetStorage = getAssetStorageService();
  const sourceArtOnly = await normalizeGraphicNovelPageImageForCanvas(
    await assetStorage.getAssetByPath(sourceArtOnlyStoragePath),
    page
  );
  const sourcePanelImages = await cropGraphicNovelPagePanels({ imageData: sourceArtOnly, page });

  const generationKind =
    storyMetadata.storyFormat === MIXED_STORY_KIND ? MIXED_STORY_KIND : GRAPHIC_NOVEL_KIND;
  const script = project.scriptJson as ComicScriptWithCharacters;
  const manifestState = await ensureGraphicNovelProjectManifestCharacters({
    project,
    story,
    userId: story.userId,
    generationKind,
    script,
    imageStyle: params.style || (storyMetadata.imageStyle as string | undefined),
  });
  const currentLayoutManifest = manifestState.layoutManifest as Record<string, any>;
  bindLegacyPlannedPageCharacterIdentity(page, manifestState.characters);
  const characters = await refreshGraphicNovelManifestTurnarounds({
    characters: manifestState.characters,
    characterIds: params.refreshTurnaroundCharacterIds ?? [],
    page,
    userId: story.userId,
  });

  const complexImageDomain = getComplexImageDomainService();
  const ageGroup = project.ageGroup || story.ageGroup || '6-8';
  const style =
    params.style || (storyMetadata.imageStyle as string | undefined) || 'soft_watercolor';
  const environmentsById = environmentMapForPage(page, script.environments || []);
  const environmentReferenceImages = await buildPageEnvironmentReferenceImages({
    storyId: params.storyId,
    storyRequestId: project.storyRequestId || undefined,
    userId: story.userId,
    page,
    environments: script.environments || [],
    generationKind,
  });
  const characterReferenceImages = await buildPageCharacterReferenceImages({
    page,
    characters,
    imageDomain: complexImageDomain,
    includeCharacterIds: params.refreshTurnaroundCharacterIds,
  });
  const dressedTurnaroundReferenceImages = await buildPageDressedTurnaroundReferenceImages({
    storyId: params.storyId,
    storyRequestId: project.storyRequestId || undefined,
    userId: story.userId,
    generationKind,
    page,
    characters,
    environmentsById,
    characterReferences: characterReferenceImages,
    imageDomain: complexImageDomain,
    style,
    ageGroup,
    scenarioCardId: storyMetadata.scenarioCardId as string | undefined,
  });
  const characterReferencesForImage = [
    ...applySceneDressedTurnaroundOverrides(
      characterReferenceImages,
      dressedTurnaroundReferenceImages
    ),
    ...dressedTurnaroundReferenceImages,
  ];
  const storyArtifactReference = storyArtifactReferenceFromManifest(
    currentLayoutManifest,
    storyMetadata
  );
  const storyArtifactReferenceImage =
    await buildStoryArtifactReferenceImage(storyArtifactReference);
  const objectReferenceImages = storyArtifactReferenceImage ? [storyArtifactReferenceImage] : [];
  const allReferenceImages = prepareGraphicNovelPageReferences({
    storyId: params.storyId,
    pageNumber: params.pageNumber,
    environmentReferences: environmentReferenceImages,
    characterReferences: characterReferencesForImage,
    objectReferences: objectReferenceImages,
  });
  const validationContext = graphicNovelPanelValidationReferenceContext([
    ...environmentReferenceImages,
    ...characterReferencesForImage,
    ...objectReferenceImages,
  ]);
  const pageSize = pageSizeForGraphicNovelPage(page);
  const manualRepairHistory = Array.isArray(pageGenerationParams.manualPanelRepairs)
    ? pageGenerationParams.manualPanelRepairs
    : [];
  const repairAttempt = manualRepairHistory.length + 1;
  const requestId = project.storyRequestId || `admin-panel-repair-${params.storyId}`;

  const panelResults = await Promise.all(
    params.panels.map(async (target) => {
      const panel = page.panels[target.panelNumber - 1];
      const attempts: Array<Record<string, unknown>> = [];
      try {
        const cropRect = pixelCropRectFromNormalizedRect(
          panel.templatePanel.rect,
          pageSize.width,
          pageSize.height
        );
        const detectedPanel: GraphicNovelDetectedPanelBounds = {
          panelNumber: target.panelNumber,
          panelId: panel.script.panelId,
          cropRect,
          normalizedRect: panel.templatePanel.rect,
          matchConfidence: 1,
          matchReason: 'admin_manual_panel_repair_saved_template_rect',
        };
        const expectedCharacters = buildGraphicNovelExpectedCharactersForPanel({
          panel,
          characters,
          dressedTurnaroundValidationNames: validationContext.dressedTurnaroundValidationNames,
        });
        for (const issue of target.issues) {
          resolveManualPanelRepairCharacter({ issue, characters, panel });
        }
        const panelReferenceImages = selectGraphicNovelPanelReferenceImagesForGeneration({
          storyId: params.storyId,
          pageNumber: params.pageNumber,
          environmentReferences: environmentReferenceImages,
          characterReferences: characterReferencesForImage,
          objectReferences: objectReferenceImages,
          expectedCharacters,
          panel,
          storyArtifactReference,
          characters,
        });
        const sourcePanelImage = sourcePanelImages[target.panelNumber - 1];
        if (!sourcePanelImage) throw new Error(`Source panel ${target.panelNumber} is unavailable`);
        const validationAttemptBase = repairAttempt * 100 + target.panelNumber * 10;
        const sourceOperation = 'graphic_novel_panel_manual_prevalidate';
        const sourceAsset = await saveGraphicNovelPanelAttemptAsset({
          storyId: params.storyId,
          userId: story.userId,
          requestId,
          pageNumber: params.pageNumber,
          panelIndex: target.panelNumber,
          panelId: panel.script.panelId,
          attempt: validationAttemptBase,
          operation: sourceOperation,
          source: 'manual_panel_repair',
          imageData: sourcePanelImage.imageData,
          mimeType: sourcePanelImage.mimeType,
          cropRect,
          repairMode: 'original',
        });
        const sourceRequestManifest = {
          operation: sourceOperation,
          requestedRepairMode: target.mode,
          adminRepairIssueKinds: target.issues.map((issue) => issue.kind),
          sourceArtOnlyStoragePath,
          panelImageAssetId: sourceAsset.assetId,
          panelImageStoragePath: sourceAsset.storagePath,
        };
        let currentValidation = await validateGraphicNovelPanelCrop({
          imageDomain: complexImageDomain,
          panelImage: sourcePanelImage.imageData,
          page,
          detectedPanel,
          panel,
          characters,
          validationReferenceImages: validationContext.validationReferenceImages,
          validationRefNamesNormalized: validationContext.validationRefNamesNormalized,
          dressedTurnaroundValidationNames: validationContext.dressedTurnaroundValidationNames,
          userId: story.userId,
          storyId: params.storyId,
          attempt: validationAttemptBase,
          repairMode: 'original',
          requestManifest: sourceRequestManifest,
        });
        await persistGraphicNovelPanelValidationResults({
          storyId: params.storyId,
          pageNumber: params.pageNumber,
          attempt: validationAttemptBase,
          imageStoragePath: sourceAsset.storagePath,
          panelValidations: [currentValidation],
        });
        attempts.push({
          sequence: 0,
          operation: sourceOperation,
          repairMode: 'original',
          score: currentValidation.score,
          accepted: graphicNovelPanelQualityDecision(currentValidation).accepted,
          requestManifest: sourceRequestManifest,
        });

        const validateCandidate = async (candidateParams: {
          generated: Awaited<ReturnType<typeof generateGraphicNovelPanelCrop>>;
          appliedMode: GraphicNovelPanelRepairTarget['mode'];
          sequence: number;
          repairPlanSource?: 'validator' | 'admin_fallback';
          repairManifest?: ImageEditRepairManifest;
        }) => {
          const operation =
            typeof candidateParams.generated.requestManifest?.operation === 'string'
              ? candidateParams.generated.requestManifest.operation
              : candidateParams.appliedMode === 'edit'
                ? 'graphic_novel_panel_manual_edit'
                : 'graphic_novel_panel_manual_regenerate';
          const validationAttempt = validationAttemptBase + candidateParams.sequence;
          const candidateAsset = await saveGraphicNovelPanelAttemptAsset({
            storyId: params.storyId,
            userId: story.userId,
            requestId,
            pageNumber: params.pageNumber,
            panelIndex: target.panelNumber,
            panelId: panel.script.panelId,
            attempt: validationAttempt,
            operation,
            source: 'manual_panel_repair',
            imageData: candidateParams.generated.imageData,
            mimeType: candidateParams.generated.mimeType,
            cropRect,
            repairMode: candidateParams.appliedMode,
          });
          const requestManifest = {
            ...(candidateParams.generated.requestManifest ?? {}),
            operation,
            requestedRepairMode: target.mode,
            appliedRepairMode: candidateParams.appliedMode,
            repairPlanSource: candidateParams.repairPlanSource,
            adminRepairIssueKinds: target.issues.map((issue) => issue.kind),
            ...(candidateParams.repairManifest
              ? { repairManifest: candidateParams.repairManifest }
              : {}),
            sourceArtOnlyStoragePath,
            panelImageAssetId: candidateAsset.assetId,
            panelImageStoragePath: candidateAsset.storagePath,
            panelImageUrl:
              candidateAsset.storageUrl ?? `/api/v1/assets/${candidateAsset.storagePath}`,
            panelImageMimeType: candidateAsset.mimeType,
            panelImageFileSizeBytes: candidateAsset.fileSizeBytes,
          };
          const validation = await validateGraphicNovelPanelCrop({
            imageDomain: complexImageDomain,
            panelImage: candidateParams.generated.imageData,
            page,
            detectedPanel,
            panel,
            characters,
            validationReferenceImages: validationContext.validationReferenceImages,
            validationRefNamesNormalized: validationContext.validationRefNamesNormalized,
            dressedTurnaroundValidationNames: validationContext.dressedTurnaroundValidationNames,
            userId: story.userId,
            storyId: params.storyId,
            attempt: validationAttempt,
            repairMode: candidateParams.appliedMode === 'regenerate' ? 'generate' : 'edit',
            requestManifest,
          });
          await persistGraphicNovelPanelValidationResults({
            storyId: params.storyId,
            pageNumber: params.pageNumber,
            attempt: validationAttempt,
            imageStoragePath: candidateAsset.storagePath,
            panelValidations: [validation],
          });
          const decision = graphicNovelPanelQualityDecision(validation);
          attempts.push({
            sequence: candidateParams.sequence,
            operation,
            repairMode: candidateParams.appliedMode,
            repairPlanSource: candidateParams.repairPlanSource,
            score: validation.score,
            accepted: decision.accepted,
            failureReasons: decision.failureReasons,
            requestManifest,
          });
          return { validation, decision, requestManifest };
        };

        if (target.mode === 'edit') {
          let currentImage = sourcePanelImage.imageData;
          for (
            let editAttempt = 1;
            editAttempt <= MANUAL_PANEL_EDIT_MAX_ATTEMPTS;
            editAttempt += 1
          ) {
            const repairPlan = buildManualPanelEditRepairPlan({
              target,
              page,
              panel,
              characters,
              referenceImages: panelReferenceImages,
              currentValidation,
            });
            let edited: Awaited<ReturnType<typeof complexImageDomain.editSceneImage>>;
            try {
              edited = await complexImageDomain.editSceneImage({
                originalImage: currentImage,
                originalMimeType: 'image/png',
                validationResult: currentValidation.validation,
                sceneDescription: panel.script.visual.primaryRead,
                imageSize: '1K',
                referenceImages: repairPlan.references,
                targetedRepairManifest: repairPlan.manifest,
                systemInstruction: buildImageEditSystemInstruction(),
                personGeneration: 'allow_all',
                onUsage: (usage) =>
                  recordUsage(usage, { userId: story.userId, storyId: params.storyId }),
                operation: 'graphic_novel_panel_manual_edit',
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              attempts.push({
                sequence: editAttempt,
                operation: 'graphic_novel_panel_manual_edit',
                repairMode: 'edit',
                repairPlanSource: repairPlan.source,
                accepted: false,
                failureReasons: ['edit_provider_error'],
                errorMessage: message,
              });
              logger.warn(
                {
                  err: error,
                  storyId: params.storyId,
                  pageNumber: params.pageNumber,
                  panelNumber: target.panelNumber,
                  editAttempt,
                },
                'Manual graphic novel panel edit attempt failed'
              );
              continue;
            }
            const generated = {
              ...edited,
              imageData: await normalizePanelCropForPaste(Buffer.from(edited.imageData), cropRect),
              mimeType: 'image/png',
              requestManifest: {
                ...(edited.requestManifest ?? {}),
                operation: 'graphic_novel_panel_manual_edit',
                repairManifest: repairPlan.manifest,
                repairPlanSource: repairPlan.source,
                requestedRepairMode: target.mode,
                editAttempt,
              },
            };
            const candidate = await validateCandidate({
              generated,
              appliedMode: 'edit',
              sequence: editAttempt,
              repairPlanSource: repairPlan.source,
              repairManifest: repairPlan.manifest,
            });
            if (candidate.decision.accepted) {
              return {
                accepted: true as const,
                target,
                panel,
                validation: candidate.validation,
                requestManifest: candidate.requestManifest,
                appliedMode: 'edit' as const,
                attempts,
                failureReasons: [] as string[],
              };
            }
            currentImage = generated.imageData;
            currentValidation = candidate.validation;
          }

          const decision = graphicNovelPanelQualityDecision(currentValidation);
          return {
            accepted: false as const,
            target,
            panel,
            validation: currentValidation,
            requestManifest: currentValidation.requestManifest ?? null,
            appliedMode: null,
            attempts,
            failureReasons:
              decision.failureReasons.length > 0
                ? decision.failureReasons
                : ['edit_provider_error'],
          };
        }

        const generated = await generateGraphicNovelPanelCrop({
          imageDomain: complexImageDomain,
          page,
          panelIndex: target.panelNumber - 1,
          cropRect,
          style,
          ageGroup,
          scenarioCardId: storyMetadata.scenarioCardId as string | undefined,
          environmentsById,
          referenceImages: panelReferenceImages,
          storyArtifactReference,
          userId: story.userId,
          storyId: params.storyId,
          operation: 'graphic_novel_panel_manual_regenerate',
          imageSize: '1K',
        });
        const candidate = await validateCandidate({
          generated,
          appliedMode: 'regenerate',
          sequence: 1,
        });
        if (candidate.decision.accepted) {
          return {
            accepted: true as const,
            target,
            panel,
            validation: candidate.validation,
            requestManifest: candidate.requestManifest,
            appliedMode: 'regenerate' as const,
            attempts,
            failureReasons: [] as string[],
          };
        }
        return {
          accepted: false as const,
          target,
          panel,
          validation: candidate.validation,
          requestManifest: candidate.requestManifest,
          appliedMode: null,
          attempts,
          failureReasons: candidate.decision.failureReasons,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          {
            err: error,
            storyId: params.storyId,
            pageNumber: params.pageNumber,
            panelNumber: target.panelNumber,
          },
          'Manual graphic novel panel repair target failed independently'
        );
        return {
          accepted: false as const,
          target,
          panel,
          validation: null,
          requestManifest: null,
          appliedMode: null,
          attempts,
          failureReasons: ['repair_execution_error'],
          errorMessage: message,
        };
      }
    })
  );

  const acceptedPanelResults = panelResults.filter(
    (result): result is Extract<(typeof panelResults)[number], { accepted: true }> =>
      result.accepted
  );
  const failedPanelResults = panelResults.filter((result) => !result.accepted);
  const acceptedPanelNumbers = new Set(
    acceptedPanelResults.map((result) => result.target.panelNumber)
  );
  const repairedAt = new Date().toISOString();
  const previousPanelRepair =
    pageGenerationParams.panelRepair && typeof pageGenerationParams.panelRepair === 'object'
      ? (pageGenerationParams.panelRepair as Record<string, unknown>)
      : null;
  const currentFailedPanels = failedPanelResults.map((result) => ({
    panelNumber: result.target.panelNumber,
    panelId: result.panel.script.panelId,
    score: result.validation?.score ?? null,
    failureReasons: result.failureReasons,
  }));
  const remainingFailedPanels = panelRepairFailedPanelsAfterRun({
    previousPanelRepair,
    requestedPanelNumbers,
    failedPanels: currentFailedPanels,
  });
  const manualRepairRecord = {
    attempt: repairAttempt,
    repairedAt,
    sourceArtOnlyStoragePath,
    panelNumbers: [...requestedPanelNumbers],
    acceptedPanelNumbers: [...acceptedPanelNumbers],
    failedPanelNumbers: failedPanelResults.map((result) => result.target.panelNumber),
    refreshedTurnaroundCharacterIds: params.refreshTurnaroundCharacterIds ?? [],
    panels: panelResults.map((result) => ({
      panelNumber: result.target.panelNumber,
      panelId: result.panel.script.panelId,
      requestedMode: result.target.mode,
      appliedMode: result.appliedMode,
      accepted: result.accepted,
      score: result.validation?.score ?? null,
      failureReasons: result.failureReasons,
      ...('errorMessage' in result ? { errorMessage: result.errorMessage } : {}),
      issues: result.target.issues,
      requestManifest: result.requestManifest,
      attempts: result.attempts,
    })),
  };
  const baseNextGenerationParams: Record<string, unknown> = {
    ...pageGenerationParams,
    completedAt: repairedAt,
    panelRepair: {
      ...(previousPanelRepair || {}),
      failedPanelCount: remainingFailedPanels.length,
      failedPanels: remainingFailedPanels,
      lastManualRepairAttempt: repairAttempt,
      lastManualRequestedPanelNumbers: [...requestedPanelNumbers],
      lastManualRepairedPanelNumbers: [...acceptedPanelNumbers],
      lastManualFailedPanelNumbers: failedPanelResults.map((result) => result.target.panelNumber),
    },
    manualPanelRepairs: [...manualRepairHistory, manualRepairRecord],
  };

  if ((params.refreshTurnaroundCharacterIds ?? []).length > 0) {
    await getGraphicNovelRepository().updateProject(project.id, {
      layoutManifest: { ...currentLayoutManifest, characters },
    });
  }

  const panelResultSummary = panelResults.map((result) => ({
    panelNumber: result.target.panelNumber,
    panelId: result.panel.script.panelId,
    requestedMode: result.target.mode,
    appliedMode: result.appliedMode,
    accepted: result.accepted,
    score: result.validation?.score ?? null,
    failureReasons: result.failureReasons,
  }));
  const outcome =
    failedPanelResults.length === 0
      ? ('completed' as const)
      : acceptedPanelResults.length > 0
        ? ('partial' as const)
        : ('no_change' as const);

  if (acceptedPanelResults.length === 0) {
    await getGraphicNovelRepository().updatePage(pageRow.id, {
      status: 'completed',
      errorMessage: null,
      generationParams: baseNextGenerationParams,
    });
    await recordStageTiming({
      storyId: params.storyId,
      storyRequestId: project.storyRequestId || undefined,
      userId: story.userId,
      generationKind,
      pipelinePhase: 'asset_generation',
      operation: 'comic_panel_manual_repair',
      targetType: 'comic_page',
      targetKey: String(params.pageNumber),
      pageNumber: params.pageNumber,
      assetId: pageRow.imageAssetId,
      startedAt: repairStartedAt,
      completedAt: new Date(),
      metadata: {
        outcome,
        requestedPanelNumbers: [...requestedPanelNumbers],
        acceptedPanelNumbers: [],
        failedPanelNumbers: failedPanelResults.map((result) => result.target.panelNumber),
        refreshedTurnaroundCharacterIds: params.refreshTurnaroundCharacterIds ?? [],
      },
    });
    logger.warn(
      {
        storyId: params.storyId,
        pageNumber: params.pageNumber,
        requestedPanelNumbers: [...requestedPanelNumbers],
        failedPanelNumbers: failedPanelResults.map((result) => result.target.panelNumber),
      },
      'No manual graphic novel panel repair candidates passed validation; page kept unchanged'
    );
    return {
      outcome,
      pageAssetId: pageRow.imageAssetId,
      panelResults: panelResultSummary,
    };
  }

  const recomposed = await composeGraphicNovelPanelCropRepairs({
    page,
    imageData: sourceArtOnly,
    panelValidations: acceptedPanelResults.map((result) => result.validation),
  });
  const finalPanelImages = await cropGraphicNovelPagePanels({
    imageData: recomposed.imageData,
    page,
  });
  const bubbleVision = await applyVisionBubblePlacementForRenderedPage({
    page,
    userId: story.userId,
    storyId: params.storyId,
    panelImages: finalPanelImages,
  });
  const finalPage = bubbleVision.page;
  const artOnlyUpload = await assetStorage.uploadAsset({
    data: recomposed.imageData,
    mimeType: 'image/png',
    userId: story.userId,
    storyId: params.storyId,
    assetType: 'image',
  });
  const finalImage = await overlayGraphicNovelBubblesOnly(recomposed.imageData, finalPage);
  const finalUpload = await assetStorage.uploadAsset({
    data: finalImage,
    mimeType: 'image/png',
    userId: story.userId,
    storyId: params.storyId,
    assetType: 'image',
  });
  const nextGenerationParams: Record<string, unknown> = {
    ...baseNextGenerationParams,
    artOnlyImageStoragePath: artOnlyUpload.storagePath,
    artOnlyImageMimeType: 'image/png',
    artOnlyImageFileSizeBytes: artOnlyUpload.fileSizeBytes,
    bubblePlacement: bubbleVision.placementSummary,
    bubbleVisionAnalysis: bubbleVision.analysis,
  };
  const pageAsset = await getAssetRepository().create({
    storyId: params.storyId,
    sceneId: null,
    assetType: 'image',
    storagePath: finalUpload.storagePath,
    storageUrl: finalUpload.storageUrl,
    signedUrl: finalUpload.signedUrl,
    signedUrlExpiresAt: finalUpload.signedUrlExpiresAt,
    mimeType: 'image/png',
    fileSizeBytes: finalUpload.fileSizeBytes,
    generationParams: {
      ...nextGenerationParams,
      kind: 'graphic_novel_page',
      pageNumber: params.pageNumber,
      requestId,
      storyFormat: generationKind,
      source: 'admin_selected_panel_repair',
    },
    generationTimeMs: Date.now() - repairStartedAt.getTime(),
    status: 'completed',
  });
  await saveThumbnail(pageAsset.id, finalUpload.storagePath, finalImage);
  await getGraphicNovelRepository().updatePage(pageRow.id, {
    imageAssetId: pageAsset.id,
    imageUrl: finalUpload.storageUrl,
    layoutJson: finalPage,
    bubbleLayoutJson: buildGraphicNovelBubbleLayoutJson(
      finalPage,
      typeof bubbleVision.placementSummary.mode === 'string' &&
        bubbleVision.placementSummary.mode.startsWith('post_art_vision')
        ? 'post_art_vision'
        : 'script_fallback'
    ),
    status: 'completed',
    errorMessage: null,
    generationParams: {
      ...nextGenerationParams,
      assetId: pageAsset.id,
      storagePath: finalUpload.storagePath,
    },
  });

  const pagePanels = await getGraphicNovelRepository().findPanelsByPageId(pageRow.id);
  await Promise.all(
    pagePanels.map((panelRow) => {
      const plannedPanel = finalPage.panels[panelRow.panelIndex - 1];
      return plannedPanel
        ? getGraphicNovelRepository().updatePanel(panelRow.id, {
            bubbleGeometry: plannedPanel.bubbles,
          })
        : Promise.resolve();
    })
  );

  if (
    !story.coverAssetId ||
    Number(storyMetadata.graphicNovelCoverPageNumber) === params.pageNumber
  ) {
    const coverAsset = await createGraphicNovelCoverPanelAsset({
      storyId: params.storyId,
      userId: story.userId,
      requestId,
      page: finalPage,
      pageAssetId: pageAsset.id,
      panelImages: finalPanelImages,
    });
    if (coverAsset) {
      await getStoryRepository().updateStory(params.storyId, {
        coverAssetId: coverAsset.assetId,
        metadata: {
          ...storyMetadata,
          graphicNovelCoverSource: coverAsset.source,
          graphicNovelCoverPageNumber: params.pageNumber,
          graphicNovelCoverPanelAssetId: coverAsset.assetId,
          graphicNovelCoverPending: false,
        },
      });
    }
  }

  await recordStageTiming({
    storyId: params.storyId,
    storyRequestId: project.storyRequestId || undefined,
    userId: story.userId,
    generationKind,
    pipelinePhase: 'asset_generation',
    operation: 'comic_panel_manual_repair',
    targetType: 'comic_page',
    targetKey: String(params.pageNumber),
    pageNumber: params.pageNumber,
    assetId: pageAsset.id,
    startedAt: repairStartedAt,
    completedAt: new Date(),
    metadata: {
      outcome,
      requestedPanelNumbers: [...requestedPanelNumbers],
      acceptedPanelNumbers: [...acceptedPanelNumbers],
      failedPanelNumbers: failedPanelResults.map((result) => result.target.panelNumber),
      panelCount: requestedPanelNumbers.size,
      refreshedTurnaroundCharacterIds: params.refreshTurnaroundCharacterIds ?? [],
    },
  });

  logger.info(
    {
      storyId: params.storyId,
      pageNumber: params.pageNumber,
      outcome,
      requestedPanelNumbers: [...requestedPanelNumbers],
      acceptedPanelNumbers: [...acceptedPanelNumbers],
      failedPanelNumbers: failedPanelResults.map((result) => result.target.panelNumber),
      pageAssetId: pageAsset.id,
    },
    'Accepted graphic novel panel repairs saved and page recomposed'
  );

  return {
    outcome,
    pageAssetId: pageAsset.id,
    panelResults: panelResultSummary,
  };
}

export async function processGraphicNovelPages(
  requestId: string,
  options: { stopAfterFirstPage?: boolean } = {}
): Promise<void> {
  const pageBatchStartedAt = new Date();
  const request = await getStoryRepository().findRequestById(requestId);
  if (!request) {
    throw new Error(`Graphic novel request ${requestId} not found for page generation`);
  }
  const requestCreatedAt = request.createdAt
    ? new Date(request.createdAt as Date)
    : pageBatchStartedAt;
  const storyReadyStartedAt = Number.isNaN(requestCreatedAt.getTime())
    ? pageBatchStartedAt
    : requestCreatedAt;

  const project = await getGraphicNovelRepository().findProjectByRequestId(requestId);
  if (!project) {
    throw new Error(`Graphic novel project for request ${requestId} not found`);
  }

  const pages = await getGraphicNovelRepository().findPagesByProjectId(project.id);
  const script = project.scriptJson as ComicScriptWithCharacters;
  let layoutManifest =
    (project.layoutManifest as { characters?: GraphicNovelCharacterManifest } | null) || {};
  const story = await getStoryRepository().findById(project.storyId);
  const storyMetadata = (story?.metadata as Record<string, unknown> | null) || {};
  const generationKind =
    (request.intermediateData as Record<string, unknown> | null | undefined)?.generationKind ===
    MIXED_STORY_KIND
      ? MIXED_STORY_KIND
      : GRAPHIC_NOVEL_KIND;
  const manifestState = await ensureGraphicNovelProjectManifestCharacters({
    project,
    story,
    userId: request.userId,
    generationKind,
    script,
    imageStyle: (storyMetadata.imageStyle as string | undefined) || 'soft_watercolor',
  });
  layoutManifest = manifestState.layoutManifest as { characters?: GraphicNovelCharacterManifest };
  let firstPageReady = storyMetadata.firstPageReady === true || request.status === 'completed';
  let hasGraphicNovelCover = await hasReusableGraphicNovelCover(storyMetadata, story?.coverAssetId);

  if (!firstPageReady) {
    await setGraphicNovelProgressStage(requestId, 'generating_first_page', generationKind);
    await startTask(requestId, STORY_TASKS.GENERATING_IMAGES, { estimatedMs: 20_000 });
  }

  const failedPages: Array<{ pageNumber: number; errorMessage: string }> = [];

  for (const page of pages) {
    if (page.status === 'completed') {
      continue;
    }

    const pageStartedAt = new Date();
    try {
      await getGraphicNovelRepository().updatePage(page.id, { status: 'generating' });
      const renderedAssets = await renderAndStorePage({
        requestId,
        storyId: project.storyId,
        userId: request.userId,
        generationKind,
        page,
        style: (storyMetadata.imageStyle as string | undefined) || 'soft_watercolor',
        ageGroup: project.ageGroup || story?.ageGroup || '6-8',
        scenarioCardId: storyMetadata.scenarioCardId as string | undefined,
        environments: script.environments || [],
        characters: layoutManifest.characters || [],
        storyArtifactReference: storyArtifactReferenceFromManifest(layoutManifest, storyMetadata),
        createCoverCandidate: !hasGraphicNovelCover,
      });
      if (renderedAssets.coverAssetId) {
        hasGraphicNovelCover = true;
        const latestStoryForCover = await getStoryRepository().findById(project.storyId);
        await getStoryRepository().updateStory(project.storyId, {
          coverAssetId: renderedAssets.coverAssetId,
          metadata: {
            ...((latestStoryForCover?.metadata as Record<string, unknown> | null) || {}),
            graphicNovelCoverSource:
              renderedAssets.coverSource ?? 'matching_story_card_aspect_ratio_panel',
            graphicNovelCoverPageNumber: page.pageNumber,
            graphicNovelCoverPanelAssetId: renderedAssets.coverAssetId,
            graphicNovelCoverPending: false,
          },
        });
      }

      if (
        shouldCompleteGraphicNovelRequestAfterPage({ pageNumber: page.pageNumber, firstPageReady })
      ) {
        firstPageReady = true;
        await updateTaskProgress(requestId, STORY_TASKS.GENERATING_IMAGES, 1, {
          current: 1,
          total: 1,
        });
        await completeTask(requestId, STORY_TASKS.GENERATING_IMAGES);
        const latestStoryForFirstPage = await getStoryRepository().findById(project.storyId);
        await getStoryRepository().updateStory(project.storyId, {
          ...(!hasGraphicNovelCover && { coverAssetId: null }),
          metadata: {
            ...((latestStoryForFirstPage?.metadata as Record<string, unknown> | null) || {}),
            firstPageReady: true,
            graphicNovelGenerationComplete: false,
            graphicNovelCoverPending: !hasGraphicNovelCover,
          },
        });
        await getStoryRepository().updateRequest(requestId, {
          status: 'completed',
          storyId: project.storyId,
          updatedAt: new Date(),
        });
        const firstPageCompletedAt = new Date();
        await recordStageTiming({
          storyId: project.storyId,
          storyRequestId: requestId,
          userId: request.userId,
          generationKind,
          pipelinePhase: 'asset_generation',
          operation: 'first_page_ready',
          targetType: 'comic_page',
          targetKey: String(page.pageNumber),
          pageNumber: page.pageNumber,
          assetId: renderedAssets.pageAssetId,
          startedAt: pageBatchStartedAt,
          completedAt: firstPageCompletedAt,
          metadata: {
            pageCount: pages.length,
            stopAfterFirstPage: options.stopAfterFirstPage === true,
            coverAssetId: renderedAssets.coverAssetId ?? null,
          },
        });
        await recordStageTiming({
          storyId: project.storyId,
          storyRequestId: requestId,
          userId: request.userId,
          generationKind,
          pipelinePhase: 'postprocess',
          operation: 'story_ready',
          targetType: 'story',
          targetKey: project.storyId,
          startedAt: storyReadyStartedAt,
          completedAt: firstPageCompletedAt,
          metadata: {
            readyReason: 'first_comic_page',
            pageCount: pages.length,
            firstPageNumber: page.pageNumber,
            stopAfterFirstPage: options.stopAfterFirstPage === true,
          },
        });
        logger.info({ requestId, storyId: project.storyId }, 'Graphic novel first page ready');
        if (options.stopAfterFirstPage) {
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await getGraphicNovelRepository().updatePage(page.id, {
        status: 'failed',
        errorMessage: message,
      });
      await recordStageTiming({
        storyId: project.storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind,
        pipelinePhase: 'asset_generation',
        operation: 'comic_page_image',
        targetType: 'comic_page',
        targetKey: String(page.pageNumber),
        pageNumber: page.pageNumber,
        status: 'failed',
        startedAt: pageStartedAt,
        completedAt: new Date(),
        metadata: {
          pageCount: pages.length,
          errorMessage: message,
        },
      });
      failedPages.push({ pageNumber: page.pageNumber, errorMessage: message });

      if (page.pageNumber === 1 && !firstPageReady) {
        await recordStageTiming({
          storyId: project.storyId,
          storyRequestId: requestId,
          userId: request.userId,
          generationKind,
          pipelinePhase: 'asset_generation',
          operation: 'comic_page_batch',
          targetType: 'story',
          targetKey: project.storyId,
          status: 'failed',
          startedAt: pageBatchStartedAt,
          completedAt: new Date(),
          metadata: {
            pageCount: pages.length,
            failedPageCount: failedPages.length,
            stopAfterFirstPage: options.stopAfterFirstPage === true,
            errorMessage: message,
          },
        });
        throw error;
      }
      logger.warn(
        { err: error, requestId, pageNumber: page.pageNumber },
        'Graphic novel background page failed'
      );
    }
  }

  const finalPages = await getGraphicNovelRepository().findPagesByProjectId(project.id);
  const generationComplete = finalPages.every(
    (page) => page.status === 'completed' || page.status === 'failed'
  );
  await getGraphicNovelRepository().updateProject(project.id, {
    status: options.stopAfterFirstPage
      ? 'generating'
      : failedPages.length > 0
        ? 'completed_with_errors'
        : 'completed',
  });
  const latestStory = await getStoryRepository().findById(project.storyId);
  await getStoryRepository().updateStory(project.storyId, {
    metadata: {
      ...((latestStory?.metadata as Record<string, unknown> | null) || {}),
      firstPageReady: true,
      graphicNovelGenerationComplete: generationComplete,
      ...(failedPages.length > 0 && { failedGraphicNovelPages: failedPages }),
    },
  });
  await recordStageTiming({
    storyId: project.storyId,
    storyRequestId: requestId,
    userId: request.userId,
    generationKind,
    pipelinePhase: 'asset_generation',
    operation: 'comic_page_batch',
    targetType: 'story',
    targetKey: project.storyId,
    startedAt: pageBatchStartedAt,
    completedAt: new Date(),
    metadata: {
      pageCount: pages.length,
      failedPageCount: failedPages.length,
      generationComplete,
      stopAfterFirstPage: options.stopAfterFirstPage === true,
    },
  });
}

export async function getGraphicNovel(storyId: string, userId: string) {
  const story = await getStoryRepository().findByIdAndUser(storyId, userId);
  if (!story) return null;

  const project = await getGraphicNovelRepository().findProjectByStoryId(storyId);
  if (!project) return null;

  const [pages, panels] = await Promise.all([
    getGraphicNovelRepository().findPagesByProjectId(project.id),
    getGraphicNovelRepository().findPanelsByProjectId(project.id),
  ]);
  const panelsByPageId = new Map<string, any[]>();
  for (const panel of panels) {
    const list = panelsByPageId.get(panel.pageId) || [];
    list.push(panel);
    panelsByPageId.set(panel.pageId, list);
  }

  return {
    story,
    project,
    pages: pages.map((page) => ({
      ...page,
      imageUrl: page.imageUrl || null,
      textOverlay: textOverlayFromPageRow(page),
      panels: panelsByPageId.get(page.id) || [],
    })),
  };
}

export async function getGraphicNovelGenerationStatus(storyId: string, userId: string) {
  const story = await getStoryRepository().findByIdAndUser(storyId, userId);
  if (!story) return null;

  const project = await getGraphicNovelRepository().findProjectByStoryId(storyId);
  if (!project) return null;

  const pages = await getGraphicNovelRepository().findPagesByProjectId(project.id);
  return buildGraphicNovelGenerationStatus({
    storyId,
    projectId: project.id,
    pages,
  });
}

export function buildGraphicNovelGenerationStatus(params: {
  storyId: string;
  projectId: string;
  pages: Array<{
    pageNumber: number;
    status: string;
    imageUrl?: string | null;
    imageAssetId?: string | null;
    errorMessage?: string | null;
    generationParams?: unknown;
  }>;
}) {
  const readyPages = params.pages.filter((page) => page.status === 'completed' && page.imageUrl);
  const failedPages = params.pages
    .filter((page) => page.status === 'failed')
    .map((page) => ({
      pageNumber: page.pageNumber,
      errorMessage: page.errorMessage || 'Page generation failed',
    }));
  const panelsNeedingRepair = params.pages.flatMap((page) => {
    const generationParams =
      page.generationParams && typeof page.generationParams === 'object'
        ? (page.generationParams as Record<string, unknown>)
        : null;
    const panelRepair =
      generationParams?.panelRepair && typeof generationParams.panelRepair === 'object'
        ? (generationParams.panelRepair as Record<string, unknown>)
        : null;
    const failedPanels = Array.isArray(panelRepair?.failedPanels) ? panelRepair.failedPanels : [];
    return failedPanels.flatMap((failedPanel) => {
      if (!failedPanel || typeof failedPanel !== 'object') return [];
      const row = failedPanel as Record<string, unknown>;
      if (typeof row.panelNumber !== 'number') return [];
      return [
        {
          pageNumber: page.pageNumber,
          panelNumber: row.panelNumber,
          panelId: typeof row.panelId === 'string' ? row.panelId : null,
          score: typeof row.score === 'number' ? row.score : null,
          failureReasons: Array.isArray(row.failureReasons)
            ? row.failureReasons.filter((reason): reason is string => typeof reason === 'string')
            : [],
        },
      ];
    });
  });

  return {
    storyId: params.storyId,
    projectId: params.projectId,
    textOverlayMode: 'html_overlay',
    firstPageReady: readyPages.some((page) => page.pageNumber === 1),
    generationComplete:
      params.pages.length > 0 &&
      params.pages.every((page) => page.status === 'completed' || page.status === 'failed'),
    readyPageNumbers: readyPages.map((page) => page.pageNumber),
    failedPages,
    panelsNeedingRepair,
    pagesWithImages: readyPages.map((page) => ({
      pageNumber: page.pageNumber,
      imageUrl: page.imageUrl,
      assetId: page.imageAssetId,
      textOverlayMode: 'html_overlay',
    })),
  };
}

/** Test-only access to production orchestration without replacing its logic. */
export const graphicNovelOrchestrationTestSeams = {
  renderAndStorePage,
  applyVisionBubblePlacementForRenderedPage,
  graphicNovelPanelQualityDecision,
  buildManualPanelRepairManifest,
  buildManualPanelEditRepairPlan,
  panelRepairFailedPanelsAfterRun,
  refreshGraphicNovelManifestTurnarounds,
  characterManifestForPageName,
  characterManifestMatchesPage,
  bindLegacyPlannedPageCharacterIdentity,
  buildGraphicNovelExpectedCharactersForPanel,
  pageDressedTurnaroundCompositionCharacters,
  selectGraphicNovelPanelValidationReferences,
};
