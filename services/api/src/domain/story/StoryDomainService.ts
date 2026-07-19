/**
 * Story Domain Service
 * Business logic for story generation - provider-agnostic
 *
 * Rules:
 * - MUST contain ONLY business logic (getSceneCount, getVocabularyLevel, etc.)
 * - MUST coordinate Prompt Builders and Providers
 * - NEVER contain API-specific code (Gemini SDK, SchemaType)
 * - NEVER build prompts inline (use Prompt Builders)
 * - MUST work with provider-agnostic interfaces (ITextProvider)
 */

import type { StorySpec, EpisodeText, PolicyProfile, SceneValidationResult } from '../../ai/types';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { StructuredRawResponse } from '../../providers/base/JsonSchema';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';
import { canonicalizeMapTileFeatures } from './mapTileMasks';

export interface StoryDomainOptions {
  onUsage?: (usage: UsageMetadata) => void;
  onRawResponse?: (response: StructuredRawResponse) => void | Promise<void>;
  reservedCharacters?: StorySpec['characters'];
  /** Complete prose context for selective repairs that must preserve cross-scene logic. */
  storyScenes?: Array<{ sceneId: number; text: string }>;
  /** Usage operation name for provider calls; callers can distinguish writer validation from other validators. */
  operation?: string;
  /** When true, uses continuation prompt with previousOutlines, usedPlots, required/optional characters */
  isContinuation?: boolean;
  continuationContext?: {
    previousOutlines: Array<{
      title: string;
      moral: string;
      scenes: Array<{ setting: string; goal: string }>;
    }>;
    requiredCharacters: Array<{
      name: string;
      type: string;
      description?: string;
      appearance?: string;
      role?: string;
    }>;
    optionalCharacters: Array<{
      name: string;
      type: string;
      description?: string;
      appearance?: string;
      role?: string;
    }>;
    usedPlots: string[];
    previousEnvironments?: Array<{
      id: string;
      name: string;
      description: string;
      characterOutfits?: string;
    }>;
    previousOutfits?: Array<{ id: string; characterName: string; description: string }>;
  };
}
import {
  buildDirectTextPromptPlain,
  buildDirectTextPromptPlainCachedPrefix,
  buildDirectorPrompt,
  buildDirectorPromptCachedPrefix,
  buildDirectorSelectedCharacterCoverageRetryPrompt,
  buildMapTileBriefPrompt,
  buildMapTileBriefPromptCachedPrefix,
  buildValidationPrompt,
  buildBatchValidationCachedPrefix,
  buildBatchValidationRuntimePrompt,
  buildBatchRegenerationCachedPrefix,
  buildBatchRegenerationRuntimePrompt,
  DIRECTOR_CACHE_KEY,
  MAP_TILE_BRIEF_CACHE_KEY,
  shouldEnableDirectorDynamicForeshortening,
  TEXT_REGENERATION_CACHE_KEY,
  TEXT_VALIDATION_CACHE_KEY,
  WRITER_PLAIN_CACHE_KEY,
} from '../../prompts/text';
import config, { getValidationTextModelOverride } from '../../config';
import { estimateUsageCostUsd } from '../../services/aiUsageService';
import { logger } from '../../utils/logger';
import { VALIDATION_SCHEMA, BATCH_VALIDATION_SCHEMA, BATCH_REGENERATION_SCHEMA } from './schemas';
import { DIRECTOR_SCHEMA, MAP_TILE_BRIEF_SCHEMA } from './directorSchema';
import { parsePlainTextToScenes } from './parsePlainText';
import { countNarrationWords } from '../../utils/audioTags';
import { evaluateDirectorSelectedCharacterCoverage } from './directorCharacterCoverage';
import { reconcileGeneratedCharacterIdentity } from '../../utils/characterIdentity';

/** Plain writer output budget — avoids truncated endings when the model hits provider defaults (e.g. Gemini `maxOutputTokens` 4096). */
const PLAIN_WRITER_MAX_OUTPUT_TOKENS = 16384;
const MIN_GENERATED_SCENES = 1;

function assertPlainStoryHasReadableScenes(parsed: {
  fullText: string;
  scenes: Array<{ sceneId: number; text: string }>;
}): void {
  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const hasReadableScene = scenes.some(
    (scene) => typeof scene.text === 'string' && scene.text.trim().length > 0
  );
  if (scenes.length < MIN_GENERATED_SCENES || !parsed.fullText.trim() || !hasReadableScene) {
    throw new Error('Writer returned no readable story scenes');
  }
}

export interface BatchValidationResult {
  requestManifest?: Record<string, unknown>;
  narrativeObligations?: Array<{
    setupSceneId: number;
    kind:
      | 'goal'
      | 'question'
      | 'threat'
      | 'clue'
      | 'plan'
      | 'promise'
      | 'rule'
      | 'object'
      | 'consequence'
      | 'other';
    setupAnchor: string;
    status: 'closed' | 'open' | 'intentional_carry_forward';
    closureSceneId?: number | null;
    closureAnchor?: string | null;
    repairSceneId?: number | null;
  }>;
  failedScenes: Array<{
    sceneId: number;
    violations: Array<{
      category: string;
      severity: string;
      message: string;
      suggestion?: string;
      relatedSceneIds?: number[];
      evidence?: string;
    }>;
  }>;
}

type BatchValidationProviderResult = {
  audit?: string[];
  open?: Array<{
    s: number;
    k: NonNullable<BatchValidationResult['narrativeObligations']>[number]['kind'];
    a: string;
    r: number;
  }>;
  failedScenes: BatchValidationResult['failedScenes'];
};

function isProviderContentBlockedError(message: string): boolean {
  return /PROHIBITED_CONTENT|blocked|content filter/i.test(message);
}

function buildProviderBlockedViolation() {
  return {
    category: 'content_policy' as const,
    severity: 'critical' as const,
    message: 'Provider content filter blocked validation. Regenerate this scene before showing it.',
    suggestion: 'Rewrite with gentler, age-appropriate wording.',
  };
}

function scoreSceneValidationResult(
  validation: Pick<SceneValidationResult, 'isValid' | 'violations'>
): number {
  if (validation.isValid && validation.violations.length === 0) {
    return 100;
  }
  if (!validation.isValid && validation.violations.length === 0) {
    return 0;
  }

  const penaltyBySeverity: Record<string, number> = {
    critical: 100,
    high: 60,
    medium: 35,
  };
  const penalty = validation.violations.reduce(
    (sum, violation) => sum + (penaltyBySeverity[violation.severity] ?? 45),
    0
  );
  return Math.max(0, 100 - penalty);
}

export class StoryDomainService {
  constructor(
    private textProvider: ITextProvider,
    private directorTextProvider: ITextProvider = textProvider,
    private validationTextProvider: ITextProvider = textProvider,
    private validationModelOverride: string | undefined = getValidationTextModelOverride()
  ) {}

  private getValidationModelOverride(): string | undefined {
    return this.validationModelOverride;
  }

  /**
   * Generate story text in plain format (Director flow)
   * Returns title, description, fullText, scenes — no JSON, no sceneVisual
   * When isContinuation=true, uses continuation-specific prompt sections
   */
  async generateTextPlain(
    spec: StorySpec,
    options?: StoryDomainOptions
  ): Promise<{
    title: string;
    description: string;
    fullText: string;
    wordCount: number;
    scenes: Array<{ sceneId: number; text: string }>;
  }> {
    const isContinuation = options?.isContinuation && options?.continuationContext;
    logger.info(
      { ageGroup: spec.ageGroup, language: spec.language, isContinuation },
      isContinuation ? 'Generating story continuation (plain)' : 'Generating story text (plain)'
    );

    const sceneCount = this.getSceneCount(spec.ageGroup);
    const vocabLevel = this.getVocabularyLevel(
      spec.storyComplexityAgeGroup ?? spec.ageGroup
    );

    const promptParams: Parameters<typeof buildDirectTextPromptPlain>[0] = {
      spec,
      sceneCount,
      vocabLevel,
    };
    if (isContinuation && options?.continuationContext) {
      const ctx = options.continuationContext;
      const toContinuationChar = (c: {
        name: string;
        type: string;
        description?: string;
        appearance?: string;
        role?: string;
      }) => ({
        name: c.name,
        type: c.type,
        description: c.description || c.appearance || c.name,
        role: c.role || 'character',
      });
      promptParams.isContinuation = true;
      promptParams.previousOutlines = ctx.previousOutlines;
      promptParams.usedPlots = ctx.usedPlots;
      promptParams.requiredCharacters = ctx.requiredCharacters.map(toContinuationChar);
      promptParams.optionalCharacters =
        ctx.optionalCharacters?.length > 0
          ? ctx.optionalCharacters.map(toContinuationChar)
          : undefined;
      promptParams.previousEnvironments = ctx.previousEnvironments;
      promptParams.previousOutfits = ctx.previousOutfits;
    }

    const prompt = buildDirectTextPromptPlain(promptParams);

    try {
      const rawText = await this.textProvider.generateText({
        prompt,
        cachedPrefix: {
          key: WRITER_PLAIN_CACHE_KEY,
          content: buildDirectTextPromptPlainCachedPrefix(),
          displayName: WRITER_PLAIN_CACHE_KEY,
        },
        maxTokens: PLAIN_WRITER_MAX_OUTPUT_TOKENS,
        temperature: 0.9,
        onUsage: options?.onUsage,
        operation: isContinuation ? 'text_continuation' : 'text_plain',
      });

      const parsed = parsePlainTextToScenes(rawText);
      assertPlainStoryHasReadableScenes(parsed);
      const wordCount = countNarrationWords(parsed.fullText);

      logger.info(
        { wordCount, sceneCount: parsed.scenes.length },
        'Story text (plain) generated successfully'
      );
      return {
        ...parsed,
        wordCount,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to generate plain text');
      throw new Error(
        `Plain text generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Director: generate visual descriptions for N illustrations only (one per block)
   */
  async callDirector(
    params: {
      blocks: Array<{
        blockIndex: number;
        sceneStart: number;
        sceneEnd: number;
        blockText: string;
      }>;
      imagesPerStory: number;
      spec: StorySpec;
      /** Existing identities; characterRef is authoritative and name is display-only. */
      userCharacters: Array<{
        id?: string;
        characterRef?: string;
        name: string;
        canonicalName?: string;
        nameAliases?: string[];
      }>;
    },
    options?: StoryDomainOptions
  ): Promise<{
    characters: Array<{
      characterRef: string;
      name: string;
      type: string;
      description: string;
      role?: string;
      personality?: string;
    }>;
    environments: Array<{ id: string; name: string; description: string }>;
    outfits: Array<{
      id: string;
      characterRef: string;
      characterName: string;
      description: string;
    }>;
    mapTile: {
      description: string;
      requiredFeatures: string[];
    };
    illustrations: Array<{
      environmentId: string;
      primaryRead: string;
      sceneVisual: {
        setting: string;
        cameraComposition: {
          shot: string;
          characters: Array<{
            characterRef: string;
            name: string;
            description: string;
            outfitId: string;
          }>;
        };
        lighting: string;
      };
    }>;
  }> {
    const prompt = buildDirectorPrompt(params);
    const dynamicForeshorteningEnabled = shouldEnableDirectorDynamicForeshortening(params);

    logger.info(
      {
        imagesPerStory: params.imagesPerStory,
        blockCount: params.blocks.length,
        promptLength: prompt.length,
        dynamicForeshorteningEnabled,
      },
      'Calling Director'
    );

    if (config.features.logDirectorFullPrompt) {
      logger.info({ promptLength: prompt.length, fullPrompt: prompt }, 'Director full prompt');
    }

    try {
      const parentOnUsage = options?.onUsage;
      const generateDirectorResult = async (attemptPrompt: string) => {
        const result = await this.directorTextProvider.generateStructured<{
          characters: any[];
          environments: any[];
          outfits: any[];
          mapTile: any;
          illustrations: Array<{
            environmentId: string;
            primaryRead: string;
            sceneVisual: any;
          }>;
        }>({
          prompt: attemptPrompt,
          cachedPrefix: {
            key: DIRECTOR_CACHE_KEY,
            content: buildDirectorPromptCachedPrefix(),
            displayName: DIRECTOR_CACHE_KEY,
          },
          schema: DIRECTOR_SCHEMA,
          temperature: 0.7,
          onUsage: (usage) => {
            if (usage.operation === 'director') {
              const costUsd = estimateUsageCostUsd(usage);
              logger.info(
                {
                  provider: usage.provider,
                  model: usage.model,
                  inputTokens: usage.inputUnits,
                  outputTokens: usage.outputUnits ?? 0,
                  costUsd,
                },
                'Director LLM request usage (estimated cost USD)'
              );
            }
            parentOnUsage?.(usage);
          },
          operation: 'director',
          onRawResponse: options?.onRawResponse,
        });
        reconcileGeneratedCharacterIdentity({
          document: result,
          existingCharacters: params.userCharacters,
        });

        const outfitsById = new Map(
          (Array.isArray(result.outfits) ? result.outfits : []).map((outfit: any) => [
            String(outfit?.id || '').trim(),
            String(outfit?.characterRef || '').trim(),
          ])
        );
        for (const [illustrationIndex, illustration] of (result.illustrations || []).entries()) {
          const rows = illustration?.sceneVisual?.cameraComposition?.characters;
          for (const [rowIndex, row] of (Array.isArray(rows) ? rows : []).entries()) {
            const outfitRef = outfitsById.get(String(row?.outfitId || '').trim());
            if (!outfitRef || outfitRef !== String(row?.characterRef || '').trim()) {
              throw new Error(
                `Director outfit binding mismatch at illustrations[${illustrationIndex}].cameraComposition.characters[${rowIndex}]`
              );
            }
          }
        }
        return result;
      };

      let result = await generateDirectorResult(prompt);
      let coverage = evaluateDirectorSelectedCharacterCoverage({
        userCharacters: params.userCharacters,
        illustrations: result.illustrations,
        imagesPerStory: params.imagesPerStory,
      });

      if (!coverage.ok) {
        logger.warn(
          {
            imagesPerStory: params.imagesPerStory,
            missingCharacters: coverage.missingCharacters,
          },
          'Director omitted selected characters; retrying visual plan once'
        );
        result = await generateDirectorResult(
          buildDirectorSelectedCharacterCoverageRetryPrompt({
            originalPrompt: prompt,
            missingCharacters: coverage.missingCharacters,
            imagesPerStory: params.imagesPerStory,
          })
        );
        coverage = evaluateDirectorSelectedCharacterCoverage({
          userCharacters: params.userCharacters,
          illustrations: result.illustrations,
          imagesPerStory: params.imagesPerStory,
        });
      }

      if (!coverage.ok) {
        throw new Error(
          `Selected characters are missing from the Director image plan: ${coverage.missingCharacters.join(', ')}`
        );
      }

      if (!result.illustrations || result.illustrations.length !== params.imagesPerStory) {
        logger.warn(
          { expected: params.imagesPerStory, received: result.illustrations?.length ?? 0 },
          'Director returned wrong illustration count'
        );
      }

      return {
        ...result,
        mapTile: {
          ...(result.mapTile ?? {}),
          description:
            typeof result.mapTile?.description === 'string'
              ? result.mapTile.description.trim()
              : '',
          requiredFeatures: canonicalizeMapTileFeatures(
            Array.isArray(result.mapTile?.requiredFeatures) ? result.mapTile.requiredFeatures : []
          ),
        },
      } as any;
    } catch (error) {
      logger.error({ error }, 'Director call failed');
      throw new Error(
        `Director failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Lightweight Director shortcut for backfilling legacy stories.
   * Standard story generation still uses callDirector(); this returns only the
   * two story-level map tile fields that are persisted in stories.metadata.
   */
  async generateMapTileBrief(
    params: {
      blocks: Array<{
        blockIndex: number;
        sceneStart: number;
        sceneEnd: number;
        blockText: string;
      }>;
      imagesPerStory: number;
      spec: StorySpec;
      userCharacters: Array<{
        id?: string;
        characterRef?: string;
        name: string;
        canonicalName?: string;
        nameAliases?: string[];
      }>;
    },
    options?: StoryDomainOptions
  ): Promise<{
    description: string;
    requiredFeatures: string[];
  }> {
    const prompt = buildMapTileBriefPrompt(params);

    logger.info(
      {
        imagesPerStory: params.imagesPerStory,
        blockCount: params.blocks.length,
        promptLength: prompt.length,
      },
      'Calling map tile brief Director'
    );

    try {
      const parentOnUsage = options?.onUsage;
      const result = await this.directorTextProvider.generateStructured<{
        description: string;
        requiredFeatures: string[];
      }>({
        prompt,
        cachedPrefix: {
          key: MAP_TILE_BRIEF_CACHE_KEY,
          content: buildMapTileBriefPromptCachedPrefix(),
          displayName: MAP_TILE_BRIEF_CACHE_KEY,
        },
        schema: MAP_TILE_BRIEF_SCHEMA,
        temperature: 0.4,
        onUsage: (usage) => {
          if (usage.operation === 'map_tile_brief') {
            const costUsd = estimateUsageCostUsd(usage);
            logger.info(
              {
                provider: usage.provider,
                model: usage.model,
                inputTokens: usage.inputUnits,
                outputTokens: usage.outputUnits ?? 0,
                costUsd,
              },
              'Map tile brief LLM request usage (estimated cost USD)'
            );
          }
          parentOnUsage?.(usage);
        },
        operation: 'map_tile_brief',
      });

      return {
        description: typeof result.description === 'string' ? result.description.trim() : '',
        requiredFeatures: canonicalizeMapTileFeatures(
          Array.isArray(result.requiredFeatures)
            ? result.requiredFeatures.filter(
                (feature): feature is string => typeof feature === 'string'
              )
            : []
        ),
      };
    } catch (error) {
      logger.error({ error }, 'Map tile brief Director call failed');
      throw new Error(
        `Map tile brief Director failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validate a single scene for content safety and age-appropriateness.
   */
  async validateScene(
    sceneText: EpisodeText['scenes'][0],
    policy: PolicyProfile,
    isLastScene: boolean,
    scenarioCardId?: string,
    options?: StoryDomainOptions
  ): Promise<SceneValidationResult> {
    const operation = options?.operation ?? 'validateScene';
    const model = this.getValidationModelOverride();
    const prompt = buildValidationPrompt({
      sceneText,
      policy,
      isLastScene,
      scenarioCardId,
      reservedCharacters: options?.reservedCharacters,
    });

    logger.debug(
      {
        sceneId: sceneText.sceneId,
        isLastScene,
        promptLength: prompt.length,
        promptPreview: prompt.slice(0, 500),
        fullPrompt: prompt,
      },
      'Scene validation prompt'
    );

    const requestManifest = {
      version: 1,
      operation,
      endpoint: 'generateStructured',
      model: model ?? null,
      prompt,
      config: {
        schemaName: 'VALIDATION_SCHEMA',
        temperature: 0.3,
      },
      context: {
        sceneId: sceneText.sceneId,
        isLastScene,
        scenarioCardId: scenarioCardId ?? null,
      },
    };

    try {
      const validation =
        await this.validationTextProvider.generateStructured<SceneValidationResult>({
          prompt,
          schema: VALIDATION_SCHEMA,
          temperature: 0.3,
          model,
          onUsage: options?.onUsage,
          operation,
        });

      logger.info(
        {
          sceneId: validation.sceneId,
          isValid: validation.isValid,
          violationCount: validation.violations.length,
        },
        'Scene validation complete'
      );

      return {
        ...validation,
        validationStatus: 'completed',
        requestManifest,
        validationScore: scoreSceneValidationResult(validation),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (isProviderContentBlockedError(errorMsg)) {
        logger.warn(
          { sceneId: sceneText.sceneId, error: errorMsg },
          'Scene validation blocked by provider content filter - failing closed'
        );
        return {
          validationStatus: 'provider_blocked',
          requestManifest,
          validationScore: 0,
          sceneId: sceneText.sceneId,
          isValid: false,
          violations: [buildProviderBlockedViolation()],
        };
      }

      logger.error({ error, sceneId: sceneText.sceneId }, 'Scene validation failed');
      throw new Error(`Scene validation failed: ${errorMsg}`);
    }
  }

  /**
   * Validate local scene quality and whole-story coherence in one batch request.
   * Returns repair-target scenes plus the shared request manifest.
   */
  async validateScenesBatch(
    scenes: EpisodeText['scenes'],
    policy: PolicyProfile,
    scenarioCardId?: string,
    options?: StoryDomainOptions
  ): Promise<BatchValidationResult> {
    const operation = options?.operation ?? 'validateScene';
    const model = this.getValidationModelOverride();
    const prompt = buildBatchValidationRuntimePrompt({
      scenes,
      policy,
      scenarioCardId,
      reservedCharacters: options?.reservedCharacters,
    });
    const cachedPrefix = {
      key: TEXT_VALIDATION_CACHE_KEY,
      content: buildBatchValidationCachedPrefix(),
      displayName: TEXT_VALIDATION_CACHE_KEY,
    };
    const requestManifest = {
      version: 1,
      operation,
      endpoint: 'generateStructured',
      model: model ?? null,
      prompt,
      cachedPrefix,
      config: {
        schemaName: 'BATCH_VALIDATION_SCHEMA',
        temperature: 0.3,
      },
      context: {
        sceneIds: scenes.map((scene) => scene.sceneId),
        scenarioCardId: scenarioCardId ?? null,
      },
    };
    logger.info(
      { sceneCount: scenes.length, promptLength: prompt.length },
      'Batch validating scenes'
    );

    logger.debug(
      {
        sceneCount: scenes.length,
        promptLength: prompt.length,
        promptPreview: prompt.slice(0, 500),
        fullPrompt: prompt,
      },
      'Batch validation prompt'
    );

    try {
      const result = await this.validationTextProvider.generateStructured<BatchValidationProviderResult>({
        prompt,
        cachedPrefix,
        schema: BATCH_VALIDATION_SCHEMA,
        temperature: 0.3,
        model,
        onUsage: options?.onUsage,
        onRawResponse: options?.onRawResponse,
        operation,
      });

      if (!Array.isArray(result.failedScenes)) {
        throw new Error('Batch validation returned an invalid failedScenes payload');
      }

      const narrativeObligations: NonNullable<BatchValidationResult['narrativeObligations']> =
        (result.open ?? []).map((item) => ({
          setupSceneId: item.s,
          kind: item.k,
          setupAnchor: item.a,
          status: 'open',
          closureSceneId: null,
          closureAnchor: null,
          repairSceneId: item.r,
        }));

      const failedScenes = result.failedScenes.map((scene) => ({
        ...scene,
        violations: [...scene.violations],
      }));
      for (const obligation of narrativeObligations) {
        if (obligation.status !== 'open' || typeof obligation.repairSceneId !== 'number') continue;
        let failedScene = failedScenes.find(
          (scene) => scene.sceneId === obligation.repairSceneId
        );
        if (!failedScene) {
          failedScene = { sceneId: obligation.repairSceneId, violations: [] };
          failedScenes.push(failedScene);
        }
        if (!failedScene.violations.some((violation) => violation.category === 'setup_payoff_gap')) {
          failedScene.violations.push({
            category: 'setup_payoff_gap',
            severity: 'medium',
            message: `The story leaves this ${obligation.kind} open: ${obligation.setupAnchor}`,
            suggestion: 'Close this thread through a concrete observation, action, or consequence.',
            relatedSceneIds: [obligation.setupSceneId, obligation.repairSceneId],
          });
        }
      }

      const failedCount = failedScenes.length;
      logger.info(
        {
          sceneCount: scenes.length,
          failedCount,
          ...(failedCount > 0 && { failedSceneIds: failedScenes.map((f) => f.sceneId) }),
        },
        'Batch validation complete'
      );

      logger.debug(
        {
          failedCount,
          responseSummary: {
            narrativeObligationCount: narrativeObligations.length,
            openNarrativeObligationCount:
              narrativeObligations.filter((item) => item.status === 'open').length,
            failedScenes,
          },
          rawResponse: JSON.stringify(result),
        },
        'Batch validation response'
      );

      return {
        narrativeObligations,
        failedScenes,
        requestManifest,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (isProviderContentBlockedError(errorMsg)) {
        logger.warn(
          { error: errorMsg },
          'Batch validation blocked by provider content filter - failing closed'
        );
        return {
          requestManifest,
          failedScenes: scenes.map((scene) => ({
            sceneId: scene.sceneId,
            violations: [buildProviderBlockedViolation()],
          })),
        };
      }
      logger.error({ error }, 'Batch validation failed');
      throw new Error(`Batch validation failed: ${errorMsg}`);
    }
  }

  /**
   * Regenerate all failed scenes in one batch request.
   * Returns all corrected scene texts.
   */
  async regenerateScenesBatch(
    spec: StorySpec,
    sceneCount: number,
    failedScenes: Array<{ sceneId: number; originalText: string; feedback: string }>,
    options?: StoryDomainOptions
  ): Promise<Array<{ sceneId: number; text: string }>> {
    const vocabLevel = this.getVocabularyLevel(
      spec.storyComplexityAgeGroup ?? spec.ageGroup
    );
    const prompt = buildBatchRegenerationRuntimePrompt({
      spec,
      sceneCount,
      failedScenes,
      storyScenes: options?.storyScenes,
      vocabLevel,
    });
    const cachedPrefix = {
      key: TEXT_REGENERATION_CACHE_KEY,
      content: buildBatchRegenerationCachedPrefix(),
      displayName: TEXT_REGENERATION_CACHE_KEY,
    };
    logger.info(
      {
        failedCount: failedScenes.length,
        sceneIds: failedScenes.map((f) => f.sceneId),
        promptLength: prompt.length,
      },
      'Batch regenerating scenes'
    );

    logger.debug(
      {
        failedCount: failedScenes.length,
        promptLength: prompt.length,
        promptPreview: prompt.slice(0, 500),
        fullPrompt: prompt,
      },
      'Batch regeneration prompt'
    );

    try {
      const result = await this.textProvider.generateStructured<{
        scenes: Array<{ sceneId: number; text: string }>;
      }>({
        prompt,
        cachedPrefix,
        schema: BATCH_REGENERATION_SCHEMA,
        temperature: 0.9,
        onUsage: options?.onUsage,
        operation: 'regenerateScene',
      });

      const scenes = result.scenes ?? [];
      if (scenes.length !== failedScenes.length) {
        logger.warn(
          { expected: failedScenes.length, received: scenes.length },
          'Batch regeneration returned wrong scene count'
        );
      }
      logger.info(
        { sceneCount: scenes.length, receivedSceneIds: scenes.map((s) => s.sceneId) },
        'Batch regeneration complete'
      );

      logger.debug(
        {
          responseSummary: {
            sceneIds: scenes.map((s) => s.sceneId),
            textLengths: scenes.map((s) => s.text.length),
          },
          rawResponse: JSON.stringify(result),
        },
        'Batch regeneration response'
      );

      return scenes;
    } catch (error) {
      logger.error({ error }, 'Batch regeneration failed');
      throw new Error(
        `Batch regeneration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Business logic: Get scene count for age group
   */
  private getSceneCount(ageGroup: string): number {
    const counts: Record<string, number> = {
      '0-1': 5, // was 3 (1.5x = 4.5, rounded up)
      '1y': 5, // was 3 (1.5x = 4.5, rounded up)
      '2-3': 6, // was 4 (1.5x = 6)
      '4-5': 8, // was 5 (1.5x = 7.5, rounded up)
      '6-8': 9, // was 6 (1.5x = 9)
      '9-12': 11, // was 7 (1.5x = 10.5, rounded up)
    };
    return counts[ageGroup] || 6; // was 4
  }

  /**
   * Business logic: Get vocabulary level for age group
   */
  private getVocabularyLevel(ageGroup: string): string {
    const levels: Record<string, string> = {
      '0-1': 'simple',
      '1y': 'simple',
      '2-3': 'basic',
      '4-5': 'basic',
      '6-8': 'intermediate',
      '9-12': 'advanced',
    };
    return levels[ageGroup] || 'basic';
  }
}
