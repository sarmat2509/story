/**
 * Batch Image Service
 * Builds scene prompts, creates Gemini batch jobs, parses results.
 * Used by batchImageWorkerJob for scheduled continuations.
 *
 * Product note: this path is text-only (no Files API / turnaround / env reference images).
 * Realtime illustration uses `processStoryImages` → `generateSceneImageWithReference` instead.
 */

import type { ImageBatchRequest, BatchJob, BatchStatus, BatchResult } from '../providers/base/IImageProvider';
import { buildSceneImagePrompt, buildImageSystemInstruction, buildEnvironmentImagePrompt } from '../prompts/image';
import type { SceneVisual } from './types';
import { logger } from '../utils/logger';
import config from '../config';

/** Pending story context for building batch requests */
export interface BatchStoryContext {
  storyId: string;
  requestId: string;
  text: {
    scenes: Array<{
      sceneId: number;
      sceneVisual?: SceneVisual;
      visualPrompt?: string;
      environmentId?: string;
    }>;
    environments?: Array<{ id: string; name: string; description: string }>;
  };
  spec: { ageGroup: string; characters?: unknown[] };
  sceneIdsToGenerate: number[];
  style: string;
  scenarioCardId?: string | null;
  hasEnvironmentImageRef?: boolean;
}

/**
 * Build ImageBatchRequest[] for scene images from story context.
 * Reuses ImagePrompts logic — no reference images (batch API text-only path).
 */
export function buildSceneBatchRequests(context: BatchStoryContext): ImageBatchRequest[] {
  const { storyId, text, spec, sceneIdsToGenerate, style, scenarioCardId, hasEnvironmentImageRef } = context;
  const environmentMap = new Map(
    (text.environments || []).map((e) => [e.id, e])
  );

  const requests: ImageBatchRequest[] = [];

  for (const sceneId of sceneIdsToGenerate) {
    const scene = text.scenes.find((s: any) => s.sceneId === sceneId);
    if (!scene) continue;

    const sceneVisual = scene.sceneVisual
      ? (typeof scene.sceneVisual === 'string' ? JSON.parse(scene.sceneVisual) : scene.sceneVisual)
      : undefined;

    const currentEnvironment = scene.environmentId
      ? environmentMap.get(scene.environmentId)
      : undefined;

    const prompt = buildSceneImagePrompt({
      sceneVisual: sceneVisual as SceneVisual | undefined,
      visualPrompt: scene.visualPrompt,
      ageGroup: spec.ageGroup,
      style,
      hasReferences: false,
      scenarioCardId: scenarioCardId || undefined,
      hasEnvironmentImageRef: hasEnvironmentImageRef ?? false,
      currentEnvironment,
    });

    const systemInstruction = buildImageSystemInstruction({
      style,
      ageGroup: spec.ageGroup,
      hasReferences: false,
      scenarioCardId: scenarioCardId || undefined,
    });

    requests.push({
      customId: `story_${storyId}_scene_${sceneId}`,
      prompt,
      systemInstruction,
      aspectRatio: '16:9',
    });
  }

  return requests;
}

/** Build one 1K Gemini Batch request per missing Director environment plate. */
export function buildScheduledEnvironmentBatchRequest(params: {
  storyId: string; environment: { id: string; name: string; description: string }; scenarioCardId?: string | null;
}): ImageBatchRequest {
  return {
    customId: `scheduled_environment_${params.storyId}_${params.environment.id}`,
    prompt: buildEnvironmentImagePrompt({ environment: params.environment as any, scenarioCardId: params.scenarioCardId || undefined }),
    systemInstruction: buildImageSystemInstruction({ style: 'storybook', ageGroup: '6-8', hasReferences: false, hasEnvironmentReference: false, scenarioCardId: params.scenarioCardId || undefined }),
    aspectRatio: '16:9', modelOverride: config.image.gemini.scheduledEnvironmentBatchModel,
  };
}

export function parseScheduledEnvironmentCustomId(customId: string): { storyId: string; environmentId: string } | null {
  const match = customId.match(/^scheduled_environment_([a-f0-9-]+)_(.+)$/i);
  return match ? { storyId: match[1], environmentId: match[2] } : null;
}

/**
 * Get batch image provider (GeminiBatchImageProvider).
 * Returns null if batch is not configured (no BATCH_IMAGE_GCS_BUCKET).
 */
function getBatchImageProviderInternal(): { createImageBatch: (r: ImageBatchRequest[]) => Promise<BatchJob>; getBatchStatus: (id: string) => Promise<BatchStatus>; getBatchResults: (id: string) => Promise<BatchResult[]> } | null {
  const { getBatchImageProvider } = require('./aiService');
  const provider = getBatchImageProvider();
  if (!provider?.createImageBatch || !provider?.getBatchStatus || !provider?.getBatchResults) {
    return null;
  }
  return provider as { createImageBatch: (r: ImageBatchRequest[]) => Promise<BatchJob>; getBatchStatus: (id: string) => Promise<BatchStatus>; getBatchResults: (id: string) => Promise<BatchResult[]> };
}

/**
 * Create batch job for scene images.
 * @throws if batch provider not configured
 */
export async function createSceneImageBatch(requests: ImageBatchRequest[]): Promise<BatchJob> {
  const provider = getBatchImageProviderInternal();
  if (!provider) {
    throw new Error('Batch image generation not configured. Set BATCH_IMAGE_GCS_BUCKET.');
  }
  return provider.createImageBatch(requests);
}

/**
 * Get batch job status.
 */
export async function getBatchJobStatus(batchId: string): Promise<BatchStatus> {
  const provider = getBatchImageProviderInternal();
  if (!provider) {
    throw new Error('Batch image generation not configured.');
  }
  return provider.getBatchStatus(batchId);
}

/**
 * Get batch results.
 */
export async function getBatchJobResults(batchId: string): Promise<BatchResult[]> {
  const provider = getBatchImageProviderInternal();
  if (!provider) {
    throw new Error('Batch image generation not configured.');
  }
  return provider.getBatchResults(batchId);
}

/**
 * Parse customId to extract storyId and sceneId.
 */
export function parseBatchCustomId(customId: string): { storyId: string; sceneId: number } | null {
  const match = customId.match(/^story_([a-f0-9-]+)_scene_(\d+)$/i);
  if (!match) return null;
  return { storyId: match[1], sceneId: parseInt(match[2], 10) };
}
