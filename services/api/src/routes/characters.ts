import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import * as characterService from '../services/characterService';
import { CreateCharacterSchema, UpdateCharacterSchema } from '@kazka/shared';
import { logger } from '../utils/logger';
import { CharacterAnalysisService } from '../services/characterAnalysisService';
import { GeminiTextProvider } from '../providers/text/gemini/GeminiTextProvider';
import { config } from '../config';

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
    const result = await analysisService.analyzeCharacter({
      photos,
      characterType,
      language: language || 'en'
    });
    
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

// GET /api/v1/characters - List characters (optionally filtered by type)
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const type = req.query.type as characterService.CharacterType | undefined;
    
    const characters = await characterService.getCharacters(userId, type);
    
    res.json({
      status: 'success',
      characters
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
    
    // Validate input
    const validation = CreateCharacterSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        status: 'error',
        error: 'Validation failed',
        details: validation.error.format()
      });
    }
    
    const data = validation.data;
    
    // Create character
    const character = await characterService.createCharacter(userId, data);
    
    res.status(201).json({
      status: 'success',
      character
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error creating character');
    res.status(500).json({
      status: 'error',
      error: 'Failed to create character'
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
      character
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id, characterId: req.params.id }, 'Error fetching character');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch character'
    });
  }
});

// PATCH /api/v1/characters/:id - Update character
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    // Validate input
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
      character
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
