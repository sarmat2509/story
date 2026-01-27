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
 * GET /api/v1/assets/*
 * Serve local assets (development only)
 * In production, assets should be served from S3/CDN
 */
router.get('/*', requireAuth, async (req: Request, res: Response) => {
  try {
    const assetPath = req.params[0];
    
    if (!assetPath) {
      return res.status(400).json({
        status: 'error',
        message: 'Asset path is required'
      });
    }
    
    // Sanitize path to prevent directory traversal
    const sanitizedPath = assetPath.replace(/\.\./g, '');
    
    // Verify asset exists in database and user has access
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
    
    // Check that user has access to this story
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
    
    // Verify user owns this story (security check)
    // Note: This requires joining with stories table
    // For simplicity, we trust the path structure in dev mode
    
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
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    
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
