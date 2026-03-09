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
}
import { buildDirectTextPrompt, buildBatchValidationPrompt, buildBatchRegenerationPrompt, buildContinuationPrompt } from '../../prompts/text';
import { logger } from '../../utils/logger';
import { TEXT_SCHEMA, BATCH_VALIDATION_SCHEMA, BATCH_REGENERATION_SCHEMA } from './schemas';

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
   */
  async generateText(spec: StorySpec, options?: StoryDomainOptions): Promise<EpisodeText> {
    logger.info({ ageGroup: spec.ageGroup, language: spec.language }, 'Generating story text');

    // Business logic: determine scene count and vocabulary level
    const sceneCount = this.getSceneCount(spec.ageGroup);
    const vocabLevel = this.getVocabularyLevel(spec.ageGroup);

    // Build text generation prompt
    const prompt = buildDirectTextPrompt({ spec, sceneCount, vocabLevel });
    
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
        operation: 'text_structured',
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
   * Business logic: determines scene count and vocabulary level based on age group
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
    logger.info({
      ageGroup: params.spec.ageGroup,
      language: params.spec.language,
      partNumber: params.previousOutlines.length + 1,
    }, 'Generating story continuation');

    // Business logic: determine scene count and vocabulary level
    const sceneCount = this.getSceneCount(params.spec.ageGroup);
    const vocabLevel = this.getVocabularyLevel(params.spec.ageGroup);

    // Build continuation prompt
    const prompt = buildContinuationPrompt({
      spec: params.spec,
      sceneCount,
      vocabLevel,
      previousOutlines: params.previousOutlines,
      requiredCharacters: params.requiredCharacters,
      optionalCharacters: params.optionalCharacters,
      usedPlots: params.usedPlots,
    });

    // Log the FULL prompt being sent
    logger.debug({
      promptLength: prompt.length,
      prompt: prompt // Full prompt for debugging
    }, 'Continuation generation prompt');

    try {
      // Call provider with provider-agnostic request
      // Use higher temperature for creativity in continuations
      const text = await this.textProvider.generateStructured<EpisodeText>({
        prompt,
        schema: TEXT_SCHEMA,
        temperature: 0.9,
        onUsage: options?.onUsage,
        operation: 'text_continuation',
      });

      // Compute fullText and wordCount server-side for consistency
      text.fullText = text.scenes.map(s => s.text).join('\n\n');
      text.wordCount = text.fullText.split(/\s+/).length;

      logger.info({
        wordCount: text.wordCount,
        sceneCount: text.scenes.length,
        partNumber: params.previousOutlines.length + 1,
      }, 'Story continuation generated successfully');
      
      return text;
    } catch (error) {
      logger.error({ error }, 'Failed to generate continuation');
      throw new Error(`Continuation generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
