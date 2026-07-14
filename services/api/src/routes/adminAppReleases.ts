import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../middleware/authMiddleware';
import { getAppReleaseRepository } from '../repositories';
import {
  AppReleaseServiceError,
  createAdminAppRelease,
  getAdminAppRelease,
  listAdminAppReleases,
  updateAdminAppRelease,
} from '../services/appReleaseService';
import { getAssetStorageService } from '../services/assetStorageService';
import { renderAppReleaseEmailPreview } from '../services/appReleaseEmailRenderer';
import { logger } from '../utils/logger';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
const IdSchema = z.string().uuid();

router.use(requireAuth, requireAdmin);

function handleError(error: unknown, res: Response, context: string) {
  if (error instanceof AppReleaseServiceError) {
    return res
      .status(error.statusCode)
      .json({ status: 'error', code: error.code, message: error.message });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({ status: 'error', message: error.message });
  }
  logger.error({ err: error }, context);
  return res.status(500).json({ status: 'error', message: 'Failed to manage app release' });
}

router.get('/', async (_req, res) => {
  try {
    return res.json({ status: 'success', data: await listAdminAppReleases() });
  } catch (error) {
    return handleError(error, res, 'Failed to list app releases');
  }
});

router.get('/:releaseId', async (req, res) => {
  try {
    const release = await getAdminAppRelease(IdSchema.parse(req.params.releaseId));
    if (!release)
      return res.status(404).json({ status: 'error', message: 'App release not found' });
    return res.json({ status: 'success', data: release });
  } catch (error) {
    return handleError(error, res, 'Failed to get app release');
  }
});

router.post('/', async (req, res) => {
  try {
    const release = await createAdminAppRelease(req.body, req.user!.id);
    return res.status(201).json({ status: 'success', data: release });
  } catch (error) {
    return handleError(error, res, 'Failed to create app release');
  }
});

router.put('/:releaseId', async (req, res) => {
  try {
    const release = await updateAdminAppRelease(
      IdSchema.parse(req.params.releaseId),
      req.body,
      req.user!.id
    );
    return res.json({ status: 'success', data: release });
  } catch (error) {
    return handleError(error, res, 'Failed to update app release');
  }
});

router.get('/:releaseId/email-preview/:locale', async (req, res) => {
  try {
    const release = await getAdminAppRelease(IdSchema.parse(req.params.releaseId));
    if (!release) return res.status(404).send('Not Found');
    res.setHeader('Cache-Control', 'no-store');
    return res.type('html').send(renderAppReleaseEmailPreview(release, req.params.locale));
  } catch (error) {
    logger.error({ err: error }, 'Failed to render release email preview');
    return res.status(400).send('Unable to render preview');
  }
});

router.post('/:releaseId/media', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const releaseId = IdSchema.parse(req.params.releaseId);
    if (!(await getAdminAppRelease(releaseId))) {
      return res.status(404).json({ status: 'error', message: 'App release not found' });
    }
    if (!req.file)
      return res.status(400).json({ status: 'error', message: 'Image file is required' });
    const stored = await getAssetStorageService().uploadPublicAppReleaseImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      releaseId,
    });
    const media = await getAppReleaseRepository().createMedia({
      releaseId,
      storagePath: stored.storagePath,
      publicUrl: stored.storageUrl || `/api/v1/assets/${stored.storagePath}`,
      mimeType: 'image/jpeg',
      width: stored.width,
      height: stored.height,
      fileSize: stored.fileSizeBytes,
    });
    return res.status(201).json({ status: 'success', data: media });
  } catch (error) {
    return handleError(error, res, 'Failed to upload app release image');
  }
});

router.delete('/:releaseId/media/:mediaId', async (req, res) => {
  try {
    const releaseId = IdSchema.parse(req.params.releaseId);
    const mediaId = IdSchema.parse(req.params.mediaId);
    const media = await getAppReleaseRepository().findMediaById(mediaId);
    if (!media || media.releaseId !== releaseId) {
      return res.status(404).json({ status: 'error', message: 'Release image not found' });
    }
    await getAssetStorageService().deleteAsset(media.storagePath);
    await getAppReleaseRepository().deleteMedia(mediaId);
    return res.status(204).send();
  } catch (error) {
    return handleError(error, res, 'Failed to delete app release image');
  }
});

export default router;
