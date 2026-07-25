/**
 * Me Artifacts API
 * GET /api/v1/me/artifacts - List the family collection for a parent, or the current child collection
 * POST /api/v1/me/artifacts/collect - Collect the closing artifact from a readable story
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { DEFAULT_LOCALE, isValidLocale, type Locale } from '@wondertales/shared';
import { requireAuth } from '../middleware/authMiddleware';
import {
  getChildProfileRepository,
  getCollectedStoryArtifactRepository,
  getStoryArtifactRepository,
  getStoryRepository,
} from '../repositories';
import type { ArtifactCollectionOwner, CollectedStoryArtifactDetails } from '../repositories/CollectedStoryArtifactRepository';
import { canReadStoryForSession } from '../services/childStoryAccessService';
import { storyArtifactImageUrls } from '../services/storyArtifactImageService';
import { resolveStoryArtifactTitle } from '../services/storyArtifactService';
import { stripCharacterIds } from '../utils/audioTags';
import { logger } from '../utils/logger';

const router = Router();

const listQuerySchema = z.object({
  childProfileId: z.string().uuid().optional(),
  locale: z.string().trim().min(2).max(5).optional(),
});

const collectBodySchema = z.object({
  storyId: z.string().uuid(),
  artifactId: z.string().uuid().optional(),
  childProfileId: z.string().uuid().optional(),
  locale: z.string().trim().min(2).max(5).optional(),
});

function normalizeRequestLocale(value?: string | null): Locale | null {
  const normalized = value?.slice(0, 2).toLowerCase();
  return normalized && isValidLocale(normalized) ? normalized : null;
}

function resolveArtifactLocale(req: Request, explicitLocale?: string | null): Locale {
  const headerLocale =
    typeof req.headers['accept-language'] === 'string'
      ? req.headers['accept-language'].split(',')[0]
      : undefined;

  return (
    normalizeRequestLocale(explicitLocale) ||
    normalizeRequestLocale(req.user?.preferredLocale) ||
    normalizeRequestLocale(headerLocale) ||
    DEFAULT_LOCALE
  );
}

async function resolveCollectionOwner(
  req: Request,
  requestedChildProfileId?: string
): Promise<{ owner: ArtifactCollectionOwner } | { status: number; message: string }> {
  const userId = req.user!.id;

  if (req.sessionMode === 'child') {
    if (!req.childProfileId) {
      return { status: 403, message: 'Child profile context is required' };
    }
    return { owner: { userId, childProfileId: req.childProfileId } };
  }

  if (!requestedChildProfileId) {
    return { owner: { userId, childProfileId: null } };
  }

  const childProfile = await getChildProfileRepository().findById(requestedChildProfileId, userId);
  if (!childProfile) {
    return { status: 404, message: 'Child profile not found' };
  }

  return { owner: { userId, childProfileId: requestedChildProfileId } };
}

async function mapCollectedArtifact(
  details: CollectedStoryArtifactDetails,
  locale: Locale,
  collectedByChild?: { id: string; name: string } | null
) {
  const { collection, artifact, story } = details;
  const localizedTitle = await resolveStoryArtifactTitle(artifact, locale);
  const image = storyArtifactImageUrls(artifact.imagePath);

  return {
    id: collection.id,
    userId: collection.userId,
    childProfileId: collection.childProfileId,
    artifactId: collection.artifactId,
    storyId: collection.storyId,
    acquiredLabel: collection.acquiredLabel,
    acquiredAt: collection.acquiredAt,
    collectedByChild: collectedByChild ?? null,
    artifact: {
      id: artifact.id,
      artifactCode: artifact.artifactCode,
      title: localizedTitle,
      description: artifact.description,
      imagePath: artifact.imagePath,
      fullImagePath: image.fullImagePath,
      fullImageUrl: image.fullImageUrl,
      thumbnailPath: image.thumbnailPath,
      thumbnailUrl: image.thumbnailUrl,
      imageUrl: image.imageUrl,
      semanticTags: artifact.semanticTags,
    },
    story: {
      id: story.id,
      title: stripCharacterIds(story.title),
      language: story.language,
      createdAt: story.createdAt,
    },
  };
}

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid artifact collection query',
        errors: parsed.error.flatten(),
      });
    }

    const ownerResult = await resolveCollectionOwner(req, parsed.data.childProfileId);
    if ('status' in ownerResult) {
      return res.status(ownerResult.status).json({
        status: 'error',
        message: ownerResult.message,
      });
    }

    const repository = getCollectedStoryArtifactRepository();
    const rows = req.sessionMode === 'child' || parsed.data.childProfileId
      ? await repository.listForOwner(ownerResult.owner)
      : await repository.listForUser(req.user!.id);
    const locale = resolveArtifactLocale(req, parsed.data.locale);
    const childProfiles = req.sessionMode === 'child'
      ? []
      : await getChildProfileRepository().findByUserId(req.user!.id);
    const childProfilesById = new Map(
      childProfiles.map((profile) => [profile.id, { id: profile.id, name: profile.name }])
    );
    const artifacts = await Promise.all(
      rows.map((row) =>
        mapCollectedArtifact(
          row,
          locale,
          row.collection.childProfileId
            ? childProfilesById.get(row.collection.childProfileId) ?? null
            : null
        )
      )
    );

    // The collection is authenticated, user-specific data and must never be
    // reused by a browser intermediary or CDN for another session.
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({
      status: 'success',
      artifacts,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'List collected artifacts failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to list artifacts',
    });
  }
});

router.post('/collect', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = collectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid artifact collection payload',
        errors: parsed.error.flatten(),
      });
    }

    const { storyId, artifactId: requestedArtifactId, childProfileId, locale: requestedLocale } = parsed.data;
    const locale = resolveArtifactLocale(req, requestedLocale);
    const story = await getStoryRepository().findByIdAndUser(storyId, req.user!.id);

    if (!story || !canReadStoryForSession(req, story)) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    if (!story.closingArtifactId) {
      return res.status(400).json({
        status: 'error',
        message: 'Story has no collectible artifact',
      });
    }

    if (requestedArtifactId && requestedArtifactId !== story.closingArtifactId) {
      return res.status(409).json({
        status: 'error',
        message: 'Requested artifact does not match the story artifact',
      });
    }

    const ownerResult = await resolveCollectionOwner(req, childProfileId);
    if ('status' in ownerResult) {
      return res.status(ownerResult.status).json({
        status: 'error',
        message: ownerResult.message,
      });
    }

    const artifact = await getStoryArtifactRepository().findById(story.closingArtifactId);
    if (!artifact) {
      return res.status(404).json({
        status: 'error',
        message: 'Artifact not found',
      });
    }

    const repo = getCollectedStoryArtifactRepository();
    const existing = await repo.findForOwnerStoryArtifact({
      ...ownerResult.owner,
      artifactId: artifact.id,
      storyId: story.id,
    });

    if (existing) {
      return res.json({
        status: 'success',
        artifact: await mapCollectedArtifact(existing, locale),
        alreadyCollected: true,
      });
    }

    const storyLocaleTitle = await resolveStoryArtifactTitle(artifact, story.language || locale);
    const created = await repo.create({
      userId: ownerResult.owner.userId,
      childProfileId: ownerResult.owner.childProfileId ?? null,
      artifactId: artifact.id,
      storyId: story.id,
      acquiredLabel: story.closingKeepsakeLabel || storyLocaleTitle,
    });

    return res.status(201).json({
      status: 'success',
      artifact: await mapCollectedArtifact(created, locale),
      alreadyCollected: false,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Collect story artifact failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to collect artifact',
    });
  }
});

export default router;
