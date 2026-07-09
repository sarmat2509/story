/**
 * Shared types for story orchestration
 */

import type { StorySpec } from '../../ai/types';
import type { CharacterData } from '../types';

export type GenerationType = 'standard' | 'continuation';

export interface GenerateTextParams {
  requestId: string;
  request: any; // StoryRequestData
  generationType: GenerationType;
  continuationContext?: {
    previousOutlines: any[];
    requiredCharacters: CharacterData[];
    optionalCharacters: CharacterData[];
    usedPlots: string[];
    seriesId: string;
    partNumber: number;
  };
}

export interface GenerateTextResult {
  text: any;
  llmCharacters: CharacterData[];
  mergedCharacters: CharacterData[];
  spec: StorySpec;
  selectedCharacters: CharacterData[];
  textGenerationTimeMs: number;
  validationTimeMs?: number;
  textValidation?: TextValidationSummary;
  storyId: string;
}

export interface GenerateImagesParams {
  requestId: string;
  storyId: string;
  text: any;
  spec: StorySpec;
  mergedCharacters: CharacterData[];
  generationType: GenerationType;
  continuationData?: {
    seriesId: string;
    firstStoryId: string;
  };
}

export interface CreateStoryParams {
  userId: string;
  storyRequestId: string;
  childProfileId?: string | null;
  createdByMode?: string | null;
  createdByChildProfileId?: string | null;
  parentReviewRequired?: boolean | null;
  text: any;
  spec: StorySpec;
  characters: CharacterData[];
  goal?: string | null;
  generationTimeMs: number;
  metadata: {
    textGenerationTimeMs?: number;
    validationTimeMs?: number;
    sceneCount: number;
    fullTextLength: number;
    modelVersion: string;
    plotExampleId?: string;
    worldRuleId?: string;
    storyArtifactId?: string;
    storyArtifactCode?: string;
    storyArtifactTitle?: string;
    storyArtifactImagePath?: string;
    storyArtifactSelection?: unknown;
    directorDebug?: unknown;
    llmGeneratedCharacters?: any[];
    imageStyle?: string;
    mapTile?: unknown;
    textValidation?: TextValidationSummary;
  };
  seriesData?: {
    seriesId: string;
    partNumber: number;
  };
  isScheduledContinuation?: boolean;
}

export interface CreateStoryStubParams {
  userId: string;
  storyRequestId: string;
  childProfileId?: string | null;
  createdByMode?: string | null;
  createdByChildProfileId?: string | null;
  parentReviewRequired?: boolean | null;
  spec: StorySpec;
  seriesData?: {
    seriesId: string;
    partNumber: number;
  };
  isScheduledContinuation?: boolean;
}

export interface ValidateParams {
  requestId: string;
  userId: string;
  storyId?: string;
  text: any;
  spec: StorySpec;
  maxRetries?: number;
}

export interface ValidateResult {
  validatedText: any;
  validationTimeMs: number;
  textValidation: TextValidationSummary;
}

export type TextValidationAttemptPhase = 'initial' | 'revalidation';

export type TextValidationAttemptRecord = {
  sceneId: number;
  attempt: number;
  phase: TextValidationAttemptPhase;
  durationMs: number;
  isValid: boolean;
  score: number;
  result: {
    sceneId: number;
    isValid: boolean;
    violations: Array<{ category: string; message: string; severity?: string; suggestion?: string }>;
  };
  rawResult: unknown;
  rawManifest: Record<string, unknown> | null;
};

export type TextValidationSummary = {
  version: 1;
  status: 'passed' | 'failed';
  score: number;
  sceneCount: number;
  attemptCount: number;
  validationTimeMs: number;
  passedSceneIds: number[];
  failedSceneIds: number[];
  attempts: TextValidationAttemptRecord[];
};
