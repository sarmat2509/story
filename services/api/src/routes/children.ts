import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import * as childProfileService from '../services/childProfileService';
import * as planService from '../services/planService';
import { CreateChildProfileSchema, UpdateChildProfileSchema } from '@kazka/shared';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/v1/children - List child profiles
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const profiles = await childProfileService.getChildProfiles(userId);
    
    // Get limit for display
    const limit = await planService.getFeatureLimit(userId, 'child_profiles_limit');
    const canCreateMore = limit === null || profiles.length < limit;
    
    // Add computed age data to each profile
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
    
    // Add computed age data
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
    
    // Add computed age data
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
