import { getStoryRepository } from '../repositories';
import { logger } from '../utils/logger';

/**
 * Story tasks that can run in parallel
 */
export const STORY_TASKS = {
  ANALYZING_PHOTOS: 'analyzing_photos', // Photo analysis for instant mode
  GENERATING_TEXT: 'generating_text',
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

export interface StoryProgress {
  overallProgress: number; // 0-100
  activeTasks: ActiveTask[];
  completedTasks: StoryTask[];
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
    const currentProgress: StoryProgress = request.progressData as StoryProgress || {
      overallProgress: 0,
      activeTasks: [],
      completedTasks: [],
    };
    
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
    
    // Update progress
    activeTask.progress = Math.round(progress * 100);
    activeTask.details = details
      ? { ...activeTask.details, ...details }
      : activeTask.details;
    
    // If completed (100%), move to completed tasks
    if (activeTask.progress >= 100) {
      currentProgress.activeTasks = currentProgress.activeTasks.filter(t => t.task !== task);
      if (!currentProgress.completedTasks.includes(task)) {
        currentProgress.completedTasks.push(task);
      }
    }
    
    // Calculate overall progress
    const overallProgress = calculateOverallProgress(
      currentProgress.completedTasks,
      currentProgress.activeTasks
    );
    
    // Update overall progress in the object
    currentProgress.overallProgress = overallProgress;
    
    // DEBUG LOG - After update
    logger.debug({
      requestId,
      task,
      afterUpdate: {
        activeTasks: currentProgress.activeTasks.map(t => ({ task: t.task, progress: t.progress })),
        completedTasks: currentProgress.completedTasks,
        overallProgress: currentProgress.overallProgress,
      }
    }, '[PROGRESS DEBUG] After update');
    
    // Save with atomic update
    await storyRepo.updateRequest(
      requestId,
      {
        progressData: currentProgress,
        progress: overallProgress,
        updatedAt: new Date(),
      },
      tx
    );
    
    logger.info(
      { requestId, task, progress: activeTask.progress, overallProgress },
      'Task progress updated'
    );
    
    // Verify update by re-reading
    const updated = await storyRepo.findRequestForUpdate(requestId, tx);
    
    logger.debug(
      { requestId, dbProgress: updated?.progress, expectedProgress: overallProgress },
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
  const estimatedMs = details?.estimatedMs || TASK_ESTIMATED_DURATIONS[task] || 10000;
  
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
    return {
      overallProgress: 0,
      activeTasks: [],
      completedTasks: [],
    };
  }
  
  return request.progressData as StoryProgress;
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
  // Instant mode: analyzing_photos, generating_text, validating, generating_images
  // Standard mode: generating_text, validating, generating_images
  
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
  await saveProgress(requestId, {
    overallProgress: 0,
    activeTasks: [],
    completedTasks: [],
  });
}
