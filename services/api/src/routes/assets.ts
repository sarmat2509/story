import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { getAssetStorageService } from '../services/assetStorageService';
import { db } from '../db';
import { assets } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import { validate as isUUID } from 'uuid';

const router = Router();

/**
 * GET /api/v1/assets/{env}/{userId}/photos/{photoType}/{filename}
 * Serve user photos (character, child, profile reference photos)
 * Public in dev mode with local storage (no auth required)
 * In production with S3, use signed URLs
 */
router.get('/:env/:userId/photos/:photoType/:filename', async (req: Request, res: Response) => {
  try {
    const { env, userId, photoType, filename } = req.params;
    
    // Validate photo type
    if (!['character', 'child', 'profile'].includes(photoType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid photo type'
      });
    }
    
    // Build path
    const sanitizedPath = `${env}/${userId}/photos/${photoType}/${filename}`;
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const fullPath = path.join(uploadsDir, sanitizedPath);
    
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
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
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
    
    // Build path
    const sanitizedPath = `voice-samples/${language}/${filename}`;
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const fullPath = path.join(uploadsDir, sanitizedPath);
    
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
 * Security: Uses signed URLs with expiring tokens
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
    
    // Verify signed URL token
    if (!token || !expires) {
      return res.status(401).json({
        status: 'error',
        message: 'Missing signature parameters'
      });
    }
    
    // Check if token expired
    const expiresAt = parseInt(expires as string, 10);
    if (Date.now() > expiresAt) {
      return res.status(401).json({
        status: 'error',
        message: 'Signed URL has expired'
      });
    }
    
    // Verify token signature
    const crypto = require('crypto');
    const secret = process.env.JWT_SECRET || 'dev-secret-key';
    const expectedToken = crypto
      .createHmac('sha256', secret)
      .update(`${assetPath}:${expires}`)
      .digest('hex');
    
    if (token !== expectedToken) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid signature'
      });
    }
    
    // Sanitize path to prevent directory traversal
    const sanitizedPath = assetPath.replace(/\.\./g, '');
    const pathParts = sanitizedPath.split('/');
    
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
    const [asset] = await db
      .select({
        id: assets.id,
        storagePath: assets.storagePath,
        mimeType: assets.mimeType,
        storyId: assets.storyId,
      })
      .from(assets)
      .where(eq(assets.storagePath, sanitizedPath))
      .limit(1);
    
    if (!asset) {
      return res.status(404).json({
        status: 'error',
        message: 'Asset not found'
      });
    }
    
    // Serve file
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const fullPath = path.join(uploadsDir, sanitizedPath);
    
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
    res.setHeader('Cache-Control', 'private, max-age=86400'); // Private cache for 24h
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS for images
    
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
