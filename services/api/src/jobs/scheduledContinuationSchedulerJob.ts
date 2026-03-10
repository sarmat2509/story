/**
 * Scheduled Continuation Scheduler Job
 * Cron (hourly): find due schedules, check quota, create continuation requests, update next_run_at.
 */

import { logger } from '../utils/logger';
import { getStoryRepository } from '../repositories';
import { createContinuationRequest } from '../services/storyOrchestrationService';
import { getOrCreateSeries } from '../services/seriesService';
import { checkUsageLimit } from '../services/planService';
import { textQueue } from './storyJobProcessor';

const CADENCE_DAYS: Record<string, number> = {
  daily: 1,
  every_2_days: 2,
  twice_weekly: 3,
  weekly: 7,
};

let schedulerIntervalId: NodeJS.Timeout | null = null;

export async function runScheduledContinuationScheduler(): Promise<void> {
  const now = new Date();
  const due = await getStoryRepository().findDueSeriesSchedules(now);

  if (due.length === 0) {
    return;
  }

  logger.info({ count: due.length }, 'Scheduled continuation scheduler: processing due schedules');

  for (const schedule of due) {
    try {
      const { allowed } = await checkUsageLimit(schedule.userId, 'stories_per_month', 1);
      if (!allowed) {
        logger.warn({ scheduleId: schedule.id, userId: schedule.userId }, 'Quota exceeded, skipping schedule');
        continue;
      }

      const series = await getStoryRepository().findSeriesById(schedule.seriesId);
      if (!series || !series.storyIds?.length) {
        logger.warn({ scheduleId: schedule.id, seriesId: schedule.seriesId }, 'Series not found or empty');
        continue;
      }

      const lastStoryId = series.storyIds[series.storyIds.length - 1] as string;
      const story = await getStoryRepository().findById(lastStoryId);
      if (!story) {
        logger.warn({ scheduleId: schedule.id, lastStoryId }, 'Last story not found');
        continue;
      }

      const { seriesId, partNumber, continuationContext } = await getOrCreateSeries(lastStoryId);

      const originalRequest = story.storyRequestId
        ? await getStoryRepository().findRequestById(story.storyRequestId)
        : null;

      const requestId = await createContinuationRequest(schedule.userId, {
        language: story.language,
        ageGroup: story.ageGroup,
        childProfileId: story.childProfileId,
        imageStyle: (story.metadata as any)?.imageStyle || 'watercolor',
        moralTheme: story.moralTheme,
        scenarioCardId: originalRequest?.scenarioCardId || null,
        selectedCharacters: originalRequest?.selectedCharacters || null,
        selectedChildren: originalRequest?.selectedChildren || null,
        userNotes: originalRequest?.userNotes || null,
        seriesId,
        partNumber: partNumber + 1,
        continuationContext,
        isScheduledContinuation: true,
        scheduleId: schedule.id,
      });

      textQueue.addJob({
        type: 'text_generation',
        requestId,
        isContinuation: true,
      });

      const days = CADENCE_DAYS[schedule.cadence] ?? 1;
      const nextRun = new Date(schedule.nextRunAt);
      nextRun.setDate(nextRun.getDate() + days);

      await getStoryRepository().updateScheduleNextRunAt(schedule.id, nextRun);

      logger.info({ scheduleId: schedule.id, requestId, nextRun: nextRun.toISOString() }, 'Scheduled continuation created');
    } catch (err) {
      logger.error({ err, scheduleId: schedule.id }, 'Failed to create scheduled continuation');
    }
  }
}

export function startScheduledContinuationScheduler(): void {
  if (schedulerIntervalId) clearInterval(schedulerIntervalId);
  schedulerIntervalId = setInterval(
    () => runScheduledContinuationScheduler().catch((err) => logger.error({ err }, 'Scheduled continuation scheduler error')),
    60 * 60 * 1000
  );
  logger.info('Scheduled continuation scheduler started (hourly)');
}

export function stopScheduledContinuationScheduler(): void {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
  }
  logger.info('Scheduled continuation scheduler stopped');
}
