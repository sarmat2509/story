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

import type { StorySpec, EpisodeOutline, EpisodeText, PolicyProfile, SceneValidationResult } from '../../ai/types';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import { buildOutlinePrompt, buildTextPrompt, buildValidationPrompt, buildRegenerationPrompt } from '../../prompts/text';
import { logger } from '../../utils/logger';
import { OUTLINE_SCHEMA, TEXT_SCHEMA, VALIDATION_SCHEMA, SCENE_SCHEMA } from './schemas';

export class StoryDomainService {
  constructor(private textProvider: ITextProvider) {}

  /**
   * Generate story outline (structure + scene planning)
   * Business logic: determines scene count based on age group
   */
  async generateOutline(spec: StorySpec): Promise<EpisodeOutline> {
    logger.info({ ageGroup: spec.ageGroup, language: spec.language }, 'Generating story outline');

    // Business logic: determine scene count for age group
    const sceneCount = this.getSceneCount(spec.ageGroup);

    // Build prompt using prompt function
    const prompt = buildOutlinePrompt({ spec, sceneCount });

    try {
      // Call provider with provider-agnostic request
      const outline = await this.textProvider.generateStructured<EpisodeOutline>({
        prompt,
        schema: OUTLINE_SCHEMA,
        temperature: 0.9
      });

      logger.info({ sceneCount: outline.scenes.length }, 'Outline generated successfully');
      return outline;
    } catch (error) {
      logger.error({ error }, 'Failed to generate outline');
      throw new Error(`Outline generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate full story text from outline
   * Business logic: determines vocabulary level based on age group
   */
  async generateText(spec: StorySpec, outline: EpisodeOutline): Promise<EpisodeText> {
    logger.info({ title: outline.title, sceneCount: outline.scenes.length }, 'Generating story text');

    // Business logic: determine vocabulary level for age group
    const vocabLevel = this.getVocabularyLevel(spec.ageGroup);

    // Build prompt using prompt function
    const prompt = buildTextPrompt({ spec, outline, vocabLevel });

    try {
      // Call provider with provider-agnostic request
      const text = await this.textProvider.generateStructured<EpisodeText>({
        prompt,
        schema: TEXT_SCHEMA,
        temperature: 0.8
      });

      logger.info({ wordCount: text.wordCount, sceneCount: text.scenes.length }, 'Story text generated successfully');
      return text;
    } catch (error) {
      logger.error({ error }, 'Failed to generate text');
      throw new Error(`Text generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate a single scene for content safety and age-appropriateness
   * AI-powered validation using text provider
   */
  async validateScene(
    sceneOutline: EpisodeOutline['scenes'][0],
    sceneText: EpisodeText['scenes'][0],
    policy: PolicyProfile,
    isLastScene: boolean
  ): Promise<SceneValidationResult> {
    logger.info({ sceneId: sceneText.sceneId, isLastScene }, 'Validating scene');

    // Build prompt using prompt function
    const prompt = buildValidationPrompt({
      sceneOutline,
      sceneText,
      policy,
      isLastScene
    });

    try {
      // Call provider with lower temperature for consistent validation
      const validation = await this.textProvider.generateStructured<SceneValidationResult>({
        prompt,
        schema: VALIDATION_SCHEMA,
        temperature: 0.3
      });

      logger.info({
        sceneId: validation.sceneId,
        isValid: validation.isValid,
        violationCount: validation.violations.length
      }, 'Scene validation complete');

      return validation;
    } catch (error) {
      logger.error({ error, sceneId: sceneText.sceneId }, 'Scene validation failed');
      throw new Error(`Scene validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Regenerate a single scene with validation feedback
   * Business logic: determines vocabulary level, coordinates regeneration
   */
  async regenerateScene(
    spec: StorySpec,
    outline: EpisodeOutline,
    sceneId: number,
    validationFeedback: string
  ): Promise<EpisodeText['scenes'][0]> {
    logger.info({ sceneId, feedback: validationFeedback }, 'Regenerating scene');

    // Business logic: determine vocabulary level for age group
    const vocabLevel = this.getVocabularyLevel(spec.ageGroup);

    // Build prompt using prompt function
    const prompt = buildRegenerationPrompt({
      spec,
      outline,
      sceneId,
      validationFeedback,
      vocabLevel
    });

    try {
      // Call provider with higher temperature for creative regeneration
      const scene = await this.textProvider.generateStructured<EpisodeText['scenes'][0]>({
        prompt,
        schema: SCENE_SCHEMA,
        temperature: 0.9
      });

      logger.info({ sceneId: scene.sceneId }, 'Scene regenerated successfully');
      return scene;
    } catch (error) {
      logger.error({ error, sceneId }, 'Scene regeneration failed');
      throw new Error(`Scene regeneration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Business logic: Get scene count for age group
   */
  private getSceneCount(ageGroup: string): number {
    const counts: Record<string, number> = {
      '0-1': 3,
      '1y': 3,
      '2-3': 4,
      '4-5': 5,
      '6-8': 6,
      '9-12': 7
    };
    return counts[ageGroup] || 4;
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
