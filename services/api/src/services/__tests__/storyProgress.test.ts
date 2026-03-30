import assert from 'node:assert/strict';
import {
  STORY_TASKS,
  recalculateStoryProgress,
  type StoryProgress,
} from '../storyProgress';

function createProgress(progress: Partial<StoryProgress>): StoryProgress {
  return {
    overallProgress: 0,
    activeTasks: [],
    completedTasks: [],
    plannedTasks: [],
    taskTimeline: {},
    maxOverallProgress: 0,
    ...progress,
  };
}

function testStageCapAtRangeBoundary(): void {
  const now = 60_000;
  const progress = createProgress({
    activeTasks: [{ task: STORY_TASKS.GENERATING_TEXT, progress: 0 }],
    plannedTasks: [
      { task: STORY_TASKS.GENERATING_TEXT, estimatedMs: 30_000, rangeStart: 0, rangeEnd: 50 },
      { task: STORY_TASKS.VALIDATING, estimatedMs: 30_000, rangeStart: 50, rangeEnd: 100 },
    ],
    taskTimeline: {
      [STORY_TASKS.GENERATING_TEXT]: { startedAt: 20_000, estimatedMs: 30_000 },
    },
  });

  const recalculated = recalculateStoryProgress(progress, now);
  assert.equal(recalculated.overallProgress, 50);
}

function testNextStageStartsFromPreviousCap(): void {
  const now = 61_000;
  const progress = createProgress({
    completedTasks: [STORY_TASKS.GENERATING_TEXT],
    activeTasks: [{ task: STORY_TASKS.VALIDATING, progress: 0 }],
    plannedTasks: [
      { task: STORY_TASKS.GENERATING_TEXT, estimatedMs: 30_000, rangeStart: 0, rangeEnd: 50 },
      { task: STORY_TASKS.VALIDATING, estimatedMs: 30_000, rangeStart: 50, rangeEnd: 100 },
    ],
    taskTimeline: {
      [STORY_TASKS.GENERATING_TEXT]: { startedAt: 0, completedAt: 40_000, estimatedMs: 30_000 },
      [STORY_TASKS.VALIDATING]: { startedAt: 40_000, estimatedMs: 30_000 },
    },
    maxOverallProgress: 50,
  });

  const recalculated = recalculateStoryProgress(progress, now);
  assert.ok(recalculated.overallProgress >= 50);
}

function testImageStageCannotPullProgressBackward(): void {
  const progress = createProgress({
    completedTasks: [STORY_TASKS.GENERATING_TEXT, STORY_TASKS.VALIDATING],
    activeTasks: [{ task: STORY_TASKS.GENERATING_IMAGES, progress: 0 }],
    plannedTasks: [
      { task: STORY_TASKS.GENERATING_TEXT, estimatedMs: 30_000, rangeStart: 0, rangeEnd: 50 },
      { task: STORY_TASKS.VALIDATING, estimatedMs: 10_000, rangeStart: 50, rangeEnd: 66.6667 },
      { task: STORY_TASKS.GENERATING_IMAGES, estimatedMs: 20_000, rangeStart: 66.6667, rangeEnd: 100 },
    ],
    taskTimeline: {
      [STORY_TASKS.GENERATING_TEXT]: { startedAt: 0, completedAt: 20_000, estimatedMs: 30_000 },
      [STORY_TASKS.VALIDATING]: { startedAt: 20_000, completedAt: 35_000, estimatedMs: 10_000 },
      [STORY_TASKS.GENERATING_IMAGES]: { startedAt: 35_000, estimatedMs: 20_000 },
    },
    maxOverallProgress: 72,
  });

  const recalculated = recalculateStoryProgress(progress, 36_000);
  assert.equal(recalculated.overallProgress, 72);
}

function testInstantFlowIncludesPhotoAnalysisSegment(): void {
  const now = 45_000;
  const progress = createProgress({
    activeTasks: [{ task: STORY_TASKS.ANALYZING_PHOTOS, progress: 0 }],
    plannedTasks: [
      { task: STORY_TASKS.ANALYZING_PHOTOS, estimatedMs: 45_000, rangeStart: 0, rangeEnd: 30 },
      { task: STORY_TASKS.GENERATING_TEXT, estimatedMs: 45_000, rangeStart: 30, rangeEnd: 60 },
      { task: STORY_TASKS.VALIDATING, estimatedMs: 15_000, rangeStart: 60, rangeEnd: 70 },
      { task: STORY_TASKS.GENERATING_IMAGES, estimatedMs: 45_000, rangeStart: 70, rangeEnd: 100 },
    ],
    taskTimeline: {
      [STORY_TASKS.ANALYZING_PHOTOS]: { startedAt: 0, estimatedMs: 45_000 },
    },
  });

  const recalculated = recalculateStoryProgress(progress, now);
  assert.equal(recalculated.overallProgress, 30);
}

function testExplicitProgressDoesNotJumpPastTimeBasedStagePosition(): void {
  const progress = createProgress({
    completedTasks: [STORY_TASKS.GENERATING_TEXT, STORY_TASKS.PRODUCING_VISUALS, STORY_TASKS.VALIDATING],
    activeTasks: [{ task: STORY_TASKS.GENERATING_IMAGES, progress: 50 }],
    plannedTasks: [
      { task: STORY_TASKS.GENERATING_TEXT, estimatedMs: 30_000, rangeStart: 0, rangeEnd: 27 },
      { task: STORY_TASKS.PRODUCING_VISUALS, estimatedMs: 12_000, rangeStart: 27, rangeEnd: 31 },
      { task: STORY_TASKS.VALIDATING, estimatedMs: 47_000, rangeStart: 31, rangeEnd: 76 },
      { task: STORY_TASKS.GENERATING_IMAGES, estimatedMs: 132_000, rangeStart: 76, rangeEnd: 100 },
    ],
    taskTimeline: {
      [STORY_TASKS.GENERATING_TEXT]: { startedAt: 0, completedAt: 30_000, estimatedMs: 30_000 },
      [STORY_TASKS.PRODUCING_VISUALS]: { startedAt: 30_000, completedAt: 42_000, estimatedMs: 12_000 },
      [STORY_TASKS.VALIDATING]: { startedAt: 42_000, completedAt: 89_000, estimatedMs: 47_000 },
      [STORY_TASKS.GENERATING_IMAGES]: { startedAt: 89_000, estimatedMs: 132_000 },
    },
    maxOverallProgress: 76,
  });

  const recalculated = recalculateStoryProgress(progress, 147_000);

  assert.equal(recalculated.overallProgress, 87);
  assert.equal(recalculated.activeTasks[0]?.progress, 87);
}

export async function runStoryProgressTests(): Promise<void> {
  testStageCapAtRangeBoundary();
  testNextStageStartsFromPreviousCap();
  testImageStageCannotPullProgressBackward();
  testInstantFlowIncludesPhotoAnalysisSegment();
  testExplicitProgressDoesNotJumpPastTimeBasedStagePosition();
}

if (require.main === module) {
  runStoryProgressTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
