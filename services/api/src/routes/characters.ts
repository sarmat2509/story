import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import * as characterService from '../services/characterService';
import { CreateCharacterSchema, UpdateCharacterSchema } from '@wondertales/shared';
import { logger } from '../utils/logger';

import { CharacterAnalysisService } from '../services/characterAnalysisService';
import { GeminiTextProvider } from '../providers/text/gemini/GeminiTextProvider';
import { config } from '../config';
import { generateTurnaroundSheet, generateLlmCharacterTurnaround, isTurnaroundSheetEnabled } from '../services/turnaroundSheetService';

const router = Router();

// Initialize analysis service
const geminiProvider = new GeminiTextProvider(config.google.apiKey);
const analysisService = new CharacterAnalysisService(geminiProvider);

// POST /api/v1/characters/analyze - Analyze character photos
router.post('/analyze', requireAuth, async (req, res) => {
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
    
    logger.info({ 
      userId: req.user!.id, 
      photoCount: photos.length, 
      characterType,
      language: language || 'en'
    }, 'Analyzing character photos');
    
    // Call analysis service
    const { recordUsage } = await import('../services/aiUsageService');
    const usageContext = { userId: req.user!.id };
    const result = await analysisService.analyzeCharacter(
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
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const type = req.query.type as characterService.CharacterType | undefined;
    
    const characters = await characterService.getCharacters(userId, type);
    
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
router.post('/', requireAuth, async (req, res) => {
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
    
    const data = validation.data;
    
    logger.info({ 
      userId,
      characterType: data.type,
      hasPhotos: !!data.referencePhotos,
      photoCount: data.referencePhotos?.length || 0
    }, 'Character validation passed, creating character');
    
    // Create character
    const character = await characterService.createCharacter(userId, data);
    
    res.status(201).json({
      status: 'success',
      character,
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error creating character');
    res.status(500).json({
      status: 'error',
      error: 'Failed to create character'
    });
  }
});

// POST /api/v1/characters/:id/turnaround - Generate turnaround model sheet
router.post('/:id/turnaround', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Check feature flag
    if (!isTurnaroundSheetEnabled()) {
      return res.status(501).json({
        status: 'error',
        error: 'Turnaround sheet generation is not enabled',
      });
    }

    // Ownership + existence check
    const character = await characterService.getCharacterById(id, userId);
    if (!character) {
      return res.status(404).json({
        status: 'error',
        error: 'Character not found',
      });
    }

    // Use description from request body (possibly unsaved edits) or fall back to DB
    const aiDescription = req.body.description
      || (character as any).descriptionEn
      || character.aiGeneratedDescription
      || (character as any).appearance
      || character.description
      || undefined;

    const referencePhotos = character.referencePhotos as Array<{ url?: string }> | undefined;
    const firstPhoto = referencePhotos && Array.isArray(referencePhotos)
      ? referencePhotos.find(p => p && p.url)
      : undefined;

    // Need either reference photo OR description
    if (firstPhoto?.url) {
      // Photo-based generation
      logger.info({
        userId,
        characterId: id,
        characterName: character.name,
        hasBodyDescription: !!req.body.description,
      }, 'Generating turnaround sheet on demand (photo-based)');

      const result = await generateTurnaroundSheet({
        characterId: id,
        userId,
        referencePhotoUrl: firstPhoto.url,
        characterName: character.name,
        aiDescription,
      });

      return res.json({
        status: 'success',
        turnaroundSheet: {
          url: `/api/v1/assets/${result.url}`,
          generatedAt: result.generatedAt,
        },
      });
    }

    if (aiDescription && aiDescription.trim().length > 0) {
      // Description-only generation (no photo)
      logger.info({
        userId,
        characterId: id,
        characterName: character.name,
      }, 'Generating turnaround sheet on demand (description-only)');

      const result = await generateLlmCharacterTurnaround({
        characterId: id,
        userId,
        characterName: character.name,
        characterDescription: aiDescription.trim(),
        imageStyle: (req.body.imageStyle as string) || undefined,
      });

      return res.json({
        status: 'success',
        turnaroundSheet: {
          url: `/api/v1/assets/${result.url}`,
          generatedAt: result.generatedAt,
        },
      });
    }

    return res.status(400).json({
      status: 'error',
      error: 'Add a photo/drawing or description to generate the model sheet',
    });
  } catch (error) {
    logger.error({
      err: error instanceof Error
        ? { message: error.message, name: error.name, stack: error.stack }
        : String(error),
      userId: req.user?.id,
      characterId: req.params.id,
    }, 'Error generating turnaround sheet');
    res.status(500).json({
      status: 'error',
      error: 'Failed to generate turnaround model sheet',
    });
  }
});

// GET /api/v1/characters/:id - Get single character
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    const character = await characterService.getCharacterById(id, userId);
    
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
router.delete('/:id', requireAuth, async (req, res) => {
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
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    // Support simple isHidden toggle (e.g. from "Save to my characters" button)
    if (Object.keys(req.body).length === 1 && typeof req.body.isHidden === 'boolean') {
      const character = await characterService.updateCharacter(id, userId, { isHidden: req.body.isHidden } as any);
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
    
    // Update character (ownership check happens in service)
    const character = await characterService.updateCharacter(id, userId, data);
    
    res.json({
      status: 'success',
      character,
    });
  } catch (error: unknown) {
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

// DELETE /api/v1/characters/:id - Delete character
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    // Delete character (ownership check happens in service)
    await characterService.deleteCharacter(id, userId);
    
    res.status(204).send();
  } catch (error: unknown) {
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

export default router;
