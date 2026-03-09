/**
 * Core generation functions - unified logic for standard and continuation
 */

import { logger } from '../../utils/logger';
import { getStoryRepository } from '../../repositories';
import { getStoryDomainService } from '../aiService';
import { startTask, completeTask, STORY_TASKS } from '../storyProgress';
import { getGenerationCoefficients } from '../generationTimeService';
import { normalizeCharacterName } from '../../utils/characterNormalization';
import { extractLlmCharactersFromText, handleRequestError } from './utilities';
import { mergeCharacters, persistLlmCharacters, createStoryRecord } from './storyRecords';
import { validateStoryScenes } from './validation';
import { saveTextGenerationCheckpoint, saveValidationCheckpoint, saveStoryCreationCheckpoint } from './checkpoints';
import type { GenerateTextParams, GenerateTextResult } from './types';
import type { CharacterData } from '../types';

/**
 * Unified text generation for both standard and continuation flows
 */
export async function generateStoryText(params: GenerateTextParams): Promise<GenerateTextResult> {
  const { requestId, request, generationType, continuationContext } = params;
  const startTime = Date.now();
  
  try {
    const storyDomain = getStoryDomainService();
    const coefficients = await getGenerationCoefficients();
    
    // Update status to 'processing'
    await getStoryRepository().updateRequest(requestId, {
      status: 'processing',
      updatedAt: new Date(),
    });
    
    logger.info({ requestId, generationType }, 'Starting unified text generation');
    
    // Build story spec (import from parent service)
    const { buildStorySpec } = require('../storyOrchestrationService');
    const specData = await buildStorySpec(request);
    const spec = specData.spec;
    const selectedCharacters = specData.selectedCharacters;
    const chosenPlotExampleId = specData.chosenPlotExampleId;
    const chosenWorldRuleId = specData.chosenWorldRuleId;
    
    // Task 1: Generate Text
    const textGenStart = Date.now();
    await startTask(requestId, STORY_TASKS.GENERATING_TEXT, { estimatedMs: coefficients.avgTextMs });
    
    let text: any;
    if (generationType === 'standard') {
      text = await storyDomain.generateText(spec);
    } else {
      // Continuation
      text = await storyDomain.generateContinuation({
        spec,
        previousOutlines: continuationContext!.previousOutlines,
        requiredCharacters: continuationContext!.requiredCharacters,
        optionalCharacters: continuationContext!.optionalCharacters,
        usedPlots: continuationContext!.usedPlots,
      });
    }
    
    const textGenerationTimeMs = Date.now() - textGenStart;
    await completeTask(requestId, STORY_TASKS.GENERATING_TEXT);
    
    logger.info({ requestId, title: text.title, wordCount: text.wordCount, textGenerationTimeMs, generationType }, 'Text generated');
    
    // Extract LLM characters
    const llmCharacters = extractLlmCharactersFromText(text);
    
    logger.info({
      requestId,
      llmCharacterCount: llmCharacters.length,
      llmCharacterNames: llmCharacters.map(c => c.name).join(', ')
    }, 'Extracted LLM-generated characters');
    
    // Merge characters (unified logic for both flows)
    const initialCharacters = generationType === 'standard'
      ? selectedCharacters as CharacterData[]
      : [...(continuationContext!.requiredCharacters || []), ...(continuationContext!.optionalCharacters || [])];
    
    const mergedCharacters = mergeCharacters(initialCharacters, llmCharacters);
    
    // Persist LLM characters (unified for both flows)
    const initialCharacterNames = new Set(
      initialCharacters.map(c => normalizeCharacterName(c.name))
    );
    const llmCharacterResults = await persistLlmCharacters(
      request.userId,
      llmCharacters,
      initialCharacterNames
    );
    
    // Enrich mergedCharacters with DB IDs
    for (const char of mergedCharacters) {
      if (char.source === 'llm_generated' && !char.id) {
        const normalized = normalizeCharacterName(char.name);
        const result = llmCharacterResults.get(normalized);
        if (result) {
          char.id = result.characterId;
          (char as any)._llmIsNew = result.isNew;
          (char as any)._llmHasTurnaround = result.hasTurnaround;
        }
      }
    }
    
    logger.info({
      requestId,
      llmCharacterResults: Array.from(llmCharacterResults.entries()).map(([name, r]) => ({
        name, characterId: r.characterId, isNew: r.isNew, hasTurnaround: r.hasTurnaround,
      })),
    }, 'LLM characters persisted and enriched');
    
    // Save text generation checkpoint
    await saveTextGenerationCheckpoint(requestId, {
      text,
      spec,
      mergedCharacters,
      selectedCharacters,
      ...(generationType === 'continuation' && {
        isContinuation: true,
        seriesId: continuationContext!.seriesId,
        partNumber: continuationContext!.partNumber,
      }),
    });
    
    // Validation (unified for both flows)
    const validationResult = await validateStoryScenes({
      requestId,
      text,
      spec,
      maxRetries: 2,
    });
    
    const validatedText = validationResult.validatedText;
    const validationTimeMs = validationResult.validationTimeMs;
    
    // Save validation checkpoint (standard flow saves it, continuation doesn't need separate checkpoint)
    if (generationType === 'standard') {
      await saveValidationCheckpoint(requestId, validatedText, validationTimeMs, {
        text,
        spec,
        mergedCharacters,
        selectedCharacters,
      });
    }
    
    // Create story record (unified for both flows)
    const storyId = await createStoryRecord({
      userId: request.userId,
      storyRequestId: request.id,
      childProfileId: request.childProfileId,
      text: validatedText,
      spec,
      characters: mergedCharacters,
      goal: request.goal,
      generationTimeMs: Date.now() - startTime,
      metadata: {
        textGenerationTimeMs,
        validationTimeMs,
        sceneCount: validatedText.scenes.length,
        fullTextLength: validatedText.fullText?.length || 0,
        modelVersion: 'gemini-2.5-flash',
        plotExampleId: chosenPlotExampleId,
        worldRuleId: chosenWorldRuleId,
        llmGeneratedCharacters: llmCharacters,
        imageStyle: (spec as any).imageStyle,
      },
      ...(generationType === 'continuation' && {
        seriesData: {
          seriesId: continuationContext!.seriesId,
          partNumber: continuationContext!.partNumber,
        },
      }),
    });
    
    // Save story creation checkpoint
    await saveStoryCreationCheckpoint(requestId, storyId, {
      text: validatedText,
      spec,
      mergedCharacters,
      selectedCharacters,
      validationComplete: true,
      validatedText,
      validationTimeMs,
    });
    
    logger.info({ requestId, storyId, duration: Date.now() - startTime, generationType }, 'Text generation phase completed');
    
    return {
      text: validatedText,
      llmCharacters,
      mergedCharacters,
      spec,
      selectedCharacters: selectedCharacters as CharacterData[],
      textGenerationTimeMs,
      validationTimeMs,
      storyId,
    };
    
  } catch (error) {
    await handleRequestError(requestId, error, {
      logMessage: 'Story text generation failed',
      extraFields: { generationType },
    });
    throw error; // handleRequestError always throws
  }
}

export async function generateStoryImages(params: any): Promise<void> {
  throw new Error('Not implemented yet');
}
