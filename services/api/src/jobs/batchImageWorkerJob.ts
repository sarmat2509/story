/**
 * Batch Image Worker Job
 * Processes batch_image_pending: creates Gemini batch, polls, saves scene assets, sets hidden=false.
 * Runs every 15–30 min. Env/turnaround: realtime (Gemini image) — simplified for first version.
 */

import { logger } from '../utils/logger';
import { getStoryRepository, getSceneRepository, getAssetRepository, getStoryEnvironmentCacheRepository } from '../repositories';
import { getAssetStorageService } from '../services/assetStorageService';
import { getPlanFeatures } from '../services/planService';
import {
  buildSceneBatchRequests,
  buildScheduledEnvironmentBatchRequest,
  createSceneImageBatch,
  getBatchJobStatus,
  getBatchJobResults,
  parseBatchCustomId,
  parseScheduledEnvironmentCustomId,
} from '../services/batchImageService';
import { saveBatchEnvironmentImage } from '../services/environmentReferenceImageService';
import { notifyNewContinuationReady } from '../services/notificationService';
import { getIllustrationBlockStartSceneIds } from '../services/storyOrchestration/utilities';
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

  const environmentPending = pending.filter((row) => row.purpose === 'scheduled_environment');
  if (environmentPending.length) {
    await processScheduledEnvironmentBatch(environmentPending);
    return; // do not mix model/purpose with the legacy scene batch
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
    const sceneIdsToGenerate = getIllustrationBlockStartSceneIds(totalScenes, imagesPerStory);

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

/** Wait for the discounted Gemini batch only for environment plates, persist
 * them in the existing cache, then resume the normal realtime Seedream jobs. */
async function processScheduledEnvironmentBatch(pending: Awaited<ReturnType<ReturnType<typeof getStoryRepository>['findBatchImagePendingAll']>>): Promise<void> {
  const contexts = new Map<string, { pendingId: string; requestId: string; storyId: string; userId: string; environment: any; scenarioCardId?: string | null }>();
  const requests: any[] = [];
  for (const row of pending) {
    const request = await getStoryRepository().findRequestById(row.requestId);
    if (!request) continue;
    const data = (request.intermediateData as any) || {};
    const environments = data.validatedText?.environments || data.text?.environments || [];
    for (const environment of environments) {
      if (await getStoryEnvironmentCacheRepository().getByStoryAndEnvId(row.storyId, environment.id)) continue;
      const batchRequest = buildScheduledEnvironmentBatchRequest({ storyId: row.storyId, environment, scenarioCardId: request.scenarioCardId });
      // Director IDs are unique per story, so this also deduplicates worker retries.
      if (contexts.has(batchRequest.customId)) continue;
      contexts.set(batchRequest.customId, { pendingId: row.id, requestId: row.requestId, storyId: row.storyId, userId: request.userId, environment, scenarioCardId: request.scenarioCardId });
      requests.push(batchRequest);
    }
  }
  if (requests.length) {
    const batchJob = await createSceneImageBatch(requests);
    await getStoryRepository().createBatchImageJob({ batchId: batchJob.batchId, vendor: 'gemini', status: 'in_progress', pendingIds: pending.map((row) => row.id) });
    let status;
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      status = await getBatchJobStatus(batchJob.batchId);
      logger.info({ batchId: batchJob.batchId, status: status.status, purpose: 'scheduled_environment' }, 'Scheduled environment batch status');
      if (status.status === 'completed' || status.status === 'failed') break;
    }
    if (status?.status !== 'completed') {
      logger.warn({ batchId: batchJob.batchId, status: status?.status }, 'Scheduled environment batch incomplete; leaving pending rows for retry');
      return;
    }
    const storage = getAssetStorageService();
    let savedCount = 0;
    for (const result of await getBatchJobResults(batchJob.batchId)) {
      const parsed = parseScheduledEnvironmentCustomId(result.customId);
      const context = contexts.get(result.customId);
      if (!parsed || !context || result.error || !result.imageData || !result.mimeType) {
        if (context) logger.warn({ customId: result.customId, error: result.error }, 'Scheduled environment batch result unavailable');
        continue;
      }
      await saveBatchEnvironmentImage({ storyId: context.storyId, userId: context.userId, storyEnvironmentId: parsed.environmentId, environment: context.environment, scenarioCardId: context.scenarioCardId || undefined, assetStorage: storage, imageData: result.imageData, mimeType: result.mimeType });
      savedCount++;
    }
    if (savedCount !== contexts.size) {
      logger.warn({ batchId: batchJob.batchId, expected: contexts.size, saved: savedCount }, 'Scheduled environment batch partially failed; final realtime images will not start');
      return;
    }
    const record = await getStoryRepository().findBatchImageJobByBatchId(batchJob.batchId);
    if (record) await getStoryRepository().updateBatchImageJobStatus(record.id, 'completed');
  }
  const { imageQueue } = await import('./storyJobProcessor');
  for (const row of pending) {
    const request = await getStoryRepository().findRequestById(row.requestId);
    const kind = (request?.intermediateData as any)?.generationKind;
    await imageQueue.addJob({ type: kind === 'graphic_novel' || kind === 'mixed_story' ? 'graphic_novel_pages' : 'image_batch', requestId: row.requestId, storyId: row.storyId });
    await getStoryRepository().deleteBatchImagePendingById(row.id);
  }
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
