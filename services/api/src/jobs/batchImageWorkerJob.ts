/**
 * Batch Image Worker Job
 * Processes batch_image_pending: creates Gemini batch, polls, saves scene assets, sets hidden=false.
 * Runs every 15–30 min. Env/turnaround: realtime (Imagen 4) — simplified for first version.
 */

import { logger } from '../utils/logger';
import { getStoryRepository, getSceneRepository, getAssetRepository } from '../repositories';
import { getAssetStorageService } from '../services/assetStorageService';
import { getPlanFeatures } from '../services/planService';
import {
  buildSceneBatchRequests,
  createSceneImageBatch,
  getBatchJobStatus,
  getBatchJobResults,
  parseBatchCustomId,
} from '../services/batchImageService';
import { notifyNewContinuationReady } from '../services/notificationService';
import { getIllustrationBlockStartSceneIds, getIllustrationSceneIds } from '../services/storyOrchestration/utilities';
import config from '../config';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const POLL_MAX_ATTEMPTS = 288; // 24h at 5 min = 288

let intervalId: NodeJS.Timeout | null = null;

export async function runBatchImageWorker(): Promise<void> {
  const provider = getBatchImageProviderInternal();
  if (!provider) {
    logger.debug('Batch image provider not configured, skipping');
    return;
  }

  const pending = await getStoryRepository().findBatchImagePendingAll();
  if (pending.length === 0) {
    return;
  }

  logger.info({ count: pending.length }, 'Batch image worker: processing pending');

  const userPlan = await getPlanFeatures(pending[0] ? (await getStoryRepository().findRequestById(pending[0].requestId))?.userId : '');
  const imagesPerStory = userPlan?.imagesPerStory || 3;

  const allRequests: Array<{ customId: string; request: import('../providers/base/IImageProvider').ImageBatchRequest; pendingId: string }> = [];
  const pendingIds: string[] = [];
  const storyContextMap = new Map<string, { storyId: string; requestId: string; userId: string }>();

  for (const p of pending) {
    const request = await getStoryRepository().findRequestById(p.requestId);
    if (!request) {
      logger.warn({ pendingId: p.id }, 'Request not found, skipping');
      continue;
    }

    const intermediateData = (request.intermediateData as any) || {};
    const text = intermediateData.validatedText || intermediateData.text;
    const spec = intermediateData.spec;

    if (!text || !spec) {
      logger.warn({ pendingId: p.id, requestId: p.requestId }, 'Missing text/spec in intermediateData');
      continue;
    }

    const totalScenes = text.scenes?.length || 0;
    const sceneIdsToGenerate = config.features.useDirectorFlow
      ? getIllustrationBlockStartSceneIds(totalScenes, imagesPerStory)
      : getIllustrationSceneIds(totalScenes, imagesPerStory);

    const context = {
      storyId: p.storyId,
      requestId: p.requestId,
      text,
      spec,
      sceneIdsToGenerate,
      style: (spec as any).imageStyle || config.image.defaultStyle,
      scenarioCardId: request.scenarioCardId,
      hasEnvironmentImageRef: false,
    };

    const requests = buildSceneBatchRequests(context);
    for (const req of requests) {
      allRequests.push({ customId: req.customId, request: req, pendingId: p.id });
    }
    pendingIds.push(p.id);
    storyContextMap.set(p.storyId, { storyId: p.storyId, requestId: p.requestId, userId: request.userId });
  }

  if (allRequests.length === 0) {
    return;
  }

  logger.info({ sceneCount: allRequests.length, storyCount: pending.length }, 'Creating batch image job');

  const batchJob = await createSceneImageBatch(allRequests.map((r) => r.request));
  const batchId = batchJob.batchId;

  await getStoryRepository().createBatchImageJob({
    batchId,
    vendor: 'gemini',
    status: 'in_progress',
    pendingIds,
  });

  let attempts = 0;
  while (attempts < POLL_MAX_ATTEMPTS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    attempts++;

    const status = await getBatchJobStatus(batchId);
    logger.info({ batchId, status: status.status, attempt: attempts }, 'Batch job status');

    if (status.status === 'completed') {
      break;
    }
    if (status.status === 'failed') {
      logger.error({ batchId, error: status.errorMessage }, 'Batch job failed');
      await getStoryRepository().updateBatchImageJobStatus(
        (await getStoryRepository().findBatchImageJobByBatchId(batchId))!.id,
        'failed'
      );
      return;
    }
  }

  if (attempts >= POLL_MAX_ATTEMPTS) {
    logger.warn({ batchId }, 'Batch job timed out');
    return;
  }

  const results = await getBatchJobResults(batchId);
  const assetStorage = getAssetStorageService();

  const processedStories = new Set<string>();

  for (const result of results) {
    const parsed = parseBatchCustomId(result.customId);
    if (!parsed) continue;

    const { storyId, sceneId } = parsed;
    const ctx = storyContextMap.get(storyId);
    if (!ctx) continue;

    if (result.error) {
      logger.warn({ storyId, sceneId, error: result.error }, 'Batch result error');
      continue;
    }

    if (!result.imageData || !result.mimeType) {
      logger.warn({ storyId, sceneId }, 'Batch result missing image');
      continue;
    }

    const scene = await getSceneRepository().findByStoryAndSceneId(storyId, sceneId);
    if (!scene) continue;

    const uploadResult = await assetStorage.uploadAsset({
      data: result.imageData,
      mimeType: result.mimeType,
      userId: ctx.userId,
      storyId,
      sceneId: scene.id,
      assetType: 'image',
    });

    await getAssetRepository().create({
      storyId,
      sceneId: scene.id,
      assetType: 'image',
      storagePath: uploadResult.storagePath,
      storageUrl: uploadResult.storageUrl,
      signedUrl: uploadResult.signedUrl,
      signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
      mimeType: result.mimeType,
      fileSizeBytes: uploadResult.fileSizeBytes,
      generationParams: { mode: 'batch', source: 'scheduled_continuation' },
      status: 'completed',
    });

    await getSceneRepository().update(scene.id, { imageUrl: uploadResult.storageUrl });
    processedStories.add(storyId);
  }

  for (const storyId of processedStories) {
    const ctx = storyContextMap.get(storyId);
    await getStoryRepository().updateStory(storyId, {
      hidden: false,
      metadata: {
        ...((await getStoryRepository().findById(storyId))?.metadata as Record<string, unknown> | null),
        imageGenerationComplete: true,
      },
    });
    if (ctx) {
      await notifyNewContinuationReady(ctx.userId, storyId);
    }
  }

  for (const id of pendingIds) {
    await getStoryRepository().deleteBatchImagePendingById(id);
  }

  const jobRecord = await getStoryRepository().findBatchImageJobByBatchId(batchId);
  if (jobRecord) {
    await getStoryRepository().updateBatchImageJobStatus(jobRecord.id, 'completed');
  }

  logger.info({ batchId, processedStories: processedStories.size }, 'Batch image worker completed');
}

function getBatchImageProviderInternal() {
  const { getBatchImageProvider } = require('../services/aiService');
  return getBatchImageProvider();
}

export function startBatchImageWorker(): void {
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => runBatchImageWorker().catch((err) => logger.error({ err }, 'Batch image worker error')), 15 * 60 * 1000);
  logger.info('Batch image worker started (every 15 min)');
}

export function stopBatchImageWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  logger.info('Batch image worker stopped');
}
