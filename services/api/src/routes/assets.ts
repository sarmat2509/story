import { Router, Request, Response } from 'express';
import { DEFAULT_LOCALE, isPhotoType, isValidLocale } from '@wondertales/shared';
import { getAssetRepository, getStoryRepository } from '../repositories';
import { verifyToken } from '../services/jwtService';
import { getSessionWithUser } from '../services/sessionService';
import { isPublicAuthorAvatarPath } from '../services/publicStoryService';
import {
  decideStoryAssetAccess,
  type AssetAccessDecision,
  type AssetAccessSession,
} from '../services/assetAccessService';
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

function getMimeTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp3': 'audio/mpeg',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

async function sendPublicFile(
  res: Response,
  relativePath: string,
  mimeType?: string,
  cacheControl = 'public, max-age=86400'
) {
  const fullPath = path.resolve(UPLOADS_DIR, relativePath);

  await fs.access(fullPath);

  res.setHeader('Content-Type', mimeType || getMimeTypeForFile(fullPath));
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  res.sendFile(fullPath);
}

async function sendPrivateFile(res: Response, relativePath: string, mimeType?: string) {
  const fullPath = path.resolve(UPLOADS_DIR, relativePath);

  await fs.access(fullPath);

  res.setHeader('Content-Type', mimeType || getMimeTypeForFile(fullPath));
  res.setHeader('Cache-Control', 'private, max-age=86400');

  res.sendFile(fullPath);
}

type StoryAssetFile = {
  id: string;
  storagePath: string;
  thumbnailPath: string | null;
  mimeType: string;
};

async function sendStoryAssetFile(
  res: Response,
  asset: StoryAssetFile,
  requestedPath: string,
  visibility: 'public' | 'private',
): Promise<boolean> {
  const sendFile = visibility === 'public' ? sendPublicFile : sendPrivateFile;
  const requestedMimeType = requestedPath === asset.thumbnailPath
    ? getMimeTypeForFile(requestedPath)
    : asset.mimeType;

  try {
    await sendFile(res, requestedPath, requestedMimeType);
    return true;
  } catch (error) {
    const canServeThumbnailFallback =
      requestedPath === asset.storagePath &&
      asset.thumbnailPath &&
      asset.thumbnailPath !== requestedPath &&
      isPathSafe(asset.thumbnailPath);

    if (!canServeThumbnailFallback) {
      logger.warn({ error, assetId: asset.id, requestedPath }, 'Story asset file missing');
      return false;
    }

    try {
      await sendFile(res, asset.thumbnailPath, getMimeTypeForFile(asset.thumbnailPath));
      logger.warn(
        { assetId: asset.id, requestedPath, thumbnailPath: asset.thumbnailPath },
        'Story asset original missing, served thumbnail fallback',
      );
      return true;
    } catch (fallbackError) {
      logger.warn(
        { error, fallbackError, assetId: asset.id, requestedPath, thumbnailPath: asset.thumbnailPath },
        'Story asset original and thumbnail fallback missing',
      );
      return false;
    }
  }
}

function getStringQueryParam(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

async function getAssetRequestSession(req: Request): Promise<AssetAccessSession | null> {
  const cookieToken = req.cookies?.wt_session as string | undefined;
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : undefined;
  const jwt = cookieToken || bearerToken;

  if (!jwt) return null;

  const decoded = verifyToken(jwt);
  if (!decoded) return null;

  const session = await getSessionWithUser(decoded.sessionId);
  if (!session) return null;

  return {
    userId: session.user.id,
    role: session.user.role,
  };
}

function sendAssetAccessDenied(res: Response, decision: AssetAccessDecision) {
  if (decision.allowed) {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied',
    });
  }

  const denied = decision as Extract<AssetAccessDecision, { allowed: false }>;
  return res.status(denied.status).json({
    status: 'error',
    message:
      denied.status === 401
        ? 'Authentication required'
        : denied.status === 404
          ? 'Asset not found'
          : 'Access denied',
  });
}

async function serveRejectedDebugAsset(req: Request, res: Response, assetPath: string) {
  const pathParts = assetPath.split('/');

  // Expected format: {env}/{userId}/{storyId}/rejected/{filename}
  if (pathParts.length < 5 || pathParts[3] !== 'rejected') {
    return res.status(404).json({
      status: 'error',
      message: 'Asset not found',
    });
  }

  const userId = pathParts[1];
  const storyId = pathParts[2];

  if (!isUUID(storyId)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid story ID format',
    });
  }

  const session = await getAssetRequestSession(req);
  const story = await getStoryRepository().findById(storyId);

  if (!story || story.userId !== userId) {
    return res.status(404).json({
      status: 'error',
      message: 'Asset not found',
    });
  }

  const decision = decideStoryAssetAccess({ story, session });
  if (!decision.allowed) {
    return sendAssetAccessDenied(res, decision);
  }
  if (decision.cacheControl !== 'private') {
    return sendAssetAccessDenied(res, {
      allowed: false,
      status: 403,
      reason: 'debug_asset_requires_private_access',
    });
  }

  try {
    await sendPrivateFile(res, assetPath);
    return;
  } catch {
    return res.status(404).json({
      status: 'error',
      message: 'Asset file not found',
    });
  }
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
 * GET /api/v1/assets/llm_turnaround_cache/:filename
 * Serve LLM turnaround cache images (character turnaround sheets).
 * Auth: any logged-in user (turnaround shown in character cards).
 */
router.get('/llm_turnaround_cache/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;

    const cookieToken = req.cookies?.wt_session as string | undefined;
    const bearerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const jwt = cookieToken || bearerToken;

    if (!jwt) {
      return res.status(401).json({ status: 'error', message: 'Authentication required' });
    }

    const decoded = verifyToken(jwt);
    if (!decoded) {
      return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
    }

    const session = await getSessionWithUser(decoded.sessionId);
    if (!session) {
      return res.status(401).json({ status: 'error', message: 'Session expired' });
    }

    const relativePath = `llm_turnaround_cache/${filename}`;
    if (!isPathSafe(relativePath)) {
      logger.warn({ relativePath }, 'Path traversal attempt in llm_turnaround_cache route');
      return res.status(400).json({ status: 'error', message: 'Invalid file path' });
    }

    const fullPath = path.resolve(UPLOADS_DIR, relativePath);

    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ status: 'error', message: 'Turnaround cache image not found' });
    }

    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    const mimeType = mimeTypes[ext] || 'image/png';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.sendFile(fullPath);
  } catch (error) {
    logger.error({ error }, 'Failed to serve LLM turnaround cache image');
    res.status(500).json({ status: 'error', message: 'Failed to serve image' });
  }
});

/**
 * GET /api/v1/assets/{env}/{userId}/photos/{photoType}/{filename}
 * Serve user photos (character, child, profile reference photos).
 * Auth: wt_session cookie (automatic from <img>) OR Bearer header (API clients).
 * Ownership check: session userId must match the userId in the URL path.
 * Admin sessions may inspect user photos from the admin story/detail screens.
 */
router.get('/:env/:userId/photos/:photoType/:filename', async (req: Request, res: Response) => {
  try {
    const { env, userId, photoType, filename } = req.params;
    const { token, expires } = req.query;
    
    // Validate photo type
    if (!isPhotoType(photoType)) {
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

    // Signed URL access path (used by feedback screenshots and other private asset previews)
    if (token && expires) {
      if (verifySignedUrl(relativePath, token as string, expires as string)) {
        return sendPublicFile(res, relativePath);
      }

      logger.debug(
        { relativePath },
        'Signed asset URL is invalid or expired, falling back to authenticated access',
      );
    }

    if (photoType === 'profile') {
      const publicAuthorAvatar = await isPublicAuthorAvatarPath(userId, relativePath);
      if (publicAuthorAvatar) {
        try {
          await sendPublicFile(res, relativePath);
          return;
        } catch {
          return res.status(404).json({
            status: 'error',
            message: 'Photo not found',
          });
        }
      }
    }
    
    // --- Auth: cookie OR Bearer header ---
    const cookieToken = req.cookies?.wt_session as string | undefined;
    const bearerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const jwt = cookieToken || bearerToken;

    if (!jwt) {
      return res.status(401).json({ status: 'error', message: 'Authentication required' });
    }

    const decoded = verifyToken(jwt);
    if (!decoded) {
      return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
    }

    const session = await getSessionWithUser(decoded.sessionId);
    if (!session) {
      return res.status(401).json({ status: 'error', message: 'Session expired' });
    }

    // Ownership check: URL userId must match authenticated user, or an admin session.
    if (userId !== session.user.id && session.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Access denied' });
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
    res.setHeader('Cache-Control', 'private, max-age=86400');
    
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
    if (!isValidLocale(language)) {
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

    const fallbackRelativePath = `voice-samples/${DEFAULT_LOCALE}/${filename}`;
    if (!isPathSafe(fallbackRelativePath)) {
      logger.warn({ fallbackRelativePath }, 'Path traversal attempt in voice-samples fallback route');
      return res.status(400).json({
        status: 'error',
        message: 'Invalid file path'
      });
    }

    const candidatePaths = language === DEFAULT_LOCALE
      ? [relativePath]
      : [relativePath, fallbackRelativePath];

    for (const candidatePath of candidatePaths) {
      const fullPath = path.resolve(UPLOADS_DIR, candidatePath);

      try {
        await fs.access(fullPath);
        return sendPublicFile(res, candidatePath, 'audio/mpeg');
      } catch {
        continue;
      }
    }

    logger.warn({ language, filename, fallbackLocale: DEFAULT_LOCALE }, 'Voice sample not found in requested locale or fallback locale');
    return res.status(404).json({
      status: 'error',
      message: 'Voice sample not found'
    });
    
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
 * Access:
 * - public catalog stories are public;
 * - unlisted stories require shareToken query;
 * - private stories require owner/admin session;
 * - signed URLs are accepted for backward compatibility.
 */
router.get('/*', async (req: Request, res: Response) => {
  try {
    const assetPath = req.params[0];
    const token = getStringQueryParam(req.query.token);
    const expires = getStringQueryParam(req.query.expires);
    const shareToken =
      getStringQueryParam(req.query.shareToken) ||
      getStringQueryParam(req.query.share_token);
    
    if (!assetPath) {
      return res.status(400).json({
        status: 'error',
        message: 'Asset path is required'
      });
    }
    
    // Path containment check to prevent directory traversal
    if (!isPathSafe(assetPath)) {
      logger.warn({ assetPath }, 'Path traversal attempt in catch-all asset route');
      return res.status(400).json({
        status: 'error',
        message: 'Invalid file path'
      });
    }

    if (assetPath.startsWith('story-artifacts/')) {
      try {
        await sendPublicFile(res, assetPath, undefined, 'public, max-age=600, must-revalidate');
        return;
      } catch {
        return res.status(404).json({
          status: 'error',
          message: 'Asset file not found',
        });
      }
    }

    if (assetPath.startsWith('app-releases/')) {
      try {
        await sendPublicFile(res, assetPath, undefined, 'public, max-age=31536000, immutable');
        return;
      } catch {
        return res.status(404).json({
          status: 'error',
          message: 'Asset file not found',
        });
      }
    }

    if (assetPath.startsWith('env_cache/') || assetPath.startsWith('outfit_plate_cache/')) {
      try {
        await sendPublicFile(res, assetPath);
        return;
      } catch {
        return res.status(404).json({
          status: 'error',
          message: 'Asset file not found',
        });
      }
    }

    if (assetPath.startsWith('character_outfit_turnaround_cache/')) {
      const session = await getAssetRequestSession(req);
      if (!session) {
        return sendAssetAccessDenied(res, {
          allowed: false,
          status: 401,
          reason: 'authentication_required',
        });
      }

      try {
        await sendPrivateFile(res, assetPath);
        return;
      } catch {
        return res.status(404).json({
          status: 'error',
          message: 'Asset file not found',
        });
      }
    }

    if (assetPath.includes('/rejected/')) {
      return serveRejectedDebugAsset(req, res, assetPath);
    }

    let hasValidSignedUrl = false;
    if (token && expires) {
      if (!verifySignedUrl(assetPath, token, expires)) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid or expired signature'
        });
      }
      hasValidSignedUrl = true;
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
    
    // Check that asset exists (by original storage path OR thumbnail path)
    const asset = await getAssetRepository().findByStorageOrThumbnailPath(assetPath);
    
    if (!asset) {
      return res.status(404).json({
        status: 'error',
        message: 'Asset not found'
      });
    }

    const story = await getStoryRepository().findById(asset.storyId);
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Asset not found'
      });
    }

    const publicDecision = decideStoryAssetAccess({
      story,
      shareToken,
      hasValidSignedUrl,
    });

    if (publicDecision.allowed) {
      if (await sendStoryAssetFile(res, asset, assetPath, 'public')) {
        return;
      }

      return res.status(404).json({
        status: 'error',
        message: 'Asset file not found',
      });
    }

    const session = await getAssetRequestSession(req);
    const authenticatedDecision = decideStoryAssetAccess({
      story,
      session,
      shareToken,
      hasValidSignedUrl,
    });

    if (!authenticatedDecision.allowed) {
      return sendAssetAccessDenied(res, authenticatedDecision);
    }
    
    if (await sendStoryAssetFile(res, asset, assetPath, 'private')) {
      return;
    }

    return res.status(404).json({
      status: 'error',
      message: 'Asset file not found',
    });
  } catch (error) {
    logger.error({ error, path: req.params[0] }, 'Failed to serve asset');
    res.status(500).json({
      status: 'error',
      message: 'Failed to serve asset'
    });
  }
});

export default router;
