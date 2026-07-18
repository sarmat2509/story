import { Router } from 'express';
import {
  requireAuth,
  requireChildSession,
  requireParentSession,
} from '../middleware/authMiddleware';
import type { ChildProfile } from '../db/schema';
import * as childProfileService from '../services/childProfileService';
import * as childModeControlsService from '../services/childModeControlsService';
import * as planService from '../services/planService';
import {
  CreateChildProfileSchema,
  UpdateChildModeControlsSchema,
  UpdateChildProfileSchema,
} from '@wondertales/shared';
import { logger } from '../utils/logger';
import {
  sanitizeChildProfileBody,
  sanitizeAnalysisAppearance,
} from '../utils/sanitizeChildProfile';
import { generateToken } from '../services/jwtService';
import { setSessionCookie } from '../utils/sessionCookie';

import { CharacterAnalysisService } from '../services/characterAnalysisService';
import { GeminiTextProvider } from '../providers/text/gemini/GeminiTextProvider';
import { config } from '../config';
import {
  generateTurnaroundSheetFromReference,
  generateTurnaroundSheetFromDescription,
} from '../services/turnaroundSheetService';
import { ensureChildDataConsent, type ConsentAuditContext } from '../services/consentService';
import {
  assertUserPhotoInputs,
  getReferencePhotoUrls,
  isPhotoInputSafetyError,
} from '../services/photoInputSafetyService';
import {
  assertStoryFromDrawingAccessForPhotos,
  isStoryFromDrawingAccessError,
} from '../services/storyFromDrawingAccessService';
import { getChildPhotoValidationService } from '../services/aiService';
import { recordUsage } from '../services/aiUsageService';
import { isChildPhotoValidationError } from '../services/childPhotoValidationService';

const router = Router();

function sendPhotoInputSafetyError(
  res: Parameters<typeof requireAuth>[1],
  error: unknown
): boolean {
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

function sendStoryFromDrawingAccessError(
  res: Parameters<typeof requireAuth>[1],
  error: unknown
): boolean {
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

function sendChildPhotoValidationError(
  res: Parameters<typeof requireAuth>[1],
  error: unknown
): boolean {
  if (!isChildPhotoValidationError(error)) {
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

function sendChildModeError(res: Parameters<typeof requireAuth>[1], error: unknown): boolean {
  if (
    !(error instanceof childModeControlsService.ChildModeError) &&
    !(error instanceof childModeControlsService.ChildModePasscodeError)
  ) {
    return false;
  }

  res.status(error.statusCode).json({
    status: 'error',
    code: error.code,
    error: error.message,
  });
  return true;
}

function sendChildProfileLimitError(
  res: Parameters<typeof requireAuth>[1],
  error: unknown
): boolean {
  if (!childProfileService.isChildProfileLimitError(error)) {
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
  });
  return true;
}

function extractDeviceInfo(req: Parameters<typeof requireAuth>[0]) {
  const userAgent = req.headers['user-agent'] || '';
  const forwardedFor = req.headers['x-forwarded-for'];
  const ipAddress =
    (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : null) ||
    req.socket.remoteAddress ||
    '';

  let deviceType: 'ios' | 'android' | 'web' = 'web';
  let deviceName = 'Child Mode Web';

  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    deviceType = 'ios';
    deviceName = userAgent.includes('iPad') ? 'Child Mode iPad' : 'Child Mode iPhone';
  } else if (userAgent.includes('Android')) {
    deviceType = 'android';
    deviceName = 'Child Mode Android';
  }

  return { deviceType, deviceName, ipAddress, userAgent };
}

// Initialize analysis service
const geminiProvider = new GeminiTextProvider(config.google.apiKey, config.ai.modelVersion);
const analysisService = new CharacterAnalysisService(geminiProvider);

function buildConsentAuditContext(
  req: Parameters<typeof requireAuth>[0],
  source: string
): ConsentAuditContext {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ipAddress =
    (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : null) ||
    req.socket.remoteAddress ||
    null;
  return {
    ipAddress,
    userAgent: req.headers['user-agent'] || null,
    context: { source },
  };
}

function getChildDataConsentValue(body: Record<string, unknown>): unknown {
  return (
    body.childDataConsentAccepted ??
    body.child_data_consent_accepted ??
    body.parentalConsentAccepted
  );
}

async function requireChildDataConsent(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  source: string
): Promise<boolean> {
  const accepted = await ensureChildDataConsent(
    req.user!.id,
    getChildDataConsentValue(req.body as Record<string, unknown>),
    buildConsentAuditContext(req, source)
  );
  if (accepted) return true;

  res.status(403).json({
    status: 'error',
    error: 'Child data consent required',
    code: 'CHILD_DATA_CONSENT_REQUIRED',
  });
  return false;
}

function toSafeChildProfile(
  profile: ChildProfile
): Omit<ChildProfile, 'childModePasscodeHash' | 'childModePasscodeSetAt'> {
  const {
    childModePasscodeHash: _childModePasscodeHash,
    childModePasscodeSetAt: _childModePasscodeSetAt,
    ...safeProfile
  } = profile;
  return safeProfile;
}

function addAgeToChildProfile(
  profile: Omit<ChildProfile, 'childModePasscodeHash' | 'childModePasscodeSetAt'>
) {
  const ageData = childProfileService.getAgeData(new Date(profile.birthDate));
  return {
    ...profile,
    age: {
      years: ageData.ageYears,
      months: ageData.remainingMonths,
      totalMonths: ageData.ageMonths,
      ageGroup: ageData.ageGroup,
      isBirthdayToday: ageData.isBirthdayToday,
      daysUntilBirthday: ageData.daysUntilBirthday,
    },
  };
}

// POST /api/v1/children/analyze - Analyze child photos
router.post('/analyze', requireAuth, requireParentSession, async (req, res) => {
  const { photos, language } = req.body;

  try {
    if (!(await requireChildDataConsent(req, res, 'child_photo_analysis'))) return;

    // Validation
    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'Photos array is required and must not be empty',
      });
    }

    const photoPaths = assertUserPhotoInputs({
      photos,
      userId: req.user!.id,
      allowedPhotoTypes: ['child'],
    });
    await assertStoryFromDrawingAccessForPhotos({
      userId: req.user!.id,
      photoCount: photos.length,
    });
    const usageContext = { userId: req.user!.id };
    await getChildPhotoValidationService().assertUploadedPhotosContainHumans(
      {
        storagePaths: photoPaths,
        userId: req.user!.id,
        source: 'child_photo_analysis',
      },
      { onUsage: (u) => recordUsage(u, usageContext) }
    );

    logger.info(
      {
        userId: req.user!.id,
        photoCount: photos.length,
        language: language || 'en',
      },
      'Analyzing child photos'
    );

    // Call analysis service (always 'person' for children)
    const result = await analysisService.analyzeCharacter(
      {
        photos,
        characterType: 'person',
        language: language || 'en',
        isChildProfile: true,
      },
      { onUsage: (u) => recordUsage(u, usageContext) }
    );

    // Map result to child-specific format
    const analysis: any = {
      description: result.detailedDescription,
    };

    if (result.appearanceTraits) {
      analysis.appearance = sanitizeAnalysisAppearance(
        result.appearanceTraits as Record<string, unknown>
      );
    }

    res.json({
      status: 'success',
      analysis,
    });
  } catch (error) {
    if (sendPhotoInputSafetyError(res, error)) return;
    if (sendStoryFromDrawingAccessError(res, error)) return;
    if (sendChildPhotoValidationError(res, error)) return;

    logger.error(
      {
        error:
          error instanceof Error
            ? {
                message: error.message,
                name: error.name,
                stack: error.stack,
              }
            : error,
        userId: req.user?.id,
        photoCount: photos?.length || 0,
      },
      'Error analyzing child photos'
    );
    res.status(500).json({
      status: 'error',
      error: 'Failed to analyze photos',
    });
  }
});

// GET /api/v1/children/child-mode/switcher - Safe child profile list for Child Mode switching
router.get('/child-mode/switcher', requireAuth, async (req, res) => {
  try {
    const userId = req.parentUserId || req.user!.id;
    const profiles = await childProfileService.getChildProfiles(userId);
    const childModeExitPasscode =
      await childModeControlsService.getChildModeExitPasscodeStatus(userId);

    res.json({
      status: 'success',
      children: profiles
        .filter((profile) => {
          const controls = childModeControlsService.buildChildModeControls(
            profile,
            0,
            childModeExitPasscode.configured
          );
          return controls.childModeEnabled && controls.childModePasscodeConfigured;
        })
        .map((profile) => {
          const safeProfile = toSafeChildProfile(profile);
          return {
            id: safeProfile.id,
            name: safeProfile.name,
            referencePhotos: safeProfile.referencePhotos,
            turnaroundSheet: (safeProfile as any).turnaroundSheet,
            storyCreationMode: safeProfile.storyCreationMode,
          };
        }),
    });
  } catch (error) {
    logger.error(
      { error, userId: req.parentUserId || req.user?.id },
      'Error fetching child mode switcher profiles'
    );
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch child profiles',
    });
  }
});

// GET /api/v1/children/child-mode/current - Live controls for the active Child Mode session
router.get('/child-mode/current', requireAuth, requireChildSession, async (req, res) => {
  try {
    const controls = await childModeControlsService.getChildModeControls(
      req.parentUserId || req.user!.id,
      req.childProfileId!
    );

    res.json({
      status: 'success',
      childMode: {
        childModeEnabled: controls.childModeEnabled,
        childModeSettings: controls.childModeSettings,
      },
    });
  } catch (error) {
    if (sendChildModeError(res, error)) return;
    logger.error(
      {
        error,
        userId: req.parentUserId || req.user?.id,
        childId: req.childProfileId,
      },
      'Error fetching current child mode controls'
    );
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch child mode controls',
    });
  }
});

// GET /api/v1/children - List child profiles
router.get('/', requireAuth, requireParentSession, async (req, res) => {
  try {
    const userId = req.user!.id;
    const profiles = await childProfileService.getChildProfiles(userId);

    // Get limit for display
    const limit = await planService.getFeatureLimit(userId, 'child_profiles_limit');
    const canCreateMore = limit === null || profiles.length < limit;
    const childModeSessionCounts = await childModeControlsService.getChildModeSessionCounts(
      profiles.map((profile) => profile.id)
    );
    const childModeExitPasscode =
      await childModeControlsService.getChildModeExitPasscodeStatus(userId);

    const profilesWithAge = profiles.map((profile) => {
      const ageData = childProfileService.getAgeData(new Date(profile.birthDate));
      const childModeControls = childModeControlsService.buildChildModeControls(
        profile,
        childModeSessionCounts.get(profile.id) || 0,
        childModeExitPasscode.configured
      );
      const safeProfile = toSafeChildProfile(profile);
      return {
        ...safeProfile,
        childModeEnabled: childModeControls.childModeEnabled,
        childModeSettings: childModeControls.childModeSettings,
        childModePasscodeConfigured: childModeControls.childModePasscodeConfigured,
        childModeActiveSessionCount: childModeControls.activeSessionCount,
        age: {
          years: ageData.ageYears,
          months: ageData.remainingMonths,
          totalMonths: ageData.ageMonths,
          ageGroup: ageData.ageGroup,
          isBirthdayToday: ageData.isBirthdayToday,
          daysUntilBirthday: ageData.daysUntilBirthday,
        },
      };
    });

    res.json({
      status: 'success',
      children: profilesWithAge,
      limit,
      canCreateMore,
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error fetching child profiles');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch child profiles',
    });
  }
});

// POST /api/v1/children - Create child profile
router.post('/', requireAuth, requireParentSession, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Sanitize invalid enum values (log for dev, leave field empty for user)
    sanitizeChildProfileBody(req.body as Record<string, unknown>);

    // Validate input
    const validation = CreateChildProfileSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        status: 'error',
        error: 'Validation failed',
        details: validation.error.format(),
      });
    }

    const data = validation.data;
    if (!(await requireChildDataConsent(req, res, 'child_profile_create'))) return;

    const referencePhotoUrls = getReferencePhotoUrls(data.referencePhotos);
    const referencePhotoPaths = assertUserPhotoInputs({
      photos: referencePhotoUrls,
      userId,
      allowedPhotoTypes: ['child'],
    });
    await assertStoryFromDrawingAccessForPhotos({
      userId,
      photoCount: referencePhotoUrls.length,
    });
    await getChildPhotoValidationService().assertUploadedPhotosContainHumans(
      {
        storagePaths: referencePhotoPaths,
        userId,
        source: 'child_profile_create',
      },
      { onUsage: (u) => recordUsage(u, { userId }) }
    );

    const dataForCreate = {
      ...data,
      birthDate:
        data.birthDate instanceof Date
          ? data.birthDate.toISOString().split('T')[0]
          : data.birthDate,
    };

    // Create profile (feature check happens in service)
    const profile = await childProfileService.createChildProfile(userId, dataForCreate);

    // Generate a turnaround when the profile has enough visual/text reference data.
    // First-launch profiles can be intentionally lightweight and add photos later.
    try {
      const referencePhotos = profile.referencePhotos as Array<{ url?: string }> | undefined;
      const hasPhotos =
        referencePhotos && Array.isArray(referencePhotos) && referencePhotos.length > 0;
      const firstPhoto = hasPhotos ? referencePhotos!.find((p) => p && p.url) : undefined;
      const hasDescription =
        profile.aiGeneratedDescription && profile.aiGeneratedDescription.trim().length > 0;
      const currentAgeMonths = childProfileService.getAgeData(
        new Date(profile.birthDate)
      ).ageMonths;

      if (firstPhoto?.url) {
        await generateTurnaroundSheetFromReference({
          targetType: 'child',
          targetId: profile.id,
          referencePhotoUrls: referencePhotos!.map((p) => p.url!).filter(Boolean),
          characterName: profile.name,
          userId,
          aiDescription: profile.aiGeneratedDescription,
          currentAgeMonths,
        });
      } else if (hasDescription) {
        await generateTurnaroundSheetFromDescription({
          targetType: 'child',
          targetId: profile.id,
          characterName: profile.name,
          characterDescription: profile.aiGeneratedDescription,
          currentAgeMonths,
          userId,
        });
      }
    } catch (turnaroundError) {
      logger.error(
        {
          err: turnaroundError,
          childId: profile.id,
          userId,
        },
        'Turnaround generation failed, rolling back child create'
      );
      await childProfileService.deleteChildProfile(profile.id, userId);
      return res.status(500).json({
        status: 'error',
        error: 'Failed to generate character model',
      });
    }

    // Refetch profile to get full turnaroundSheet data
    const updatedProfile = await childProfileService.getChildProfileById(profile.id, userId);
    const profileToReturn = updatedProfile ?? profile;

    const profileWithAge = addAgeToChildProfile(toSafeChildProfile(profileToReturn));

    res.status(201).json({
      status: 'success',
      child: profileWithAge,
    });
  } catch (error: unknown) {
    if (sendPhotoInputSafetyError(res, error)) return;
    if (sendStoryFromDrawingAccessError(res, error)) return;
    if (sendChildPhotoValidationError(res, error)) return;
    if (sendChildProfileLimitError(res, error)) return;

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('limit reached')) {
      return res.status(403).json({
        status: 'error',
        error: errorMessage,
      });
    }

    logger.error({ error, userId: req.user?.id }, 'Error creating child profile');
    res.status(500).json({
      status: 'error',
      error: 'Failed to create child profile',
    });
  }
});

// GET /api/v1/children/:id/child-mode - Get Child Mode controls
router.get('/:id/child-mode', requireAuth, requireParentSession, async (req, res) => {
  try {
    const controls = await childModeControlsService.getChildModeControls(
      req.user!.id,
      req.params.id
    );
    res.json({
      status: 'success',
      childMode: controls,
    });
  } catch (error) {
    if (sendChildModeError(res, error)) return;
    logger.error(
      { error, userId: req.user?.id, childId: req.params.id },
      'Error fetching child mode controls'
    );
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch child mode controls',
    });
  }
});

// PATCH /api/v1/children/:id/child-mode - Update Child Mode controls
router.patch('/:id/child-mode', requireAuth, requireParentSession, async (req, res) => {
  try {
    const validation = UpdateChildModeControlsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        status: 'error',
        error: 'Validation failed',
        details: validation.error.format(),
      });
    }

    const controls = await childModeControlsService.updateChildModeControls(
      req.user!.id,
      req.params.id,
      validation.data
    );

    res.json({
      status: 'success',
      childMode: controls,
    });
  } catch (error) {
    if (sendChildModeError(res, error)) return;
    logger.error(
      { error, userId: req.user?.id, childId: req.params.id },
      'Error updating child mode controls'
    );
    res.status(500).json({
      status: 'error',
      error: 'Failed to update child mode controls',
    });
  }
});

// POST /api/v1/children/:id/child-mode/sessions - Enter Child Mode for this child
router.post('/:id/child-mode/sessions', requireAuth, requireParentSession, async (req, res) => {
  try {
    const { profile, session } = await childModeControlsService.createChildModeSession({
      userId: req.user!.id,
      childProfileId: req.params.id,
      ...extractDeviceInfo(req),
    });
    const token = generateToken({
      userId: req.user!.id,
      sessionId: session.id,
    });

    setSessionCookie(res, token);
    const controls = await childModeControlsService.getChildModeControls(
      req.user!.id,
      req.params.id
    );

    res.status(201).json({
      status: 'success',
      token,
      expiresAt: session.expiresAt.getTime(),
      child: {
        id: profile.id,
        name: profile.name,
        storyCreationMode: profile.storyCreationMode as 'instant' | 'artisan',
        authorPseudonym: profile.authorPseudonym,
        authorAboutMe: profile.authorAboutMe,
        referencePhotos: profile.referencePhotos,
        turnaroundSheet: (profile as any).turnaroundSheet,
        age: addAgeToChildProfile(toSafeChildProfile(profile)).age,
      },
      session: {
        id: session.id,
        mode: session.mode,
        parentUserId: session.parentUserId,
        childProfileId: session.childProfileId,
        scopes: session.scopes,
        expiresAt: session.expiresAt,
      },
      childMode: controls,
    });
  } catch (error) {
    if (sendChildModeError(res, error)) return;
    logger.error(
      { error, userId: req.user?.id, childId: req.params.id },
      'Error creating child mode session'
    );
    res.status(500).json({
      status: 'error',
      error: 'Failed to create child mode session',
    });
  }
});

// DELETE /api/v1/children/:id/child-mode/sessions - Revoke active Child Mode sessions
router.delete('/:id/child-mode/sessions', requireAuth, requireParentSession, async (req, res) => {
  try {
    const revokedCount = await childModeControlsService.revokeChildModeSessions(
      req.user!.id,
      req.params.id
    );
    res.json({
      status: 'success',
      revokedCount,
    });
  } catch (error) {
    if (sendChildModeError(res, error)) return;
    logger.error(
      { error, userId: req.user?.id, childId: req.params.id },
      'Error revoking child mode sessions'
    );
    res.status(500).json({
      status: 'error',
      error: 'Failed to revoke child mode sessions',
    });
  }
});

// PATCH /api/v1/children/:id - Update child profile
router.patch('/:id', requireAuth, requireParentSession, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Sanitize invalid enum values (log for dev, leave field empty for user)
    sanitizeChildProfileBody(req.body as Record<string, unknown>);

    // Validate input
    const validation = UpdateChildProfileSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        status: 'error',
        error: 'Validation failed',
        details: validation.error.format(),
      });
    }

    const data = validation.data;
    const dataForUpdate = {
      ...data,
      ...(data.birthDate && {
        birthDate:
          data.birthDate instanceof Date
            ? data.birthDate.toISOString().split('T')[0]
            : data.birthDate,
      }),
    };

    // Update profile (ownership check happens in service)
    const profile = await childProfileService.updateChildProfile(id, userId, dataForUpdate);

    const profileWithAge = addAgeToChildProfile(toSafeChildProfile(profile));

    res.json({
      status: 'success',
      child: profileWithAge,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        status: 'error',
        error: 'Child profile not found',
      });
    }

    logger.error(
      { error, userId: req.user?.id, childId: req.params.id },
      'Error updating child profile'
    );
    res.status(500).json({
      status: 'error',
      error: 'Failed to update child profile',
    });
  }
});

// DELETE /api/v1/children/:id - Delete child profile
router.delete('/:id', requireAuth, requireParentSession, async (req, res) => {
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
        error: 'Child profile not found',
      });
    }

    logger.error(
      { error, userId: req.user?.id, childId: req.params.id },
      'Error deleting child profile'
    );
    res.status(500).json({
      status: 'error',
      error: 'Failed to delete child profile',
    });
  }
});

export default router;
