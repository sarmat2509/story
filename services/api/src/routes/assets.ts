import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { getAssetRepository } from '../repositories';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { validate as isUUID } from 'uuid';

const router = Router();

// ── Security: Path Containment Helper ──

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

/**
 * Validates that a resolved file path stays within the uploads directory.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 */
function isPathSafe(requestedPath: string): boolean {
  const resolved = path.resolve(UPLOADS_DIR, requestedPath);
  // Ensure the resolved path starts with the uploads dir + separator
  // to prevent partial prefix matches (e.g., /uploads-evil)
  return resolved.startsWith(UPLOADS_DIR + path.sep) || resolved === UPLOADS_DIR;
}

/**
 * Verify HMAC signed URL token.
 * Returns true if the token + expires params are valid.
 */
function verifySignedUrl(assetPath: string, token: string, expires: string): boolean {
  // Check expiry
  const expiresAt = parseInt(expires, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    return false;
  }
  
  // Verify HMAC signature
  const secret = process.env.JWT_SECRET;
  const signingKey = secret && secret.length >= 32
    ? secret
    : 'dev-secret-key-do-not-use-in-production!';
  const expectedToken = crypto
    .createHmac('sha256', signingKey)
    .update(`${assetPath}:${expires}`)
    .digest('hex');
  
  return token === expectedToken;
}

/**
 * GET /api/v1/assets/{env}/{userId}/photos/{photoType}/{filename}
 * Serve user photos (character, child, profile reference photos)
 * Supports dual auth: HMAC signed URL (token+expires) OR Bearer auth with ownership check.
 *
 * Middleware chain:
 * 1. First middleware: check for signed URL params → if valid, mark auth and call next();
 *    if no signed URL params, delegate to requireAuth.
 * 2. Final handler: serve the file (with ownership check for Bearer auth).
 */
router.get('/:env/:userId/photos/:photoType/:filename',
  // Auth middleware: signed URL OR Bearer token
  (req: Request, res: Response, next) => {
    const { token, expires } = req.query;
    if (token && expires) {
      // Signed URL auth — verify HMAC token
      const { env, userId, photoType, filename } = req.params;
      const relativePath = `${env}/${userId}/photos/${photoType}/${filename}`;
      if (verifySignedUrl(relativePath, token as string, expires as string)) {
        (req as any).authMethod = 'signed_url';
        return next();
      }
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired signature'
      });
    }
    // No signed URL params — fall through to Bearer auth
    return requireAuth(req, res, next);
  },
  // Handler: validate and serve photo
  async (req: Request, res: Response) => {
  try {
    const { env, userId, photoType, filename } = req.params;
    
    // Validate photo type
    if (!['character', 'child', 'profile', 'character_turnaround', 'child_turnaround'].includes(photoType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid photo type'
      });
    }
    
    // Build path and validate containment
    const relativePath = `${env}/${userId}/photos/${photoType}/${filename}`;
    if (!isPathSafe(relativePath)) {
      logger.warn({ userId, relativePath }, 'Path traversal attempt in photos route');
      return res.status(400).json({
        status: 'error',
        message: 'Invalid file path'
      });
    }
    
    // Ownership check only for Bearer auth (signed URLs are self-validating)
    if ((req as any).authMethod !== 'signed_url') {
      if (userId !== req.user!.id) {
        logger.warn({ requestingUser: req.user!.id, targetUser: userId }, 'Unauthorized photo access attempt');
        return res.status(403).json({
          status: 'error',
          message: 'You can only access your own photos'
        });
      }
    }
    
    const fullPath = path.resolve(UPLOADS_DIR, relativePath);
    
    // Check file exists
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({
        status: 'error',
        message: 'Photo not found'
      });
    }
    
    // Detect MIME type from extension
    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    
    // Set appropriate headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400'); // Private cache, 24 hours
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS for images
    
    // Send file
    res.sendFile(fullPath);
    
  } catch (error) {
    logger.error({ error }, 'Failed to serve user photo');
    res.status(500).json({
      status: 'error',
      message: 'Failed to serve photo'
    });
  }
});

/**
 * GET /api/v1/assets/voice-samples/{language}/{voiceId}.mp3
 * Serve TTS voice sample audio files (public, no auth required)
 */
router.get('/voice-samples/:language/:filename', async (req: Request, res: Response) => {
  try {
    const { language, filename } = req.params;
    
    // Validate language
    const validLanguages = ['uk', 'en', 'ru', 'de', 'es', 'fr'];
    if (!validLanguages.includes(language)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid language'
      });
    }
    
    // Build path and validate containment
    const relativePath = `voice-samples/${language}/${filename}`;
    if (!isPathSafe(relativePath)) {
      logger.warn({ relativePath }, 'Path traversal attempt in voice-samples route');
      return res.status(400).json({
        status: 'error',
        message: 'Invalid file path'
      });
    }
    
    const fullPath = path.resolve(UPLOADS_DIR, relativePath);
    
    // Check file exists
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({
        status: 'error',
        message: 'Voice sample not found'
      });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days (samples don't change)
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS
    
    // Send file
    res.sendFile(fullPath);
    
  } catch (error) {
    logger.error({ error }, 'Failed to serve voice sample');
    res.status(500).json({
      status: 'error',
      message: 'Failed to serve voice sample'
    });
  }
});

/**
 * GET /api/v1/assets/*
 * Serve story assets (images, audio from generated stories)
 * Public access — no auth required. Signed URLs accepted for backward compat.
 */
router.get('/*', async (req: Request, res: Response) => {
  try {
    const assetPath = req.params[0];
    const { token, expires } = req.query;
    
    if (!assetPath) {
      return res.status(400).json({
        status: 'error',
        message: 'Asset path is required'
      });
    }
    
    // Optional: verify signed URL if present (backward compat with cached URLs)
    if (token && expires) {
      if (!verifySignedUrl(assetPath, token as string, expires as string)) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid or expired signature'
        });
      }
    }
    
    // Path containment check to prevent directory traversal
    if (!isPathSafe(assetPath)) {
      logger.warn({ assetPath }, 'Path traversal attempt in catch-all asset route');
      return res.status(400).json({
        status: 'error',
        message: 'Invalid file path'
      });
    }
    
    const pathParts = assetPath.split('/');
    
    // Expected format: {env}/{userId}/{storyId}/{assetType}/{filename}
    if (pathParts.length < 5) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid asset path format'
      });
    }
    
    const storyId = pathParts[2];
    
    // Validate story ID format
    if (!isUUID(storyId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid story ID format'
      });
    }
    
    // Check that asset exists
    const asset = await getAssetRepository().findByStoragePath(assetPath);
    
    if (!asset) {
      return res.status(404).json({
        status: 'error',
        message: 'Asset not found'
      });
    }
    
    // Serve file
    const fullPath = path.resolve(UPLOADS_DIR, assetPath);
    
    // Check file exists
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({
        status: 'error',
        message: 'Asset file not found'
      });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send file
    res.sendFile(fullPath);
    
  } catch (error) {
    logger.error({ error, path: req.params[0] }, 'Failed to serve asset');
    res.status(500).json({
      status: 'error',
      message: 'Failed to serve asset'
    });
  }
});

export default router;
