/**
 * Checkpoint management functions
 */

import { getStoryRepository } from '../../repositories';
import { logger } from '../../utils/logger';

/**
 * Save text generation checkpoint
 */
export async function saveTextGenerationCheckpoint(
  requestId: string, 
  data: {
    outline: any;
    text: any;
    spec: any;
    mergedCharacters: any[];
    selectedCharacters?: any[];
    seriesId?: string;
    partNumber?: number;
    isContinuation?: boolean;
  }
): Promise<void> {
  const specForCheckpoint = { ...data.spec, policyProfile: undefined };
  
  const checkpointData: any = {
    outline: data.outline,
    text: data.text,
    spec: specForCheckpoint,
    mergedCharacters: data.mergedCharacters,
  };
  
  // Standard-specific fields
  if (data.selectedCharacters) {
    checkpointData.selectedCharacters = data.selectedCharacters;
  }
  
  // Continuation-specific fields
  if (data.isContinuation) {
    checkpointData.isContinuation = true;
    checkpointData.seriesId = data.seriesId;
    checkpointData.partNumber = data.partNumber;
    checkpointData.validatedText = data.text; // No validation for continuation
  }
  
  await getStoryRepository().updateRequest(requestId, {
    intermediateData: checkpointData
  });
  
  logger.info({ requestId, checkpoint: 'text' }, 'Text generation checkpoint saved');
}

/**
 * Save validation checkpoint (standard flow only)
 */
export async function saveValidationCheckpoint(
  requestId: string,
  validatedText: any,
  validationTimeMs: number,
  existingCheckpoint?: any
): Promise<void> {
  const currentCheckpoints = existingCheckpoint || {};
  
  await getStoryRepository().updateRequest(requestId, {
    intermediateData: {
      ...currentCheckpoints,
      validationComplete: true,
      validatedText,
      validationTimeMs,
    }
  });
  
  logger.info({ requestId, checkpoint: 'validation' }, 'Validation checkpoint saved');
}

/**
 * Save story creation checkpoint
 */
export async function saveStoryCreationCheckpoint(
  requestId: string,
  storyId: string,
  existingCheckpoint?: any,
  createdStory?: any
): Promise<void> {
  const currentCheckpoints = existingCheckpoint || {};
  
  const checkpointData: any = {
    ...currentCheckpoints,
    storyId
  };
  
  // Continuation-specific: include created story reference
  if (createdStory) {
    checkpointData.createdStory = { id: createdStory.id };
  }
  
  await getStoryRepository().updateRequest(requestId, {
    intermediateData: checkpointData
  });
  
  logger.info({ requestId, storyId, checkpoint: 'story_saved' }, 'Story creation checkpoint saved');
}

/**
 * Load checkpoint from request
 */
export async function loadCheckpoint(requestId: string): Promise<any> {
  const request = await getStoryRepository().findRequestById(requestId);
  
  if (!request) {
    throw new Error(`Request ${requestId} not found`);
  }
  
  return (request.intermediateData as any) || {};
}
