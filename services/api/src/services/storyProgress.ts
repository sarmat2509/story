import { getStoryRepository } from '../repositories';
import { logger } from '../utils/logger';

/**
 * Story tasks that can run in parallel
 */
export const STORY_TASKS = {
  GENERATING_TEXT: 'generating_text',
  VALIDATING: 'validating',
  GENERATING_PORTRAITS: 'generating_portraits',
  GENERATING_IMAGES: 'generating_images',
  GENERATING_AUDIO: 'generating_audio',
} as const;

export type StoryTask = typeof STORY_TASKS[keyof typeof STORY_TASKS];

/**
 * Weights for calculating overall progress
 * Text: 30%, Validation: 20%, Images: 50%
 * Audio and portraits are excluded — audio runs as a separate user-triggered flow,
 * portraits were removed in favor of scene-to-scene reference propagation.
 */
const TASK_WEIGHTS: Partial<Record<StoryTask, number>> = {
  [STORY_TASKS.GENERATING_TEXT]: 30,
  [STORY_TASKS.VALIDATING]: 20,
  [STORY_TASKS.GENERATING_IMAGES]: 50,
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
  const taskDetails = {
    ...details,
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
 * Calculate overall progress based on completed and active tasks
 */
function calculateOverallProgress(
  completed: StoryTask[],
  active: ActiveTask[]
): number {
  let totalWeight = 0;
  let achievedWeight = 0;
  
  // Completed tasks contribute full weight
  for (const task of completed) {
    const weight = TASK_WEIGHTS[task] ?? 0;
    totalWeight += weight;
    achievedWeight += weight;
  }
  
  // Active tasks contribute partial weight based on progress
  for (const activeTask of active) {
    const weight = TASK_WEIGHTS[activeTask.task] ?? 0;
    totalWeight += weight;
    achievedWeight += weight * (activeTask.progress / 100);
  }
  
  // If no tasks, return 0
  if (totalWeight === 0) {
    return 0;
  }
  
  return Math.round((achievedWeight / totalWeight) * 100);
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
