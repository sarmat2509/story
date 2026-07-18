import type { Story } from '../db/schema';
import { getAssetRepository, getImageValidationRepository } from '../repositories';
import { config } from '../config';

export type PublishSafetyCode =
  | 'STORY_HIDDEN'
  | 'PARENT_REVIEW_PENDING'
  | 'PARENT_REVIEW_REJECTED'
  | 'STORY_INCOMPLETE'
  | 'STORY_TEXT_NOT_VALIDATED'
  | 'IMAGE_VALIDATION_REQUIRED'
  | 'IMAGE_VALIDATION_FAILED';

export type PublishSafetyDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: PublishSafetyCode;
      message: string;
      details?: Record<string, unknown>;
    };

export class PublishSafetyError extends Error {
  readonly code: PublishSafetyCode;
  readonly statusCode = 409;
  readonly details?: Record<string, unknown>;

  constructor(decision: Exclude<PublishSafetyDecision, { allowed: true }>) {
    super(decision.message);
    this.name = 'PublishSafetyError';
    this.code = decision.code;
    this.details = decision.details;
  }
}

export interface PublishSafetyStoryLike {
  hidden?: boolean | null;
  createdByMode?: string | null;
  parentReviewStatus?: string | null;
  fullText?: string | null;
  policyChecks?: unknown;
  metadata?: unknown;
}

export interface PublishImageValidationScore {
  storagePath: string;
  score: number | null;
  validationStatus?: string | null;
}

function getPolicyFlag(policyChecks: unknown, key: string): boolean {
  if (!policyChecks || typeof policyChecks !== 'object') {
    return false;
  }
  return (policyChecks as Record<string, unknown>)[key] === true;
}

function getStoryFormat(metadata: unknown): 'story' | 'graphic_novel' | 'mixed_story' {
  if (!metadata || typeof metadata !== 'object') return 'story';
  const value = (metadata as Record<string, unknown>).storyFormat;
  return value === 'graphic_novel' || value === 'mixed_story' ? value : 'story';
}

function getMetadataFlag(metadata: unknown, key: string): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as Record<string, unknown>)[key] === true;
}

export function evaluateStoryPublishSafety(input: {
  story: PublishSafetyStoryLike;
  visibility: 'public' | 'unlisted';
  imageValidationEnabled: boolean;
  imageValidationMinAcceptScore: number;
  completedImageStoragePaths: string[];
  imageValidationScores: PublishImageValidationScore[];
}): PublishSafetyDecision {
  const { story } = input;

  if (story.hidden === true) {
    return {
      allowed: false,
      code: 'STORY_HIDDEN',
      message: 'Hidden stories cannot be published',
    };
  }

  if (story.createdByMode === 'child') {
    const reviewStatus = story.parentReviewStatus ?? 'pending';
    if (reviewStatus === 'pending') {
      return {
        allowed: false,
        code: 'PARENT_REVIEW_PENDING',
        message: 'A parent must approve this child-created story before it can be shared',
      };
    }
    if (reviewStatus === 'rejected') {
      return {
        allowed: false,
        code: 'PARENT_REVIEW_REJECTED',
        message: 'Rejected child-created stories cannot be shared',
      };
    }
  }

  if (!story.fullText || story.fullText.trim().length === 0) {
    return {
      allowed: false,
      code: 'STORY_INCOMPLETE',
      message: 'Story is not ready to publish',
    };
  }

  const storyFormat = getStoryFormat(story.metadata);
  if (
    storyFormat !== 'story' &&
    !getMetadataFlag(story.metadata, 'graphicNovelGenerationComplete')
  ) {
    return {
      allowed: false,
      code: 'STORY_INCOMPLETE',
      message: 'Comic pages are not ready to publish',
    };
  }
  const failedComicPages =
    story.metadata && typeof story.metadata === 'object'
      ? (story.metadata as Record<string, unknown>).failedGraphicNovelPages
      : null;
  if (storyFormat !== 'story' && Array.isArray(failedComicPages) && failedComicPages.length > 0) {
    return {
      allowed: false,
      code: 'STORY_INCOMPLETE',
      message: 'Failed comic pages must be regenerated before publishing',
      details: { failedPageCount: failedComicPages.length },
    };
  }

  if (!getPolicyFlag(story.policyChecks, 'textValidated')) {
    return {
      allowed: false,
      code: 'STORY_TEXT_NOT_VALIDATED',
      message: 'Story text has not passed validation',
    };
  }

  if (
    input.visibility === 'public' &&
    input.imageValidationEnabled &&
    input.completedImageStoragePaths.length > 0
  ) {
    const bestScoreByPath = new Map<string, number>();
    for (const row of input.imageValidationScores) {
      if (row.validationStatus === 'provider_blocked' || row.score == null) continue;
      const previous = bestScoreByPath.get(row.storagePath);
      if (previous == null || row.score > previous) {
        bestScoreByPath.set(row.storagePath, row.score);
      }
    }

    const missingValidation = input.completedImageStoragePaths.filter(
      (storagePath) => !bestScoreByPath.has(storagePath)
    );
    if (missingValidation.length > 0) {
      return {
        allowed: false,
        code: 'IMAGE_VALIDATION_REQUIRED',
        message: 'Story images must pass validation before public publishing',
        details: { missingValidationCount: missingValidation.length },
      };
    }

    const failedImages = input.completedImageStoragePaths
      .map((storagePath) => ({
        storagePath,
        score: bestScoreByPath.get(storagePath) ?? 0,
      }))
      .filter((row) => row.score <= input.imageValidationMinAcceptScore);

    if (failedImages.length > 0) {
      return {
        allowed: false,
        code: 'IMAGE_VALIDATION_FAILED',
        message: 'Story images did not pass validation for public publishing',
        details: {
          failedImageCount: failedImages.length,
          minAcceptScore: input.imageValidationMinAcceptScore,
        },
      };
    }
  }

  return { allowed: true };
}

export async function assertStoryPublishSafety(
  story: Story,
  visibility: 'public' | 'unlisted'
): Promise<void> {
  const completedImageAssets = (await getAssetRepository().findByStoryId(story.id, 'image'))
    .filter((asset) => asset.status === 'completed')
    .filter((asset) => !asset.storagePath.includes('/rejected/'));
  const completedImageStoragePaths = completedImageAssets.map((asset) => asset.storagePath);

  const validationRows =
    visibility === 'public' && config.image.enableValidation && completedImageStoragePaths.length > 0
      ? await getImageValidationRepository().listByStoragePaths(completedImageStoragePaths)
      : [];

  const decision = evaluateStoryPublishSafety({
    story,
    visibility,
    imageValidationEnabled: config.image.enableValidation,
    imageValidationMinAcceptScore: config.image.validationMinAcceptScore,
    completedImageStoragePaths,
    imageValidationScores: validationRows.map((row) => ({
      storagePath: row.imageStoragePath,
      score: row.validationScore,
      validationStatus: row.validationStatus,
    })),
  });

  if (decision.allowed === false) {
    throw new PublishSafetyError(decision);
  }
}
