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

import type { StorySpec, EpisodeText, PolicyProfile } from '../../ai/types';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';

export interface StoryDomainOptions {
  onUsage?: (usage: UsageMetadata) => void;
  /** When true, uses continuation prompt with previousOutlines, usedPlots, required/optional characters */
  isContinuation?: boolean;
  continuationContext?: {
    previousOutlines: Array<{ title: string; moral: string; scenes: Array<{ setting: string; goal: string }> }>;
    requiredCharacters: Array<{ name: string; type: string; description?: string; appearance?: string; role?: string }>;
    optionalCharacters: Array<{ name: string; type: string; description?: string; appearance?: string; role?: string }>;
    usedPlots: string[];
    previousEnvironments?: Array<{ id: string; name: string; description: string; characterOutfits?: string }>;
  };
}
import { buildDirectTextPrompt, buildDirectTextPromptPlain, buildDirectorPrompt, buildBatchValidationPrompt, buildBatchRegenerationPrompt } from '../../prompts/text';
import { logger } from '../../utils/logger';
import { TEXT_SCHEMA, BATCH_VALIDATION_SCHEMA, BATCH_REGENERATION_SCHEMA } from './schemas';
import { DIRECTOR_SCHEMA } from './directorSchema';
import { parsePlainTextToScenes } from './parsePlainText';

export interface BatchValidationResult {
  failedScenes: Array<{
    sceneId: number;
    violations: Array<{ category: string; severity: string; message: string; suggestion?: string }>;
    correctedCameraComposition?: { shot: string; characters: Array<{ name: string; description: string }> };
  }>;
}

export class StoryDomainService {
  constructor(private textProvider: ITextProvider) {}

  /**
   * Generate story text directly (1-step process)
   * Business logic: determines scene count and vocabulary level based on age group
   * When isContinuation=true, uses continuation-specific prompt sections
   */
  async generateText(spec: StorySpec, options?: StoryDomainOptions): Promise<EpisodeText> {
    const isContinuation = options?.isContinuation && options?.continuationContext;
    logger.info(
      { ageGroup: spec.ageGroup, language: spec.language, isContinuation },
      isContinuation ? 'Generating story continuation' : 'Generating story text'
    );

    const sceneCount = this.getSceneCount(spec.ageGroup);
    const vocabLevel = this.getVocabularyLevel(spec.ageGroup);

    const promptParams: Parameters<typeof buildDirectTextPrompt>[0] = { spec, sceneCount, vocabLevel };
    if (isContinuation && options?.continuationContext) {
      const ctx = options.continuationContext;
      const toContinuationChar = (c: { name: string; type: string; description?: string; appearance?: string; role?: string }) => ({
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
        ctx.optionalCharacters?.length > 0 ? ctx.optionalCharacters.map(toContinuationChar) : undefined;
      promptParams.previousEnvironments = ctx.previousEnvironments;
    }

    const prompt = buildDirectTextPrompt(promptParams);
    
    // Log the FULL prompt being sent
    logger.debug({ 
      promptLength: prompt.length,
      prompt: prompt // Full prompt for debugging
    }, 'Text generation prompt');

    try {
      // Call provider with provider-agnostic request
      const text = await this.textProvider.generateStructured<EpisodeText>({
        prompt,
        schema: TEXT_SCHEMA,
        temperature: 0.9,
        onUsage: options?.onUsage,
        operation: isContinuation ? 'text_continuation' : 'text_structured',
      });

      // Compute fullText and wordCount server-side for consistency
      text.fullText = text.scenes.map(s => s.text).join('\n\n');
      text.wordCount = text.fullText.split(/\s+/).length;

      logger.info({ wordCount: text.wordCount, sceneCount: text.scenes.length }, 'Story text generated successfully');
      return text;
    } catch (error) {
      logger.error({ error }, 'Failed to generate text');
      throw new Error(`Text generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate story text in plain format (Director flow)
   * Returns title, description, fullText, scenes — no JSON, no sceneVisual
   * When isContinuation=true, uses continuation-specific prompt sections
   */
  async generateTextPlain(spec: StorySpec, options?: StoryDomainOptions): Promise<{
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
    const vocabLevel = this.getVocabularyLevel(spec.ageGroup);

    const promptParams: Parameters<typeof buildDirectTextPromptPlain>[0] = { spec, sceneCount, vocabLevel };
    if (isContinuation && options?.continuationContext) {
      const ctx = options.continuationContext;
      const toContinuationChar = (c: { name: string; type: string; description?: string; appearance?: string; role?: string }) => ({
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
        ctx.optionalCharacters?.length > 0 ? ctx.optionalCharacters.map(toContinuationChar) : undefined;
      promptParams.previousEnvironments = ctx.previousEnvironments;
    }

    const prompt = buildDirectTextPromptPlain(promptParams);

    try {
      const rawText = await this.textProvider.generateText({
        prompt,
        temperature: 0.9,
        onUsage: options?.onUsage,
        operation: isContinuation ? 'text_continuation' : 'text_plain',
      });

      const parsed = parsePlainTextToScenes(rawText);
      const wordCount = parsed.fullText.split(/\s+/).length;

      logger.info({ wordCount, sceneCount: parsed.scenes.length }, 'Story text (plain) generated successfully');
      return {
        ...parsed,
        wordCount,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to generate plain text');
      throw new Error(`Plain text generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Director: generate visual descriptions for N illustrations only (one per block)
   */
  async callDirector(
    params: {
      blocks: Array<{ blockIndex: number; sceneStart: number; sceneEnd: number; blockText: string }>;
      imagesPerStory: number;
      spec: StorySpec;
      /** User characters with IDs — same format as main flow */
      userCharacters: Array<{ id?: string; name: string }>;
    },
    options?: StoryDomainOptions
  ): Promise<{
    characters: Array<{ name: string; type: string; description: string; role?: string; personality?: string }>;
    environments: Array<{ id: string; name: string; description: string; characterOutfits: string }>;
    illustrations: Array<{ environmentId: string; sceneVisual: { setting: string; cameraComposition: { shot: string; characters: Array<{ name: string; description: string }> }; lighting: string } }>;
  }> {
    logger.info({ imagesPerStory: params.imagesPerStory, blockCount: params.blocks.length }, 'Calling Director');

    const prompt = buildDirectorPrompt(params);

    try {
      const result = await this.textProvider.generateStructured<{
        characters: any[];
        environments: any[];
        illustrations: any[];
      }>({
        prompt,
        schema: DIRECTOR_SCHEMA,
        temperature: 0.7,
        onUsage: options?.onUsage,
        operation: 'director',
      });

      if (!result.illustrations || result.illustrations.length !== params.imagesPerStory) {
        logger.warn(
          { expected: params.imagesPerStory, received: result.illustrations?.length ?? 0 },
          'Director returned wrong illustration count'
        );
      }

      return result as any;
    } catch (error) {
      logger.error({ error }, 'Director call failed');
      throw new Error(`Director failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate all scenes in one batch request.
   * Returns only failed scenes (minimal info).
   */
  async validateScenesBatch(
    scenes: EpisodeText['scenes'],
    policy: PolicyProfile,
    scenarioCardId?: string,
    options?: StoryDomainOptions
  ): Promise<BatchValidationResult> {
    const prompt = buildBatchValidationPrompt({ scenes, policy, scenarioCardId });
    logger.info({ sceneCount: scenes.length, promptLength: prompt.length }, 'Batch validating scenes');

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
      const result = await this.textProvider.generateStructured<BatchValidationResult>({
        prompt,
        schema: BATCH_VALIDATION_SCHEMA,
        temperature: 0.3,
        onUsage: options?.onUsage,
        operation: 'validateScene',
      });

      const failedCount = result.failedScenes?.length ?? 0;
      logger.info(
        {
          sceneCount: scenes.length,
          failedCount,
          ...(failedCount > 0 && { failedSceneIds: result.failedScenes!.map((f) => f.sceneId) }),
        },
        'Batch validation complete'
      );

      logger.debug(
        {
          failedCount,
          responseSummary: { failedScenes: result.failedScenes ?? [] },
          rawResponse: JSON.stringify(result),
        },
        'Batch validation response'
      );

      return { failedScenes: result.failedScenes ?? [] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('PROHIBITED_CONTENT') || errorMsg.includes('blocked')) {
        logger.warn({ error: errorMsg }, 'Batch validation blocked - auto-passing all scenes');
        return { failedScenes: [] };
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
    const vocabLevel = this.getVocabularyLevel(spec.ageGroup);
    const prompt = buildBatchRegenerationPrompt({ spec, sceneCount, failedScenes, vocabLevel });
    logger.info(
      { failedCount: failedScenes.length, sceneIds: failedScenes.map((f) => f.sceneId), promptLength: prompt.length },
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
      const result = await this.textProvider.generateStructured<{ scenes: Array<{ sceneId: number; text: string }> }>({
        prompt,
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
      throw new Error(`Batch regeneration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate continuation for an existing story series
   * Delegates to generateText with isContinuation and continuationContext
   * @deprecated Use generateText with isContinuation and continuationContext options
   */
  async generateContinuation(
    params: {
      spec: StorySpec;
      previousOutlines: any[];
      requiredCharacters: any[];
      optionalCharacters: any[];
      usedPlots: string[];
    },
    options?: StoryDomainOptions
  ): Promise<EpisodeText> {
    return this.generateText(params.spec, {
      ...options,
      isContinuation: true,
      continuationContext: {
        previousOutlines: params.previousOutlines,
        requiredCharacters: params.requiredCharacters,
        optionalCharacters: params.optionalCharacters,
        usedPlots: params.usedPlots,
      },
    });
  }

  /**
   * Generate continuation in plain text format (Director flow)
   * Delegates to generateTextPlain with isContinuation and continuationContext
   * @deprecated Use generateTextPlain with isContinuation and continuationContext options
   */
  async generateContinuationPlain(
    params: {
      spec: StorySpec;
      previousOutlines: any[];
      requiredCharacters: any[];
      optionalCharacters: any[];
      usedPlots: string[];
    },
    options?: StoryDomainOptions
  ): Promise<{ title: string; description: string; fullText: string; wordCount: number; scenes: Array<{ sceneId: number; text: string }> }> {
    return this.generateTextPlain(params.spec, {
      ...options,
      isContinuation: true,
      continuationContext: {
        previousOutlines: params.previousOutlines,
        requiredCharacters: params.requiredCharacters,
        optionalCharacters: params.optionalCharacters,
        usedPlots: params.usedPlots,
      },
    });
  }

  /**
   * Business logic: Get scene count for age group
   */
  private getSceneCount(ageGroup: string): number {
    const counts: Record<string, number> = {
      '0-1': 5,   // was 3 (1.5x = 4.5, rounded up)
      '1y': 5,    // was 3 (1.5x = 4.5, rounded up)
      '2-3': 6,   // was 4 (1.5x = 6)
      '4-5': 8,   // was 5 (1.5x = 7.5, rounded up)
      '6-8': 9,   // was 6 (1.5x = 9)
      '9-12': 11  // was 7 (1.5x = 10.5, rounded up)
    };
    return counts[ageGroup] || 6;  // was 4
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
      '9-12': 'advanced'
    };
    return levels[ageGroup] || 'basic';
  }
}
