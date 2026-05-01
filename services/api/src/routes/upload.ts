import { Router } from 'express';
import multer from 'multer';
import { isPhotoTypeUserUpload } from '@wondertales/shared';
import { requireAuth } from '../middleware/authMiddleware';
import { getAssetStorageService } from '../services/assetStorageService';
import { ensureChildDataConsent, type ConsentAuditContext } from '../services/consentService';
import { logger } from '../utils/logger';

const router = Router();

function buildConsentAuditContext(req: Parameters<typeof requireAuth>[0], source: string): ConsentAuditContext {
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
  return body.childDataConsentAccepted ?? body.child_data_consent_accepted ?? body.parentalConsentAccepted;
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Only allow images
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  }
});

/**
 * POST /api/v1/upload/photo
 * Upload user photo (profile, character, child reference photo)
 */
router.post('/photo', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        error: 'No file uploaded'
      });
    }

    const userId = req.user!.id;
    const { photoType = 'character' } = req.body;
    
    // Validate photoType (user upload only - no turnaround types)
    if (!isPhotoTypeUserUpload(photoType)) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid photoType. Must be: profile, character, child, or feedback'
      });
    }

    if (photoType === 'child') {
      const hasConsent = await ensureChildDataConsent(
        userId,
        getChildDataConsentValue(req.body as Record<string, unknown>),
        buildConsentAuditContext(req, 'child_photo_upload')
      );
      if (!hasConsent) {
        return res.status(403).json({
          status: 'error',
          error: 'Child data consent required',
          code: 'CHILD_DATA_CONSENT_REQUIRED',
        });
      }
    }

    // Preprocess image (auto-orient, resize, enhance exposure, convert to JPEG)
    const storageService = getAssetStorageService();
    const preprocessedBuffer = await storageService.preprocessImage(req.file.buffer);

    // Upload to storage
    const result = await storageService.uploadUserPhoto({
      buffer: preprocessedBuffer,
      mimeType: 'image/jpeg', // Always JPEG after preprocessing
      userId,
      photoType
    });

    logger.info({ 
      userId, 
      photoType, 
      path: result.storagePath, 
      size: req.file.size 
    }, 'User photo uploaded successfully');

    // Return signed URL so <Image> can load it without Bearer auth header
    // storagePath: for feedback screenshots, used when submitting to user_feedback
    res.json({
      status: 'success',
      photo: {
        url: result.signedUrl || result.storageUrl,
        storagePath: result.storagePath,
        uploadedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Photo upload failed');
    const errorMessage = error instanceof Error ? error.message : 'Failed to upload photo';
    res.status(500).json({
      status: 'error',
      error: errorMessage
    });
  }
});

/**
 * DELETE /api/v1/upload/photo
 * Delete an uploaded photo (cleanup for cancelled character creation)
 */
router.delete('/photo', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        status: 'error',
        error: 'Missing or invalid url in request body'
      });
    }

    // Extract storage path from URL
    // URL formats: 
    //   /api/v1/assets/development/{userId}/photos/...
    //   http://localhost:3000/api/v1/assets/development/{userId}/photos/...
    const assetPrefix = '/api/v1/assets/';
    const prefixIndex = url.indexOf(assetPrefix);
    if (prefixIndex === -1) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid photo URL format'
      });
    }

    const storagePath = url
      .substring(prefixIndex + assetPrefix.length)
      .split('?')[0]
      .split('#')[0];

    // Security: verify the path belongs to the requesting user
    // Use startsWith with env prefix to prevent substring collision
    // Expected format: {env}/{userId}/photos/...
    const pathParts = storagePath.split('/');
    // pathParts[0] = env, pathParts[1] = userId
    if (pathParts.length < 2 || pathParts[1] !== userId) {
      logger.warn({ userId, storagePath }, 'User attempted to delete another user\'s photo');
      return res.status(403).json({
        status: 'error',
        error: 'You can only delete your own photos'
      });
    }

    const storageService = getAssetStorageService();
    await storageService.deleteAsset(storagePath);

    logger.info({ userId, storagePath }, 'User photo deleted');

    res.json({
      status: 'success',
      message: 'Photo deleted'
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Photo deletion failed');
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete photo';
    res.status(500).json({
      status: 'error',
      error: errorMessage
    });
  }
});

export default router;
