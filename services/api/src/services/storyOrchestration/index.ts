/**
 * Story Orchestration - Unified API
 * 
 * This module provides unified generation logic for both standard and continuation stories.
 * All public functions maintain backward compatibility with the original API.
 */

// Re-export main orchestration functions (will be implemented in storyOrchestrationService.ts)
export { processStoryRequest, processStoryImages } from '../storyOrchestrationService';

// Export core generation functions
export { generateStoryText, generateStoryImages } from './coreGeneration';

// Export utilities
export { 
  extractLlmCharactersFromText,
  createSceneRecords,
  handleRequestError,
  buildInitialContext
} from './utilities';

// Export story record creation
export {
  createStoryRecord,
  createStoryStub,
  enrichStoryRecord,
  mergeCharacters,
  persistLlmCharacters,
  syncStoryClosingKeepsakeLabel,
} from './storyRecords';

// Export validation
export { validateStoryTextScenes, validateStoryScenes } from './validation';

// Export checkpoint management
export { 
  saveTextGenerationCheckpoint,
  saveValidationCheckpoint,
  saveStoryCreationCheckpoint,
  loadCheckpoint
} from './checkpoints';

// Export shared types
export * from './types';
