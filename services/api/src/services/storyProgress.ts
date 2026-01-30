import { db } from '../db';
import { storyRequests } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

/**
 * Story tasks that can run in parallel
 */
export const STORY_TASKS = {
  GENERATING_OUTLINE: 'generating_outline',
  GENERATING_TEXT: 'generating_text',
  VALIDATING: 'validating',
  GENERATING_PORTRAITS: 'generating_portraits',
  GENERATING_IMAGES: 'generating_images',
  GENERATING_AUDIO: 'generating_audio',
} as const;

export type StoryTask = typeof STORY_TASKS[keyof typeof STORY_TASKS];

/**
 * Weights for calculating overall progress
 */
const TASK_WEIGHTS: Record<StoryTask, number> = {
  [STORY_TASKS.GENERATING_OUTLINE]: 10,
  [STORY_TASKS.GENERATING_TEXT]: 20,
  [STORY_TASKS.VALIDATING]: 5,
  [STORY_TASKS.GENERATING_PORTRAITS]: 5,
  [STORY_TASKS.GENERATING_IMAGES]: 40,
  [STORY_TASKS.GENERATING_AUDIO]: 20,
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
  // Use transaction to prevent race conditions
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(storyRequests)
      .where(eq(storyRequests.id, requestId))
      .limit(1)
      .for('update'); // Row-level lock
    
    if (!request) {
      throw new Error(`Story request not found: ${requestId}`);
    }
    
    // Get current progress
    const currentProgress: StoryProgress = request.progressData as StoryProgress || {
      overallProgress: 0,
      activeTasks: [],
      completedTasks: [],
    };
    
    // Find or create active task
    let activeTask = currentProgress.activeTasks.find(t => t.task === task);
    
    if (!activeTask) {
      activeTask = { task, progress: 0 };
      currentProgress.activeTasks.push(activeTask);
    }
    
    // Update progress
    activeTask.progress = Math.round(progress * 100);
    activeTask.details = details;
    
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
    
    // Save with atomic update
    await tx
      .update(storyRequests)
      .set({
        progressData: currentProgress,
        progress: overallProgress,
        updatedAt: new Date(),
      })
      .where(eq(storyRequests.id, requestId));
    
    logger.info(
      { requestId, task, progress: activeTask.progress, overallProgress },
      'Task progress updated'
    );
    
    // Verify update by re-reading
    const [updated] = await tx
      .select()
      .from(storyRequests)
      .where(eq(storyRequests.id, requestId))
      .limit(1);
    
    logger.debug(
      { requestId, dbProgress: updated?.progress, expectedProgress: overallProgress },
      'Progress verification'
    );
  });
}

/**
 * Helper to start a task (progress = 0)
 */
export async function startTask(requestId: string, task: StoryTask): Promise<void> {
  await updateTaskProgress(requestId, task, 0);
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
  const [request] = await db
    .select()
    .from(storyRequests)
    .where(eq(storyRequests.id, requestId))
    .limit(1);
  
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
  await db
    .update(storyRequests)
    .set({
      progressData: progress,
      progress: progress.overallProgress,
      updatedAt: new Date(),
    })
    .where(eq(storyRequests.id, requestId));
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
    const weight = TASK_WEIGHTS[task];
    totalWeight += weight;
    achievedWeight += weight;
  }
  
  // Active tasks contribute partial weight based on progress
  for (const activeTask of active) {
    const weight = TASK_WEIGHTS[activeTask.task];
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
