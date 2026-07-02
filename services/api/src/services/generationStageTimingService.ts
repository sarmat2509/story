import { getStoryGenerationStageEventRepository } from '../repositories';
import { logger } from '../utils/logger';

export type StoryGenerationKind = 'story' | 'graphic_novel' | 'mixed_story';

export type GenerationPipelinePhase =
  | 'text'
  | 'visual_planning'
  | 'asset_generation'
  | 'validation'
  | 'audio'
  | 'postprocess';

export type GenerationStageStatus = 'completed' | 'failed' | 'skipped' | 'cached';
export type GenerationCacheStatus = 'hit' | 'miss' | 'reused' | 'none';

export interface GenerationStageTimingInput {
  storyId?: string | null;
  storyRequestId?: string | null;
  userId?: string | null;
  parentEventId?: string | null;
  generationKind: StoryGenerationKind;
  pipelinePhase: GenerationPipelinePhase;
  operation: string;
  targetType?: string | null;
  targetKey?: string | null;
  sceneIndex?: number | null;
  pageNumber?: number | null;
  assetId?: string | null;
  status?: GenerationStageStatus;
  attempt?: number;
  cacheStatus?: GenerationCacheStatus | null;
  provider?: string | null;
  model?: string | null;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  metadata?: Record<string, unknown> | null;
}

function normalizeDurationMs(startedAt: Date, completedAt: Date, durationMs?: number): number {
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
    return Math.round(durationMs);
  }
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

export async function recordStageTiming(input: GenerationStageTimingInput): Promise<string | null> {
  const startedAt = input.startedAt ?? new Date();
  const completedAt = input.completedAt ?? new Date();
  const durationMs = normalizeDurationMs(startedAt, completedAt, input.durationMs);

  try {
    const row = await getStoryGenerationStageEventRepository().create({
      storyId: input.storyId ?? null,
      storyRequestId: input.storyRequestId ?? null,
      userId: input.userId ?? null,
      parentEventId: input.parentEventId ?? null,
      generationKind: input.generationKind,
      pipelinePhase: input.pipelinePhase,
      operation: input.operation,
      targetType: input.targetType ?? null,
      targetKey: input.targetKey ?? null,
      sceneIndex: input.sceneIndex ?? null,
      pageNumber: input.pageNumber ?? null,
      assetId: input.assetId ?? null,
      status: input.status ?? 'completed',
      attempt: input.attempt ?? 1,
      cacheStatus: input.cacheStatus ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      startedAt,
      completedAt,
      durationMs,
      metadata: input.metadata ?? {},
    });
    return row.id;
  } catch (error) {
    logger.warn(
      {
        err: error,
        storyId: input.storyId,
        storyRequestId: input.storyRequestId,
        operation: input.operation,
      },
      'Failed to record story generation stage timing'
    );
    return null;
  }
}

export async function withStageTiming<T>(
  input: Omit<
    GenerationStageTimingInput,
    'startedAt' | 'completedAt' | 'durationMs' | 'status' | 'metadata'
  > & {
    metadata?: Record<string, unknown> | null;
    successMetadata?: (result: T) => Record<string, unknown> | null | undefined;
    failureMetadata?: (error: unknown) => Record<string, unknown> | null | undefined;
  },
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = new Date();
  try {
    const result = await fn();
    await recordStageTiming({
      ...input,
      status: 'completed',
      startedAt,
      completedAt: new Date(),
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.successMetadata?.(result) ?? {}),
      },
    });
    return result;
  } catch (error) {
    await recordStageTiming({
      ...input,
      status: 'failed',
      startedAt,
      completedAt: new Date(),
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.failureMetadata?.(error) ?? {
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      },
    });
    throw error;
  }
}
