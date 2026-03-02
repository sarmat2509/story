import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import * as childProfileService from '../services/childProfileService';
import * as planService from '../services/planService';
import { CreateChildProfileSchema, UpdateChildProfileSchema } from '@wondertales/shared';
import { logger } from '../utils/logger';

import { CharacterAnalysisService } from '../services/characterAnalysisService';
import { GeminiTextProvider } from '../providers/text/gemini/GeminiTextProvider';
import { config } from '../config';
import { generateChildTurnaroundSheet, isTurnaroundSheetEnabled } from '../services/turnaroundSheetService';

const router = Router();

// Initialize analysis service
const geminiProvider = new GeminiTextProvider(config.google.apiKey);
const analysisService = new CharacterAnalysisService(geminiProvider);

// POST /api/v1/children/analyze - Analyze child photos
router.post('/analyze', requireAuth, async (req, res) => {
  const { photos, language } = req.body;
  
  try {
    // Validation
    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'Photos array is required and must not be empty'
      });
    }
    
    logger.info({ 
      userId: req.user!.id, 
      photoCount: photos.length,
      language: language || 'en'
    }, 'Analyzing child photos');
    
    // Call analysis service (always 'person' for children)
    const result = await analysisService.analyzeCharacter({
      photos,
      characterType: 'person',
      language: language || 'en'
    });
    
    // Map result to child-specific format
    const analysis: any = {
      description: result.detailedDescription
    };
    
    if (result.appearanceTraits) {
      analysis.appearance = {
        hairColor: result.appearanceTraits.hairColor || undefined,
        hairLength: result.appearanceTraits.hairLength || undefined,
        hairStyle: result.appearanceTraits.hairStyle || undefined,
        eyeColor: result.appearanceTraits.eyeColor || undefined,
        skinTone: result.appearanceTraits.skinTone || undefined,
        distinctiveFeatures: result.distinctiveFeatures || []
      };
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
      photoCount: photos?.length || 0
    }, 'Error analyzing child photos');
    res.status(500).json({
      status: 'error',
      error: 'Failed to analyze photos'
    });
  }
});

// GET /api/v1/children - List child profiles
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const profiles = await childProfileService.getChildProfiles(userId);
    
    // Get limit for display
    const limit = await planService.getFeatureLimit(userId, 'child_profiles_limit');
    const canCreateMore = limit === null || profiles.length < limit;
    
    const profilesWithAge = profiles.map(profile => {
      const ageData = childProfileService.getAgeData(new Date(profile.birthDate));
      return {
        ...profile,
        age: {
          years: ageData.ageYears,
          months: ageData.remainingMonths,
          totalMonths: ageData.ageMonths,
          ageGroup: ageData.ageGroup,
          isBirthdayToday: ageData.isBirthdayToday,
          daysUntilBirthday: ageData.daysUntilBirthday
        }
      };
    });
    
    res.json({
      status: 'success',
      children: profilesWithAge,
      limit,
      canCreateMore
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error fetching child profiles');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch child profiles'
    });
  }
});

// POST /api/v1/children - Create child profile
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Validate input
    const validation = CreateChildProfileSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        status: 'error',
        error: 'Validation failed',
        details: validation.error.format()
      });
    }
    
    const data = validation.data;
    
    // Create profile (feature check happens in service)
    const profile = await childProfileService.createChildProfile(userId, data);
    
    const ageData = childProfileService.getAgeData(new Date(profile.birthDate));
    const profileWithAge = {
      ...profile,
      age: {
        years: ageData.ageYears,
        months: ageData.remainingMonths,
        totalMonths: ageData.ageMonths,
        ageGroup: ageData.ageGroup,
        isBirthdayToday: ageData.isBirthdayToday,
        daysUntilBirthday: ageData.daysUntilBirthday
      }
    };
    
    res.status(201).json({
      status: 'success',
      child: profileWithAge
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('limit reached')) {
      return res.status(403).json({
        status: 'error',
        error: errorMessage
      });
    }
    
    logger.error({ error, userId: req.user?.id }, 'Error creating child profile');
    res.status(500).json({
      status: 'error',
      error: 'Failed to create child profile'
    });
  }
});

// PATCH /api/v1/children/:id - Update child profile
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    // Validate input
    const validation = UpdateChildProfileSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        status: 'error',
        error: 'Validation failed',
        details: validation.error.format()
      });
    }
    
    const data = validation.data;
    
    // Update profile (ownership check happens in service)
    const profile = await childProfileService.updateChildProfile(id, userId, data);
    
    const ageData = childProfileService.getAgeData(new Date(profile.birthDate));
    const profileWithAge = {
      ...profile,
      age: {
        years: ageData.ageYears,
        months: ageData.remainingMonths,
        totalMonths: ageData.ageMonths,
        ageGroup: ageData.ageGroup,
        isBirthdayToday: ageData.isBirthdayToday,
        daysUntilBirthday: ageData.daysUntilBirthday
      }
    };
    
    res.json({
      status: 'success',
      child: profileWithAge
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        status: 'error',
        error: 'Child profile not found'
      });
    }
    
    logger.error({ error, userId: req.user?.id, childId: req.params.id }, 'Error updating child profile');
    res.status(500).json({
      status: 'error',
      error: 'Failed to update child profile'
    });
  }
});

// POST /api/v1/children/:id/turnaround - Generate turnaround model sheet for child
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
    const child = await childProfileService.getChildProfileById(id, userId);
    if (!child) {
      return res.status(404).json({
        status: 'error',
        error: 'Child profile not found',
      });
    }

    // Must have at least one reference photo
    const referencePhotos = child.referencePhotos as Array<{ url?: string }> | undefined;
    if (!referencePhotos || !Array.isArray(referencePhotos) || referencePhotos.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'Child profile must have at least one reference photo',
      });
    }

    const firstPhoto = referencePhotos.find(p => p && p.url);
    if (!firstPhoto?.url) {
      return res.status(400).json({
        status: 'error',
        error: 'No valid reference photo found',
      });
    }

    // Use description from request body (possibly unsaved edits) or fall back to DB
    const aiDescription = req.body.description
      || child.aiGeneratedDescription
      || undefined;

    logger.info({
      userId,
      childId: id,
      childName: child.name,
      hasBodyDescription: !!req.body.description,
    }, 'Generating child turnaround sheet on demand');

    // Generate synchronously (awaited)
    const result = await generateChildTurnaroundSheet({
      childId: id,
      userId,
      referencePhotoUrl: firstPhoto.url,
      childName: child.name,
      aiDescription,
    });

    res.json({
      status: 'success',
      turnaroundSheet: {
        url: `/api/v1/assets/${result.url}`,
        generatedAt: result.generatedAt,
      },
    });
  } catch (error) {
    logger.error({
      err: error instanceof Error
        ? { message: error.message, name: error.name, stack: error.stack }
        : String(error),
      userId: req.user?.id,
      childId: req.params.id,
    }, 'Error generating child turnaround sheet');
    res.status(500).json({
      status: 'error',
      error: 'Failed to generate turnaround model sheet',
    });
  }
});

// DELETE /api/v1/children/:id - Delete child profile
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    // Delete profile (ownership check happens in service)
    await childProfileService.deleteChildProfile(id, userId);
    
    res.status(204).send();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        status: 'error',
        error: 'Child profile not found'
      });
    }
    
    logger.error({ error, userId: req.user?.id, childId: req.params.id }, 'Error deleting child profile');
    res.status(500).json({
      status: 'error',
      error: 'Failed to delete child profile'
    });
  }
});

export default router;
