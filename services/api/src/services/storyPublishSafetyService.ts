import type { GraphicNovelPage, Story } from '../db/schema';
import {
  getAssetRepository,
  getGraphicNovelRepository,
  getImageValidationRepository,
  getSceneRepository,
} from '../repositories';
import { config } from '../config';
import { normalizeAssetStoragePath } from './entityAssetCleanupService';

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

export interface GraphicNovelPagePublishValidationEvidence {
  panelCount: number;
  panelScores: Record<number, number>;
  missingPanelNumbers: number[];
  failedPanelNumbers: number[];
  score: number | null;
}

type GraphicNovelPagePublishLike = Pick<
  GraphicNovelPage,
  'status' | 'layoutJson' | 'generationParams'
>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function panelModesFromGenerationParams(
  generationParams: Record<string, unknown>
): unknown[] {
  const panelRepair = asRecord(generationParams.panelRepair);
  if (Array.isArray(panelRepair.modes) && panelRepair.modes.length > 0) {
    return panelRepair.modes;
  }

  const artValidationRepair = asRecord(generationParams.artValidationRepair);
  const attempts = Array.isArray(artValidationRepair.attempts)
    ? artValidationRepair.attempts.map(asRecord)
    : [];
  const selectedAttempt = finiteNumber(artValidationRepair.selectedAttempt);
  const selected =
    (selectedAttempt !== null
      ? attempts.find((attempt) => finiteNumber(attempt.attempt) === selectedAttempt)
      : undefined) ??
    attempts[attempts.length - 1];
  const selectedPanelRepair = asRecord(selected?.panelRepair);
  return Array.isArray(selectedPanelRepair.modes) ? selectedPanelRepair.modes : [];
}

/**
 * Resolve validation evidence for the exact panel images composing the current page.
 * Initial generation stores one score per selected panel; later manual repairs append
 * accepted replacement scores without rewriting the historical generation summary.
 */
export function buildGraphicNovelPagePublishValidationEvidence(
  page: GraphicNovelPagePublishLike
): GraphicNovelPagePublishValidationEvidence {
  const layout = asRecord(page.layoutJson);
  const layoutPanels = Array.isArray(layout.panels) ? layout.panels : [];
  const generationParams = asRecord(page.generationParams);
  const panelRepair = asRecord(generationParams.panelRepair);
  const panelCount =
    layoutPanels.length || positiveInteger(panelRepair.panelCount) || 0;
  const panelScores = new Map<number, number>();

  for (const rawMode of panelModesFromGenerationParams(generationParams)) {
    const mode = asRecord(rawMode);
    const panelNumber = positiveInteger(mode.panelNumber);
    const score = finiteNumber(mode.score);
    if (panelNumber && score !== null) {
      panelScores.set(panelNumber, score);
    }
  }

  const manualPanelRepairs = Array.isArray(generationParams.manualPanelRepairs)
    ? generationParams.manualPanelRepairs.map(asRecord)
    : [];
  for (const repair of manualPanelRepairs) {
    const panels = Array.isArray(repair.panels) ? repair.panels.map(asRecord) : [];
    for (const panel of panels) {
      if (panel.accepted !== true) continue;
      const panelNumber = positiveInteger(panel.panelNumber);
      const score = finiteNumber(panel.score);
      if (panelNumber && score !== null) {
        panelScores.set(panelNumber, score);
      }
    }
  }

  const failedPanelNumbers = Array.isArray(panelRepair.failedPanels)
    ? panelRepair.failedPanels
        .map((entry) => positiveInteger(asRecord(entry).panelNumber) ?? positiveInteger(entry))
        .filter((panelNumber): panelNumber is number => panelNumber !== null)
    : [];
  if (
    failedPanelNumbers.length === 0 &&
    (positiveInteger(panelRepair.failedPanelCount) ?? 0) > 0
  ) {
    // The count proves a current failure even if an older row omitted panel details.
    failedPanelNumbers.push(0);
  }

  const missingPanelNumbers: number[] = [];
  for (let panelNumber = 1; panelNumber <= panelCount; panelNumber += 1) {
    if (!panelScores.has(panelNumber)) {
      missingPanelNumbers.push(panelNumber);
    }
  }

  const orderedScores = Array.from(panelScores.values());
  const complete =
    page.status === 'completed' &&
    panelCount > 0 &&
    missingPanelNumbers.length === 0;
  const score = !complete
    ? null
    : failedPanelNumbers.length > 0
      ? Math.min(0, ...orderedScores)
      : Math.min(...orderedScores);

  return {
    panelCount,
    panelScores: Object.fromEntries(
      Array.from(panelScores.entries()).sort(([left], [right]) => left - right)
    ),
    missingPanelNumbers,
    failedPanelNumbers,
    score,
  };
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
  const completedImageStoragePaths = new Set<string>();
  const derivedValidationScores: PublishImageValidationScore[] = [];
  const authoritativeDerivedValidationPaths = new Set<string>();

  if (visibility === 'public' && config.image.enableValidation) {
    const scenes = await getSceneRepository().findByStoryId(story.id);
    for (const scene of scenes) {
      if (!scene.imageUrl) continue;
      const storagePath = normalizeAssetStoragePath(scene.imageUrl);
      if (storagePath) completedImageStoragePaths.add(storagePath);
    }

    const storyFormat = getStoryFormat(story.metadata);
    const pageEvidenceByNumber = new Map<
      number,
      GraphicNovelPagePublishValidationEvidence
    >();
    if (storyFormat !== 'story') {
      const project = await getGraphicNovelRepository().findProjectByStoryId(story.id);
      if (!project) {
        throw new PublishSafetyError({
          allowed: false,
          code: 'STORY_INCOMPLETE',
          message: 'Comic pages are not ready to publish',
        });
      }
      const pages = await getGraphicNovelRepository().findPagesByProjectId(project.id);
      if (pages.length === 0 || pages.some((page) => page.status !== 'completed')) {
        throw new PublishSafetyError({
          allowed: false,
          code: 'STORY_INCOMPLETE',
          message: 'Comic pages are not ready to publish',
        });
      }

      const pageAssetIds = pages
        .map((page) => page.imageAssetId)
        .filter((assetId): assetId is string => Boolean(assetId));
      const pageAssets = await getAssetRepository().findByIds(pageAssetIds);
      const pageAssetById = new Map(pageAssets.map((asset) => [asset.id, asset]));

      for (const page of pages) {
        const asset = page.imageAssetId ? pageAssetById.get(page.imageAssetId) : null;
        const storagePath =
          asset?.status === 'completed' &&
          asset.assetType === 'image' &&
          asset.storyId === story.id
            ? asset.storagePath
            : page.imageUrl
              ? normalizeAssetStoragePath(page.imageUrl)
              : null;
        if (!storagePath) {
          throw new PublishSafetyError({
            allowed: false,
            code: 'STORY_INCOMPLETE',
            message: 'Comic pages are not ready to publish',
            details: { pageNumber: page.pageNumber },
          });
        }

        completedImageStoragePaths.add(storagePath);
        authoritativeDerivedValidationPaths.add(storagePath);
        const evidence = buildGraphicNovelPagePublishValidationEvidence(page);
        pageEvidenceByNumber.set(page.pageNumber, evidence);
        if (evidence.score !== null) {
          derivedValidationScores.push({
            storagePath,
            score: evidence.score,
            validationStatus: 'completed',
          });
        }
      }
    }

    if (story.coverAssetId) {
      const coverAsset = await getAssetRepository().findById(story.coverAssetId);
      if (
        coverAsset?.status === 'completed' &&
        coverAsset.assetType === 'image' &&
        coverAsset.storyId === story.id
      ) {
        completedImageStoragePaths.add(coverAsset.storagePath);
        const generationParams = asRecord(coverAsset.generationParams);
        if (generationParams.kind === 'graphic_novel_cover_panel') {
          authoritativeDerivedValidationPaths.add(coverAsset.storagePath);
          const pageNumber = positiveInteger(generationParams.pageNumber);
          const panelIndex = positiveInteger(generationParams.panelIndex);
          const panelScore =
            pageNumber && panelIndex
              ? pageEvidenceByNumber.get(pageNumber)?.panelScores[panelIndex]
              : undefined;
          if (panelScore !== undefined) {
            derivedValidationScores.push({
              storagePath: coverAsset.storagePath,
              score: panelScore,
              validationStatus: 'completed',
            });
          }
        }
      }
    }
  }

  const currentImageStoragePaths = Array.from(completedImageStoragePaths);
  const validationRows =
    currentImageStoragePaths.length > 0
      ? await getImageValidationRepository().listByStoragePaths(currentImageStoragePaths)
      : [];

  const decision = evaluateStoryPublishSafety({
    story,
    visibility,
    imageValidationEnabled: config.image.enableValidation,
    imageValidationMinAcceptScore: config.image.validationMinAcceptScore,
    completedImageStoragePaths: currentImageStoragePaths,
    imageValidationScores: [
      ...validationRows
        .filter(
          (row) => !authoritativeDerivedValidationPaths.has(row.imageStoragePath)
        )
        .map((row) => ({
          storagePath: row.imageStoragePath,
          score: row.validationScore,
          validationStatus: row.validationStatus,
        })),
      ...derivedValidationScores,
    ],
  });

  if (decision.allowed === false) {
    throw new PublishSafetyError(decision);
  }
}
