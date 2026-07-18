import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth, requireParentSession } from '../middleware/authMiddleware';
import * as characterService from '../services/characterService';
import { CreateCharacterSchema, UpdateCharacterSchema } from '@wondertales/shared';
import type { Character } from '../db/schema';
import { logger } from '../utils/logger';
import {
  assertUserPhotoInputs,
  getReferencePhotoUrls,
  isPhotoInputSafetyError,
} from '../services/photoInputSafetyService';
import {
  assertStoryFromDrawingAccessForPhotos,
  isStoryFromDrawingAccessError,
} from '../services/storyFromDrawingAccessService';
import {
  isCharacterQuotaError,
  releaseManualCharacterQuotaReservation,
  reserveManualCharacterQuota,
} from '../services/characterQuotaService';

import { CharacterAnalysisService } from '../services/characterAnalysisService';
import { getTextProvider } from '../services/aiService';
import {
  generateTurnaroundSheetFromReference,
  generateLlmCharacterTurnaround,
} from '../services/turnaroundSheetService';
import { getChildProfileRepository } from '../repositories';

const router = Router();

function requireParentOrScopedChildSession(req: Request, res: Response, next: NextFunction): void {
  if (req.sessionMode !== 'child') {
    next();
    return;
  }

  if (!req.childProfileId || !req.sessionScopes?.includes('child_mode')) {
    res.status(403).json({
      status: 'error',
      message: 'Child session scope required',
      code: 'SESSION_SCOPE_REQUIRED',
      requiredScope: 'child_mode',
    });
    return;
  }

  next();
}

function sendPhotoInputSafetyError(res: Parameters<typeof requireAuth>[1], error: unknown): boolean {
  if (!isPhotoInputSafetyError(error)) {
    return false;
  }

  res.status(error.statusCode).json({
    status: 'error',
    code: error.code,
    error: error.message,
    index: error.index,
  });
  return true;
}

function sendStoryFromDrawingAccessError(res: Parameters<typeof requireAuth>[1], error: unknown): boolean {
  if (!isStoryFromDrawingAccessError(error)) {
    return false;
  }

  res.status(error.statusCode).json({
    status: 'error',
    code: error.code,
    error: error.message,
    featureSlug: error.featureSlug,
  });
  return true;
}

function sendCharacterQuotaError(res: Response, error: unknown): boolean {
  if (!isCharacterQuotaError(error)) {
    return false;
  }

  res.status(error.statusCode).json({
    status: 'error',
    code: error.code,
    error: error.message,
    featureSlug: error.featureSlug,
    limit: error.limit,
    used: error.used,
    remaining: error.remaining,
    resetsAt: error.resetsAt,
  });
  return true;
}

async function releaseManualCharacterQuotaOnFailure(
  userId: string,
  reservationId: string | null,
  childProfileId: string | null | undefined,
  error: unknown
): Promise<void> {
  if (!reservationId) return;

  try {
    await releaseManualCharacterQuotaReservation(userId, reservationId, {
      reason: 'generation_failed',
      childProfileId: childProfileId ?? null,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } catch (releaseError) {
    logger.warn(
      { err: releaseError, userId, reservationId },
      'Failed to release manual character quota reservation after generation failure'
    );
  }
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(objectValue[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stableReferencePhotoUrls(value: unknown): string {
  return stableJson(getReferencePhotoUrls(value));
}

function modelGenerationInputsChanged(
  existing: Character,
  data: Partial<{
    description: string | null;
    aiGeneratedDescription: string | null;
    referencePhotos: unknown;
  }>
): boolean {
  if (
    data.description !== undefined &&
    normalizeText(data.description) !== normalizeText(existing.description)
  ) {
    return true;
  }
  if (
    data.aiGeneratedDescription !== undefined &&
    normalizeText(data.aiGeneratedDescription) !== normalizeText(existing.aiGeneratedDescription)
  ) {
    return true;
  }
  if (
    data.referencePhotos !== undefined &&
    stableReferencePhotoUrls(data.referencePhotos) !== stableReferencePhotoUrls(existing.referencePhotos)
  ) {
    return true;
  }
  return false;
}

async function generateManualCharacterTurnaround(character: Character, userId: string): Promise<void> {
  const referencePhotos = character.referencePhotos as Array<{ url?: string }> | undefined;
  const hasPhotos = referencePhotos && Array.isArray(referencePhotos) && referencePhotos.length > 0;
  const firstPhoto = hasPhotos ? referencePhotos!.find(p => p && p.url) : undefined;
  const aiDescription = character.aiGeneratedDescription
    || (character as any).descriptionEn
    || (character as any).appearance
    || character.description
    || undefined;

  if (firstPhoto?.url) {
    await generateTurnaroundSheetFromReference({
      targetType: 'character',
      targetId: character.id,
      referencePhotoUrls: referencePhotos!.map(p => p.url!).filter(Boolean),
      characterName: character.name,
      userId,
      aiDescription,
    });
    return;
  }

  if (aiDescription && aiDescription.trim().length > 0) {
    await generateLlmCharacterTurnaround({
      characterId: character.id,
      userId,
      characterName: character.name,
      characterDescription: aiDescription.trim(),
      useCache: character.isHidden,
    });
    return;
  }

  throw new Error('Character must have reference photos or description for turnaround');
}

// Initialize analysis service
function getAnalysisService(): CharacterAnalysisService {
  return new CharacterAnalysisService(getTextProvider());
}

// POST /api/v1/characters/analyze - Analyze character photos
router.post('/analyze', requireAuth, requireParentOrScopedChildSession, async (req, res) => {
  const { photos, characterType, language } = req.body;
  
  try {
    // Validation
    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'Photos array is required and must not be empty'
      });
    }
    
    if (!characterType || !['person', 'animal', 'imaginary'].includes(characterType)) {
      return res.status(400).json({
        status: 'error',
        error: 'Valid characterType is required (person, animal, or imaginary)'
      });
    }

    assertUserPhotoInputs({
      photos,
      userId: req.user!.id,
      allowedPhotoTypes: ['character'],
    });
    await assertStoryFromDrawingAccessForPhotos({
      userId: req.user!.id,
      photoCount: photos.length,
    });
    
    logger.info({ 
      userId: req.user!.id, 
      photoCount: photos.length, 
      characterType,
      language: language || 'en'
    }, 'Analyzing character photos');
    
    // Call analysis service
    const { recordUsage } = await import('../services/aiUsageService');
    const usageContext = { userId: req.user!.id };
    const result = await getAnalysisService().analyzeCharacter(
      {
        photos,
        characterType,
        language: language || 'en'
      },
      { onUsage: (u) => recordUsage(u, usageContext) }
    );
    
    // Map result to frontend-friendly format
    const analysis: any = {
      description: result.detailedDescription
    };
    
    // Map appearance traits based on character type
    if (result.appearanceTraits) {
      if (characterType === 'animal') {
        analysis.petAppearance = {
          breed: result.appearanceTraits.breed || undefined,
          furColor: result.appearanceTraits.furColor || undefined,
          furPattern: result.appearanceTraits.furPattern || undefined,
          furLength: result.appearanceTraits.furLength || undefined,
          size: result.appearanceTraits.size || undefined,
          eyeColor: result.appearanceTraits.eyeColorAnimal || undefined,
          distinctiveFeatures: result.distinctiveFeatures || []
        };
      } else if (characterType === 'person') {
        analysis.humanAppearance = {
          ageRange: mapAgeRange(result.appearanceTraits.age),
          hairColor: result.appearanceTraits.hairColor || undefined,
          hairLength: result.appearanceTraits.hairLength || undefined,
          hairStyle: result.appearanceTraits.hairStyle || undefined,
          eyeColor: result.appearanceTraits.eyeColor || undefined,
          skinTone: result.appearanceTraits.skinTone || undefined,
          height: result.appearanceTraits.height || undefined,
          build: result.appearanceTraits.bodyType || undefined,
          clothingStyle: result.clothing?.style || undefined,
          distinctiveFeatures: result.distinctiveFeatures || []
        };
      } else if (characterType === 'imaginary') {
        analysis.imaginaryAppearance = {
          species: result.appearanceTraits?.fantasyType || undefined,
          primaryColor: extractPrimaryColor(result.appearanceTraits),
          secondaryColor: extractSecondaryColor(result.appearanceTraits),
          size: result.appearanceTraits?.size || undefined,
          magicalFeatures: result.appearanceTraits?.magicalFeatures || []
        };
      }
    }
    
    res.json({
      status: 'success',
      analysis
    });
  } catch (error) {
    if (sendPhotoInputSafetyError(res, error)) return;
    if (sendStoryFromDrawingAccessError(res, error)) return;

    logger.error({ 
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error,
      userId: req.user?.id,
      characterType,
      photoCount: photos?.length || 0
    }, 'Error analyzing character photos');
    res.status(500).json({
      status: 'error',
      error: 'Failed to analyze photos'
    });
  }
});

// Helper functions to map analysis results to frontend types
function mapAgeRange(age: string | null | undefined): string | undefined {
  if (!age) return undefined;
  const ageMap: Record<string, string> = {
    'infant': 'child',
    'toddler': 'child',
    'child': 'child',
    'teen': 'teenager',
    'adult': 'adult',
    'elderly': 'elderly'
  };
  return ageMap[age] || 'adult';
}

// Extract primary/secondary colors from appearance traits
function extractPrimaryColor(traits: any): string | undefined {
  if (!traits) return undefined;
  // Priority: furColor (for animal-like), then first magical feature color
  if (traits.furColor) return traits.furColor;
  if (traits.magicalFeatures && traits.magicalFeatures.length > 0) {
    // Try to extract color from magical features description
    const firstFeature = traits.magicalFeatures[0].toLowerCase();
    const colorKeywords = ['red', 'blue', 'green', 'purple', 'gold', 'silver', 'rainbow'];
    for (const color of colorKeywords) {
      if (firstFeature.includes(color)) return color;
    }
  }
  return undefined;
}

function extractSecondaryColor(traits: any): string | undefined {
  if (!traits) return undefined;
  // Try to find secondary color from magical features or patterns
  if (traits.magicalFeatures && traits.magicalFeatures.length > 1) {
    const secondFeature = traits.magicalFeatures[1].toLowerCase();
    const colorKeywords = ['red', 'blue', 'green', 'purple', 'gold', 'silver', 'rainbow'];
    for (const color of colorKeywords) {
      if (secondFeature.includes(color)) return color;
    }
  }
  return undefined;
}

// GET /api/v1/characters - List characters (optionally filtered by type)
router.get('/', requireAuth, requireParentOrScopedChildSession, async (req, res) => {
  try {
    const userId = req.user!.id;
    const type = req.query.type as characterService.CharacterType | undefined;
    
    const characters = await characterService.getCharacters(userId, type, {
      ...(req.sessionMode === 'child' && req.childProfileId ? { accessibleByChildProfileId: req.childProfileId } : {}),
    });
    
    res.json({
      status: 'success',
      characters,
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error fetching characters');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch characters'
    });
  }
});

// POST /api/v1/characters - Create character
router.post('/', requireAuth, requireParentOrScopedChildSession, async (req, res) => {
  let quotaReservationId: string | null = null;
  let quotaReservationChildProfileId: string | null = null;

  try {
    const userId = req.user!.id;
    
    // Log incoming request
    logger.info({ 
      userId, 
      body: req.body,
      hasPhotos: !!req.body.referencePhotos,
      photoCount: req.body.referencePhotos?.length || 0
    }, 'Creating character - request received');
    
    // Validate input
    const validation = CreateCharacterSchema.safeParse(req.body);
    if (!validation.success) {
      logger.error({ 
        userId,
        body: req.body,
        validationErrors: validation.error.format(),
        zodIssues: validation.error.issues
      }, 'Character validation failed');
      
      return res.status(400).json({
        status: 'error',
        error: 'Validation failed',
        details: validation.error.format()
      });
    }
    
    const data = {
      ...validation.data,
      childProfileId: req.sessionMode === 'child'
        ? req.childProfileId!
        : (validation.data as { childProfileId?: string | null }).childProfileId ?? null,
      createdByMode: req.sessionMode === 'child' ? 'child' : 'parent',
      createdByChildProfileId: req.sessionMode === 'child' ? req.childProfileId! : null,
    };

    if (data.childProfileId) {
      const childProfile = await getChildProfileRepository().findById(data.childProfileId, userId);
      if (!childProfile) {
        return res.status(400).json({
          status: 'error',
          code: 'CHILD_PROFILE_NOT_FOUND',
          error: 'Child profile not found',
        });
      }
    }

    const referencePhotoUrls = getReferencePhotoUrls(data.referencePhotos);
    assertUserPhotoInputs({
      photos: referencePhotoUrls,
      userId,
      allowedPhotoTypes: ['character'],
    });
    await assertStoryFromDrawingAccessForPhotos({
      userId,
      photoCount: referencePhotoUrls.length,
    });
    
    logger.info({ 
      userId,
      characterType: data.type,
      hasPhotos: !!data.referencePhotos,
      photoCount: data.referencePhotos?.length || 0
    }, 'Character validation passed, creating character');

    // Keep this route-level so story-generated hidden LLM characters do not consume manual quotas.
    quotaReservationChildProfileId = data.childProfileId ?? null;
    const quotaReservation = await reserveManualCharacterQuota(userId, {
      childProfileId: quotaReservationChildProfileId,
      source: req.sessionMode === 'child' ? 'child' : 'parent',
      characterName: data.name,
      characterType: data.type,
    });
    quotaReservationId = quotaReservation.reservationId;
    
    // Create character
    const character = await characterService.createCharacter(userId, data);
    
    // Generate the mandatory turnaround, then expose the character. Roll back on failure.
    try {
      await generateManualCharacterTurnaround(character, userId);
    } catch (turnaroundError) {
      logger.error({
        err: turnaroundError,
        characterId: character.id,
        userId,
      }, 'Turnaround generation failed, rolling back character create');
      await releaseManualCharacterQuotaOnFailure(
        userId,
        quotaReservationId,
        quotaReservationChildProfileId,
        turnaroundError
      );
      await characterService.deleteCharacter(character.id, userId);
      const errorMessage = turnaroundError instanceof Error ? turnaroundError.message : '';
      return res.status(errorMessage.includes('must have reference photos or description') ? 400 : 500).json({
        status: 'error',
        error: errorMessage.includes('must have reference photos or description')
          ? errorMessage
          : 'Failed to generate character model',
      });
    }

    // Refetch character to get full turnaroundSheet data
    const updatedCharacter = await characterService.getCharacterById(character.id, userId, {
      ...(req.sessionMode === 'child' && req.childProfileId ? { accessibleByChildProfileId: req.childProfileId } : {}),
    });
    const characterToReturn = updatedCharacter ?? character;
    
    res.status(201).json({
      status: 'success',
      character: characterToReturn,
    });
  } catch (error) {
    if (sendPhotoInputSafetyError(res, error)) return;
    if (sendStoryFromDrawingAccessError(res, error)) return;
    if (sendCharacterQuotaError(res, error)) return;

    await releaseManualCharacterQuotaOnFailure(
      req.user!.id,
      quotaReservationId,
      quotaReservationChildProfileId,
      error
    );

    logger.error({ error, userId: req.user?.id }, 'Error creating character');
    res.status(500).json({
      status: 'error',
      error: 'Failed to create character'
    });
  }
});

// GET /api/v1/characters/:id - Get single character
router.get('/:id', requireAuth, requireParentOrScopedChildSession, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    const character = await characterService.getCharacterById(id, userId, {
      ...(req.sessionMode === 'child' && req.childProfileId ? { accessibleByChildProfileId: req.childProfileId } : {}),
    });
    
    if (!character) {
      return res.status(404).json({
        status: 'error',
        error: 'Character not found'
      });
    }
    
    res.json({
      status: 'success',
      character,
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id, characterId: req.params.id }, 'Error fetching character');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch character'
    });
  }
});

// DELETE /api/v1/characters/:id - Delete or hide character
router.delete('/:id', requireAuth, requireParentSession, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    // Check if character is used in any stories
    const usageCount = await characterService.countStoriesByCharacter(id, userId);
    
    if (usageCount > 0) {
      // Soft delete: mark as hidden
      await characterService.updateCharacter(id, userId, { isHidden: true } as any);
      logger.info({ userId, characterId: id, storiesCount: usageCount }, 'Character soft deleted (hidden)');
      
      res.json({
        status: 'success',
        message: 'Character hidden (used in stories)',
        isHidden: true
      });
    } else {
      // Hard delete: remove completely
      await characterService.deleteCharacter(id, userId);
      logger.info({ userId, characterId: id }, 'Character hard deleted');
      
      res.status(204).send();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        status: 'error',
        error: 'Character not found'
      });
    }
    
    logger.error({ error, userId: req.user?.id, characterId: req.params.id }, 'Error deleting character');
    res.status(500).json({
      status: 'error',
      error: 'Failed to delete character'
    });
  }
});

// PATCH /api/v1/characters/:id - Update character
router.patch('/:id', requireAuth, requireParentSession, async (req, res) => {
  let quotaReservationId: string | null = null;
  let quotaReservationChildProfileId: string | null = null;

  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    // Support simple isHidden toggle + optional description (e.g. from "Save to my characters" button)
    const keys = Object.keys(req.body);
    const hasIsHidden = typeof req.body.isHidden === 'boolean';
    const hasDescription = req.body.description !== undefined && (typeof req.body.description === 'string' || req.body.description === null);
    const isSimpleUpdate = hasIsHidden && (keys.length === 1 || (keys.length === 2 && hasDescription));
    if (isSimpleUpdate) {
      const data: { isHidden: boolean; description?: string | null } = { isHidden: req.body.isHidden };
      if (req.body.description !== undefined) {
        data.description = req.body.description;
      }
      const character = await characterService.updateCharacter(id, userId, data as any);
      return res.json({ status: 'success', character });
    }
    
    // Validate input for full character updates
    const validation = UpdateCharacterSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        status: 'error',
        error: 'Validation failed',
        details: validation.error.format()
      });
    }
    
    const data = validation.data;
    const existing = await characterService.getCharacterById(id, userId);
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        error: 'Character not found'
      });
    }

    const incomingReferencePhotos = (data as { referencePhotos?: unknown }).referencePhotos;
    const referencePhotosChanged =
      incomingReferencePhotos !== undefined &&
      stableReferencePhotoUrls(incomingReferencePhotos) !==
        stableReferencePhotoUrls(existing.referencePhotos);

    if (referencePhotosChanged) {
      const referencePhotoUrls = getReferencePhotoUrls(incomingReferencePhotos);
      assertUserPhotoInputs({
        photos: referencePhotoUrls,
        userId,
        allowedPhotoTypes: ['character'],
      });
      await assertStoryFromDrawingAccessForPhotos({
        userId,
        photoCount: referencePhotoUrls.length,
      });
    }

    const shouldRegenerateTurnaround = modelGenerationInputsChanged(existing, data as any);

    if (shouldRegenerateTurnaround) {
      quotaReservationChildProfileId = existing.childProfileId ?? null;
      const quotaReservation = await reserveManualCharacterQuota(userId, {
        childProfileId: quotaReservationChildProfileId,
        source: 'parent',
        characterName: data.name ?? existing.name,
        characterType: data.type ?? existing.type,
      });
      quotaReservationId = quotaReservation.reservationId;
    }
    
    // Update character (ownership check happens in service)
    const character = await characterService.updateCharacter(id, userId, data);

    if (shouldRegenerateTurnaround) {
      try {
        await generateManualCharacterTurnaround(character, userId);
      } catch (turnaroundError) {
        logger.error({
          err: turnaroundError,
          characterId: character.id,
          userId,
        }, 'Turnaround regeneration failed after character update');
        await releaseManualCharacterQuotaOnFailure(
          userId,
          quotaReservationId,
          quotaReservationChildProfileId,
          turnaroundError
        );
        return res.status(500).json({
          status: 'error',
          error: 'Failed to regenerate character model',
        });
      }
    }

    const characterToReturn = shouldRegenerateTurnaround
      ? await characterService.getCharacterById(id, userId)
      : character;
    
    res.json({
      status: 'success',
      character: characterToReturn ?? character,
    });
  } catch (error: unknown) {
    if (sendPhotoInputSafetyError(res, error)) return;
    if (sendStoryFromDrawingAccessError(res, error)) return;
    if (sendCharacterQuotaError(res, error)) return;

    await releaseManualCharacterQuotaOnFailure(
      req.user!.id,
      quotaReservationId,
      quotaReservationChildProfileId,
      error
    );

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        status: 'error',
        error: 'Character not found'
      });
    }
    
    logger.error({ error, userId: req.user?.id, characterId: req.params.id }, 'Error updating character');
    res.status(500).json({
      status: 'error',
      error: 'Failed to update character'
    });
  }
});

export default router;
