import { getStoryRepository } from '../repositories';
import { logger } from '../utils/logger';

/**
 * Story tasks that can run in parallel
 */
export const STORY_TASKS = {
  ANALYZING_PHOTOS: 'analyzing_photos', // Photo analysis for instant mode
  GENERATING_TEXT: 'generating_text',
  PRODUCING_VISUALS: 'producing_visuals',
  VALIDATING: 'validating',
  GENERATING_PORTRAITS: 'generating_portraits',
  GENERATING_IMAGES: 'generating_images',
  GENERATING_AUDIO: 'generating_audio',
} as const;

export type StoryTask = typeof STORY_TASKS[keyof typeof STORY_TASKS];

/**
 * Estimated durations for each task type (in milliseconds).
 * These define the "weight" of each task through time.
 * Tasks not in this list default to 10 seconds.
 */
const TASK_ESTIMATED_DURATIONS: Partial<Record<StoryTask, number>> = {
  [STORY_TASKS.ANALYZING_PHOTOS]: 45000,     // 45s (dedup + analysis + turnaround for ALL character types)
  [STORY_TASKS.GENERATING_TEXT]: 45000,      // 45s (LLM text generation)
  [STORY_TASKS.PRODUCING_VISUALS]: 15000,    // 15s (Director/producer visual scene preparation)
  [STORY_TASKS.VALIDATING]: 15000,           // 15s (content validation)
  [STORY_TASKS.GENERATING_PORTRAITS]: 15000, // 15s per portrait (default, overridden by estimatedMs from coefficients)
  [STORY_TASKS.GENERATING_IMAGES]: 15000,    // 15s per image (default, overridden by estimatedMs from coefficients)
  [STORY_TASKS.GENERATING_AUDIO]: 15000,     // 15s per audio chunk (default, overridden by estimatedMs from coefficients)
};

export interface ActiveTask {
  task: StoryTask;
  progress: number; // 0-100
  details?: Record<string, any>; // for i18n interpolation
}

export interface PlannedStoryTask {
  task: StoryTask;
  estimatedMs: number;
  rangeStart: number; // 0-100
  rangeEnd: number; // 0-100
}

export interface StoryTaskTimelineEntry {
  startedAt?: number;
  completedAt?: number;
  estimatedMs?: number;
}

export interface StoryProgress {
  overallProgress: number; // 0-100
  activeTasks: ActiveTask[];
  completedTasks: StoryTask[];
  plannedTasks?: PlannedStoryTask[];
  taskTimeline?: Partial<Record<StoryTask, StoryTaskTimelineEntry>>;
  maxOverallProgress?: number;
}

type PlannedTaskInput = {
  task: StoryTask;
  estimatedMs?: number;
};

const DEFAULT_PROGRESS: StoryProgress = {
  overallProgress: 0,
  activeTasks: [],
  completedTasks: [],
  plannedTasks: [],
  taskTimeline: {},
  maxOverallProgress: 0,
};

function createEmptyProgress(): StoryProgress {
  return {
    overallProgress: 0,
    activeTasks: [],
    completedTasks: [],
    plannedTasks: [],
    taskTimeline: {},
    maxOverallProgress: 0,
  };
}

function normalizeProgress(progressData: StoryProgress | null | undefined): StoryProgress {
  const progress = progressData ?? DEFAULT_PROGRESS;
  return {
    overallProgress: progress.overallProgress ?? 0,
    activeTasks: Array.isArray(progress.activeTasks)
      ? progress.activeTasks.map((task) => ({
          ...task,
          progress: clampPercent(task.progress ?? 0),
          ...(task.details ? { details: { ...task.details } } : {}),
        }))
      : [],
    completedTasks: Array.isArray(progress.completedTasks)
      ? [...progress.completedTasks]
      : [],
    plannedTasks: Array.isArray(progress.plannedTasks)
      ? progress.plannedTasks.map((task) => ({ ...task }))
      : [],
    taskTimeline: progress.taskTimeline ? { ...progress.taskTimeline } : {},
    maxOverallProgress: progress.maxOverallProgress ?? progress.overallProgress ?? 0,
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function getTaskDuration(task: StoryTask, estimatedMs?: number): number {
  if (typeof estimatedMs === 'number' && estimatedMs > 0) {
    return estimatedMs;
  }
  return TASK_ESTIMATED_DURATIONS[task] || 10000;
}

function buildPlannedTasks(inputs: PlannedTaskInput[]): PlannedStoryTask[] {
  const normalizedInputs = inputs.map((input) => ({
    task: input.task,
    estimatedMs:
      typeof input.estimatedMs === 'number' && input.estimatedMs >= 0
        ? input.estimatedMs
        : getTaskDuration(input.task),
  }));

  const totalMs = normalizedInputs.reduce((sum, task) => sum + task.estimatedMs, 0);
  if (totalMs <= 0) {
    return normalizedInputs.map((task) => ({
      ...task,
      rangeStart: 0,
      rangeEnd: 0,
    }));
  }

  let accumulatedMs = 0;

  return normalizedInputs.map((task, index) => {
    const rangeStart = (accumulatedMs / totalMs) * 100;
    accumulatedMs += task.estimatedMs;
    const isLast = index === normalizedInputs.length - 1;
    const rangeEnd = isLast ? 100 : (accumulatedMs / totalMs) * 100;

    return {
      ...task,
      rangeStart,
      rangeEnd,
    };
  });
}

function getOrCreateTimelineEntry(progress: StoryProgress, task: StoryTask): StoryTaskTimelineEntry {
  const existing = progress.taskTimeline?.[task];
  if (existing) {
    return existing;
  }

  const entry: StoryTaskTimelineEntry = {};
  progress.taskTimeline = progress.taskTimeline ?? {};
  progress.taskTimeline[task] = entry;
  return entry;
}

function getElapsedRatio(
  plannedTask: PlannedStoryTask | undefined,
  timelineEntry: StoryTaskTimelineEntry | undefined,
  fallbackTask: ActiveTask | undefined,
  now: number,
): number {
  const startedAt = timelineEntry?.startedAt ?? fallbackTask?.details?.startedAt;
  const estimatedMs = plannedTask?.estimatedMs
    ?? timelineEntry?.estimatedMs
    ?? fallbackTask?.details?.estimatedMs;

  if (startedAt == null || estimatedMs == null || estimatedMs < 0) {
    return 0;
  }
  if (estimatedMs === 0) {
    return 1;
  }

  const elapsed = Math.max(0, now - startedAt);
  return clampRatio(elapsed / estimatedMs);
}

function calculateTaskProgressInRange(
  rangeStart: number,
  rangeEnd: number,
  ratio: number,
): number {
  return rangeStart + ((rangeEnd - rangeStart) * clampRatio(ratio));
}

export function recalculateStoryProgress(
  progressData: StoryProgress | null | undefined,
  now: number = Date.now(),
): StoryProgress {
  const progress = normalizeProgress(progressData);

  let overallProgress: number;

  if (progress.plannedTasks && progress.plannedTasks.length > 0) {
    overallProgress = 0;

    for (const plannedTask of progress.plannedTasks) {
      if (progress.completedTasks.includes(plannedTask.task)) {
        overallProgress = Math.max(overallProgress, plannedTask.rangeEnd);
        continue;
      }

      const activeTask = progress.activeTasks.find((task) => task.task === plannedTask.task);
      if (!activeTask) {
        continue;
      }

      const timelineEntry = progress.taskTimeline?.[plannedTask.task];
      const elapsedRatio = getElapsedRatio(plannedTask, timelineEntry, activeTask, now);
      const taskProgress = calculateTaskProgressInRange(
        plannedTask.rangeStart,
        plannedTask.rangeEnd,
        elapsedRatio,
      );

      overallProgress = Math.max(overallProgress, taskProgress);
      activeTask.progress = clampPercent(taskProgress);
    }
  } else {
    overallProgress = calculateOverallProgress(progress.completedTasks, progress.activeTasks);
  }

  const monotonicProgress = Math.max(
    progress.maxOverallProgress ?? 0,
    clampPercent(overallProgress),
  );

  progress.overallProgress = monotonicProgress;
  progress.maxOverallProgress = monotonicProgress;

  return progress;
}

export async function setPlannedTasks(
  requestId: string,
  tasks: PlannedTaskInput[],
): Promise<void> {
  const storyRepo = getStoryRepository();

  await storyRepo.transaction(async (tx) => {
    const request = await storyRepo.findRequestForUpdate(requestId, tx);
    if (!request) {
      throw new Error(`Story request not found: ${requestId}`);
    }

    const currentProgress = normalizeProgress(request.progressData as StoryProgress | null);
    if ((currentProgress.plannedTasks?.length ?? 0) > 0) {
      return;
    }

    currentProgress.plannedTasks = buildPlannedTasks(tasks);
    for (const plannedTask of currentProgress.plannedTasks) {
      const timelineEntry = getOrCreateTimelineEntry(currentProgress, plannedTask.task);
      if (!timelineEntry.estimatedMs) {
        timelineEntry.estimatedMs = plannedTask.estimatedMs;
      }
    }

    const nextProgress = recalculateStoryProgress(currentProgress);

    await storyRepo.updateRequest(
      requestId,
      {
        progressData: nextProgress,
        progress: nextProgress.overallProgress,
        updatedAt: new Date(),
      },
      tx,
    );

    logger.info(
      {
        requestId,
        plannedTasks: currentProgress.plannedTasks.map((task) => ({
          task: task.task,
          estimatedMs: task.estimatedMs,
          rangeStart: clampPercent(task.rangeStart),
          rangeEnd: clampPercent(task.rangeEnd),
        })),
      },
      'Story progress plan initialized',
    );
  });
}

/**
 * Update progress for a specific task
 * Uses atomic JSONB operations to prevent race conditions
 * @param requestId - Story request ID
 * @param task - Task type
 * @param progress - Progress from 0 to 1
 * @param details - Additional details for i18n (e.g., {current: 4, total: 8})
 */
export async function updateTaskProgress(
  requestId: string,
  task: StoryTask,
  progress: number, // 0-1
  details?: Record<string, any>
): Promise<void> {
  const storyRepo = getStoryRepository();
  await storyRepo.transaction(async (tx) => {
    const request = await storyRepo.findRequestForUpdate(requestId, tx);
    if (!request) {
      throw new Error(`Story request not found: ${requestId}`);
    }
    
    // Get current progress
    const currentProgress = normalizeProgress(request.progressData as StoryProgress | null);
    
    // DEBUG LOG - Before update
    logger.debug({
      requestId,
      task,
      newProgress: Math.round(progress * 100),
      beforeUpdate: {
        activeTasks: currentProgress.activeTasks.map(t => ({ task: t.task, progress: t.progress })),
        completedTasks: currentProgress.completedTasks,
        overallProgress: currentProgress.overallProgress,
      }
    }, '[PROGRESS DEBUG] Before update');
    
    // Find or create active task
    let activeTask = currentProgress.activeTasks.find(t => t.task === task);
    
    if (!activeTask) {
      activeTask = { task, progress: 0 };
      currentProgress.activeTasks.push(activeTask);
    }

    const timelineEntry = getOrCreateTimelineEntry(currentProgress, task);
    
    // Update progress
    activeTask.progress = clampPercent(progress * 100);
    activeTask.details = details
      ? { ...activeTask.details, ...details }
      : activeTask.details;

    if (details?.startedAt && !timelineEntry.startedAt) {
      timelineEntry.startedAt = details.startedAt;
    }
    if (!timelineEntry.startedAt) {
      timelineEntry.startedAt = Date.now();
    }
    if (typeof details?.estimatedMs === 'number' && details.estimatedMs >= 0) {
      timelineEntry.estimatedMs = details.estimatedMs;
    } else if (!timelineEntry.estimatedMs) {
      timelineEntry.estimatedMs = getTaskDuration(task);
    }
    if (currentProgress.completedTasks.includes(task) && activeTask.progress < 100) {
      currentProgress.completedTasks = currentProgress.completedTasks.filter((completedTask) => completedTask !== task);
      timelineEntry.completedAt = undefined;
    }
    
    // If completed (100%), move to completed tasks
    if (activeTask.progress >= 100) {
      currentProgress.activeTasks = currentProgress.activeTasks.filter(t => t.task !== task);
      if (!currentProgress.completedTasks.includes(task)) {
        currentProgress.completedTasks.push(task);
      }
      timelineEntry.completedAt = Date.now();
    }
    
    const nextProgress = recalculateStoryProgress(currentProgress);
    
    // DEBUG LOG - After update
    logger.debug({
      requestId,
      task,
      afterUpdate: {
        activeTasks: nextProgress.activeTasks.map(t => ({ task: t.task, progress: t.progress })),
        completedTasks: nextProgress.completedTasks,
        overallProgress: nextProgress.overallProgress,
      }
    }, '[PROGRESS DEBUG] After update');
    
    // Save with atomic update
    await storyRepo.updateRequest(
      requestId,
      {
        progressData: nextProgress,
        progress: nextProgress.overallProgress,
        updatedAt: new Date(),
      },
      tx
    );
    
    logger.info(
      {
        requestId,
        task,
        taskProgress: activeTask.progress,
        overallProgress: nextProgress.overallProgress,
        activeTask: nextProgress.activeTasks.find((entry) => entry.task === task)
          ? {
              task,
              progress: nextProgress.activeTasks.find((entry) => entry.task === task)?.progress,
              details: nextProgress.activeTasks.find((entry) => entry.task === task)?.details,
            }
          : undefined,
        plannedTask: nextProgress.plannedTasks?.find((entry) => entry.task === task)
          ? {
              rangeStart: clampPercent(nextProgress.plannedTasks.find((entry) => entry.task === task)!.rangeStart),
              rangeEnd: clampPercent(nextProgress.plannedTasks.find((entry) => entry.task === task)!.rangeEnd),
              estimatedMs: nextProgress.plannedTasks.find((entry) => entry.task === task)!.estimatedMs,
            }
          : undefined,
        completedTasks: nextProgress.completedTasks,
      },
      'Task progress updated'
    );
    
    // Verify update by re-reading
    const updated = await storyRepo.findRequestForUpdate(requestId, tx);
    
    logger.debug(
      { requestId, dbProgress: updated?.progress, expectedProgress: nextProgress.overallProgress },
      'Progress verification'
    );
  });
}

/**
 * Helper to start a task (progress = 0)
 * @param details - Optional details including estimatedMs for time-based progress
 */
export async function startTask(requestId: string, task: StoryTask, details?: Record<string, any>): Promise<void> {
  // Add estimated duration if not provided
  const estimatedMs = details?.estimatedMs ?? TASK_ESTIMATED_DURATIONS[task] ?? 10000;
  
  const taskDetails = {
    ...details,
    estimatedMs,
    startedAt: Date.now(),
  };
  await updateTaskProgress(requestId, task, 0, taskDetails);
}

/**
 * Helper to complete a task (progress = 1)
 */
export async function completeTask(requestId: string, task: StoryTask): Promise<void> {
  await updateTaskProgress(requestId, task, 1);
}

/**
 * Atomically transition from one task to another without leaving an empty active task gap.
 */
export async function transitionTask(
  requestId: string,
  fromTask: StoryTask,
  toTask: StoryTask,
  details?: Record<string, any>,
): Promise<void> {
  const storyRepo = getStoryRepository();

  await storyRepo.transaction(async (tx) => {
    const request = await storyRepo.findRequestForUpdate(requestId, tx);
    if (!request) {
      throw new Error(`Story request not found: ${requestId}`);
    }

    const currentProgress = normalizeProgress(request.progressData as StoryProgress | null);
    const now = Date.now();

    currentProgress.activeTasks = currentProgress.activeTasks.filter((task) => task.task !== fromTask);
    if (!currentProgress.completedTasks.includes(fromTask)) {
      currentProgress.completedTasks.push(fromTask);
    }

    const fromTimelineEntry = getOrCreateTimelineEntry(currentProgress, fromTask);
    if (!fromTimelineEntry.startedAt) {
      fromTimelineEntry.startedAt = now;
    }
    if (!fromTimelineEntry.estimatedMs) {
      fromTimelineEntry.estimatedMs = getTaskDuration(fromTask);
    }
    fromTimelineEntry.completedAt = now;

    const estimatedMs = details?.estimatedMs ?? TASK_ESTIMATED_DURATIONS[toTask] ?? 10000;
    const nextTaskDetails = {
      ...details,
      estimatedMs,
      startedAt: now,
    };

    currentProgress.activeTasks = currentProgress.activeTasks.filter((task) => task.task !== toTask);
    currentProgress.activeTasks.push({
      task: toTask,
      progress: 0,
      details: nextTaskDetails,
    });
    currentProgress.completedTasks = currentProgress.completedTasks.filter((task) => task !== toTask);

    const toTimelineEntry = getOrCreateTimelineEntry(currentProgress, toTask);
    toTimelineEntry.startedAt = now;
    toTimelineEntry.completedAt = undefined;
    toTimelineEntry.estimatedMs = estimatedMs;

    const nextProgress = recalculateStoryProgress(currentProgress, now);

    await storyRepo.updateRequest(
      requestId,
      {
        progressData: nextProgress,
        progress: nextProgress.overallProgress,
        updatedAt: new Date(now),
      },
      tx,
    );

    logger.info(
      {
        requestId,
        fromTask,
        toTask,
        overallProgress: nextProgress.overallProgress,
        activeTasks: nextProgress.activeTasks.map((task) => task.task),
        completedTasks: nextProgress.completedTasks,
      },
      'Story progress task transitioned',
    );
  });
}

/**
 * Get current progress for a story request
 */
export async function getCurrentProgress(requestId: string): Promise<StoryProgress> {
  const storyRepo = getStoryRepository();
  const request = await storyRepo.findRequestById(requestId);
  if (!request) {
    throw new Error(`Story request not found: ${requestId}`);
  }
  
  // Initialize progress if not exists
  if (!request.progressData) {
    return createEmptyProgress();
  }
  
  return recalculateStoryProgress(request.progressData as StoryProgress);
}

/**
 * Save progress to database
 */
async function saveProgress(requestId: string, progress: StoryProgress): Promise<void> {
  const storyRepo = getStoryRepository();
  await storyRepo.updateRequest(requestId, {
    progressData: progress,
    progress: progress.overallProgress,
    updatedAt: new Date(),
  });
}

/**
 * Calculate overall progress based on elapsed time vs estimated duration.
 * Total time is fixed for the entire flow (all baseline tasks), preventing progress regression.
 */
export function calculateOverallProgress(
  completed: StoryTask[],
  active: ActiveTask[]
): number {
  // Determine all tasks that WILL execute in this flow
  // Instant mode: analyzing_photos, generating_text, producing_visuals?, validating, generating_images
  // Standard mode: generating_text, producing_visuals?, validating, generating_images
  
  const seenTasks = new Set<StoryTask>([...completed, ...active.map(t => t.task)]);
  
  // Detect flow type from seen tasks
  const isInstantMode = seenTasks.has(STORY_TASKS.ANALYZING_PHOTOS);
  
  // Baseline tasks for standard flow
  const baselineTasks: StoryTask[] = [
    STORY_TASKS.GENERATING_TEXT,
    STORY_TASKS.VALIDATING,
    STORY_TASKS.GENERATING_IMAGES,
  ];
  
  if (isInstantMode) {
    baselineTasks.unshift(STORY_TASKS.ANALYZING_PHOTOS);
  }

  if (seenTasks.has(STORY_TASKS.PRODUCING_VISUALS)) {
    baselineTasks.splice(isInstantMode ? 2 : 1, 0, STORY_TASKS.PRODUCING_VISUALS);
  }
  
  // Add optional tasks if they've appeared
  if (seenTasks.has(STORY_TASKS.GENERATING_PORTRAITS)) {
    baselineTasks.push(STORY_TASKS.GENERATING_PORTRAITS);
  }
  if (seenTasks.has(STORY_TASKS.GENERATING_AUDIO)) {
    baselineTasks.push(STORY_TASKS.GENERATING_AUDIO);
  }
  
  // Calculate total time from ALL baseline tasks (fixed denominator)
  let totalTime = 0;
  for (const task of baselineTasks) {
    // For active tasks, use actual estimatedMs from details
    const activeTask = active.find(t => t.task === task);
    const duration = activeTask?.details?.estimatedMs 
                  || TASK_ESTIMATED_DURATIONS[task] 
                  || 10000;
    totalTime += duration;
  }
  
  let achievedTime = 0;
  
  // Completed tasks: full duration
  for (const task of completed) {
    const duration = TASK_ESTIMATED_DURATIONS[task] ?? 10000;
    achievedTime += duration;
  }
  
  // Active tasks: time-based progress with cap
  for (const activeTask of active) {
    const details = activeTask.details;
    const duration = details?.estimatedMs 
                  || TASK_ESTIMATED_DURATIONS[activeTask.task] 
                  || 10000;
    
    if (details?.startedAt) {
      const elapsed = Date.now() - details.startedAt;
      const ratio = elapsed / duration;
      
      // Cap at 99% if elapsed exceeds estimated time
      let taskProgress: number;
      if (ratio <= 1) {
        taskProgress = 0.99 * ratio; // Linear to 99% at estimated time
      } else {
        // After estimated time: cap at 99%
        taskProgress = 0.99;
      }
      
      achievedTime += duration * taskProgress;
    } else {
      // Fallback: use manual progress if no timing data
      achievedTime += duration * (activeTask.progress / 100);
    }
  }
  
  if (totalTime === 0) return 0;
  
  const percentage = Math.round((achievedTime / totalTime) * 100);
  
  // Cap at 99% - only completeTask can set to 100%
  return Math.min(percentage, 99);
}

/**
 * Reset progress for a story request (useful for retries)
 */
export async function resetProgress(requestId: string): Promise<void> {
  await saveProgress(requestId, createEmptyProgress());
}
