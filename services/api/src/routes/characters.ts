import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import * as characterService from '../services/characterService';
import { CreateCharacterSchema, UpdateCharacterSchema } from '@kazka/shared';
import { logger } from '../utils/logger';

const router = Router();

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
