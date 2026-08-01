/** Family story scheduler. Preparation is deliberately ahead of target time:
 * text/director work is realtime, environments wait for Gemini Batch, then the
 * normal Seedream reference pipeline takes over. */
import {
  getCharacterRepository,
  getChildProfileRepository,
  getStoryRepository,
} from '../repositories';
import { createStoryRequest } from '../services/storyOrchestrationService';
import {
  isStoryQuotaError,
  releaseStoryQuotaReservationForRequest,
} from '../services/storyQuotaService';
import { getOpsRuntimeStatus } from '../services/opsRuntimeService';
import { textQueue } from './storyJobProcessor';
import { logger } from '../utils/logger';

const DAYS: Record<string, number> = { daily: 1, every_2_days: 2, twice_weekly: 3, weekly: 7 };
const PREPARE_LEAD_MS =
  Number(process.env.STORY_SCHEDULE_PREPARE_LEAD_HOURS || 24) * 60 * 60 * 1000;
const FREE_THEME = '__free__';
const FREE_MORAL = '__free__';
let timer: NodeJS.Timeout | null = null;

const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
function takeRandom<T>(items: T[], limit: number): T[] {
  return [...items].sort(() => Math.random() - 0.5).slice(0, Math.min(limit, items.length));
}
function zonedTarget(
  year: number,
  month: number,
  day: number,
  runAtTime: string,
  timeZone: string
): Date {
  const [hour, minute] = runAtTime.split(':').map(Number);
  const guessed = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(guessed);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const observed = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute')
  );
  return new Date(guessed - (observed - guessed));
}
export function nextScheduledTarget(
  from: Date,
  cadence: string,
  runAtTime: string,
  timezone: string
): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(from);
  const p = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const day = new Date(Date.UTC(p('year'), p('month') - 1, p('day') + (DAYS[cadence] ?? 1)));
  return zonedTarget(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    runAtTime,
    timezone
  );
}

export async function runScheduledStoryScheduler(): Promise<void> {
  if ((await getOpsRuntimeStatus()).active) return;
  const repo = getStoryRepository();
  const due = await repo.findDueStoryScheduleRules(new Date());
  for (const rule of due) {
    // Move first: a second worker tick cannot fan out the same rule twice.
    const target = nextScheduledTarget(
      rule.targetRunAt,
      rule.cadence,
      rule.runAtTime,
      rule.timezone
    );
    await repo.updateStoryScheduleRuleRunTimes(
      rule.id,
      target,
      new Date(target.getTime() - PREPARE_LEAD_MS)
    );
    const profiles = await getChildProfileRepository().findByIds(rule.userId, rule.childProfileIds);
    for (const profile of profiles) {
      let requestId: string | undefined;
      try {
        const characters = await getCharacterRepository().findByUserId(rule.userId, undefined, {
          childProfileId: profile.id,
        });
        const format = pick(rule.formats as Array<'story' | 'comic' | 'mixed'>);
        const scenarioCardId = pick(rule.themes as string[]);
        const goal = pick(rule.morals as string[]);
        requestId = await createStoryRequest(
          rule.userId,
          {
            childProfileId: profile.id,
            uiLocale: pick(rule.languages as any),
            storyLanguage: pick(rule.languages as any),
            goal: goal === FREE_MORAL ? undefined : goal,
            scenarioCardId: scenarioCardId === FREE_THEME ? undefined : scenarioCardId,
            imageStyle: pick(rule.imageStyles as any),
            userNotes: rule.userNotes ?? undefined,
            selectedCharacters: takeRandom(
              characters.map((character) => character.id),
              3
            ),
          },
          { quotaSource: 'scheduled_story' }
        );
        await repo.updateRequest(requestId, {
          intermediateData: {
            isScheduledStory: true,
            scheduleRuleId: rule.id,
            targetRunAt: rule.targetRunAt.toISOString(),
            generationKind:
              format === 'comic' ? 'graphic_novel' : format === 'mixed' ? 'mixed_story' : undefined,
          } as any,
        });
        await textQueue.addJob({ type: 'text_generation', requestId });
      } catch (err) {
        if (requestId)
          await releaseStoryQuotaReservationForRequest(requestId, {
            reason: 'queue_enqueue_failed',
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        if (isStoryQuotaError(err))
          logger.info(
            { ruleId: rule.id, childProfileId: profile.id },
            'Scheduled story skipped: quota unavailable for child'
          );
        else
          logger.error(
            { err, ruleId: rule.id, childProfileId: profile.id },
            'Scheduled story creation failed'
          );
      }
    }
  }
}
export function startScheduledStoryScheduler(): void {
  if (timer) clearInterval(timer);
  timer = setInterval(
    () =>
      runScheduledStoryScheduler().catch((err) =>
        logger.error({ err }, 'Scheduled story scheduler error')
      ),
    60 * 1000
  );
  void runScheduledStoryScheduler();
}
