import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/authMiddleware';
import { getAssetStorageService } from '../services/assetStorageService';
import { logger } from '../utils/logger';

const router = Router();

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
    
    // Validate photoType
    if (!['profile', 'character', 'child'].includes(photoType)) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid photoType. Must be: profile, character, or child'
      });
    }

    // Upload to storage
    const storageService = getAssetStorageService();
    const result = await storageService.uploadUserPhoto({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      userId,
      photoType
    });

    logger.info({ 
      userId, 
      photoType, 
      path: result.storagePath, 
      size: req.file.size 
    }, 'User photo uploaded successfully');

    res.json({
      status: 'success',
      photo: {
        url: result.storageUrl,
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

export default router;
