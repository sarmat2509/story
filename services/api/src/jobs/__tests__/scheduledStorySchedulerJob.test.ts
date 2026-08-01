import assert from 'node:assert/strict';

const userId = 'a1000000-0000-4000-8000-000000000001';
const ruleId = 'a2000000-0000-4000-8000-000000000001';
const profileOne = 'a3000000-0000-4000-8000-000000000001';
const profileTwo = 'a3000000-0000-4000-8000-000000000002';
const profileThree = 'a3000000-0000-4000-8000-000000000003';

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.STORY_SCHEDULE_PREPARE_LEAD_HOURS = '24';

  const {
    nextScheduledTarget,
    runScheduledStorySchedulerCore,
  } = await import('../scheduledStorySchedulerJob');

  // The selected local wall time stays stable across the Europe/Madrid DST jump.
  assert.equal(
    nextScheduledTarget(
      new Date('2026-03-28T18:00:00.000Z'),
      'daily',
      '09:15',
      'Europe/Madrid'
    ).toISOString(),
    '2026-03-29T07:15:00.000Z'
  );
  assert.equal(
    nextScheduledTarget(
      new Date('2026-01-05T08:00:00.000Z'),
      'weekly',
      '09:15',
      'Europe/Madrid'
    ).toISOString(),
    '2026-01-12T08:15:00.000Z'
  );

  const dueRule = {
    id: ruleId,
    userId,
    childProfileIds: [profileOne, profileTwo, profileThree],
    cadence: 'every_2_days',
    runAtTime: '18:00',
    timezone: 'Europe/Madrid',
    formats: ['mixed'],
    themes: ['forest'],
    morals: ['kindness'],
    languages: ['uk'],
    imageStyles: ['soft_watercolor'],
    userNotes: 'Keep it cozy',
    targetRunAt: new Date('2026-01-05T17:00:00.000Z'),
    prepareRunAt: new Date('2026-01-04T17:00:00.000Z'),
  } as any;
  const events: string[] = [];
  const created: Array<{ profileId: string; input: any; options: any }> = [];
  const requestPatches: Array<{ requestId: string; patch: any }> = [];
  const queued: any[] = [];
  const released: any[] = [];
  const quotaError = new Error('quota unavailable');
  let requestNumber = 0;
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    await runScheduledStorySchedulerCore({
      getOpsRuntimeStatus: async () => ({ active: false }) as any,
      getStoryRepository: () =>
        ({
          findDueStoryScheduleRules: async () => [dueRule],
          updateStoryScheduleRuleRunTimes: async (_id: string, target: Date, prepare: Date) => {
            events.push('rule:advanced');
            assert.equal(target.toISOString(), '2026-01-07T17:00:00.000Z');
            assert.equal(prepare.toISOString(), '2026-01-06T17:00:00.000Z');
          },
          updateRequest: async (requestId: string, patch: any) => {
            requestPatches.push({ requestId, patch });
          },
        }) as any,
      getChildProfileRepository: () =>
        ({
          findByIds: async () => [
            { id: profileOne },
            { id: profileTwo },
            { id: profileThree },
          ],
        }) as any,
      getCharacterRepository: () =>
        ({
          findByUserId: async (_userId: string, _unused: unknown, options: any) => {
            events.push(`characters:${options.childProfileId}`);
            return [
              { id: 'b3000000-0000-4000-8000-000000000001' },
              { id: 'b3000000-0000-4000-8000-000000000002' },
              { id: 'b3000000-0000-4000-8000-000000000003' },
              { id: 'b3000000-0000-4000-8000-000000000004' },
            ];
          },
        }) as any,
      createStoryRequest: async (_userId: string, input: any, options: any) => {
        if (input.childProfileId === profileOne) throw quotaError;
        requestNumber += 1;
        created.push({ profileId: input.childProfileId, input, options });
        return `request-${requestNumber}`;
      },
      releaseStoryQuotaReservationForRequest: async (requestId: string, details: any) => {
        released.push({ requestId, details });
      },
      isStoryQuotaError: (error: unknown) => error === quotaError,
      enqueueTextJob: async (job: any) => {
        queued.push(job);
        if (job.requestId === 'request-2') throw new Error('queue unavailable');
        return 'text-job';
      },
    } as any);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(events[0], 'rule:advanced', 'rule must advance before child fan-out');
  assert.deepEqual(
    created.map((entry) => entry.profileId),
    [profileTwo, profileThree],
    'a quota failure for one child must not block the other profiles'
  );
  assert.ok(
    created.every(({ input }) => input.selectedCharacters.length === 3),
    'each child receives no more than three available characters'
  );
  assert.ok(
    created.every(({ input }) => new Set(input.selectedCharacters).size === input.selectedCharacters.length),
    'characters are not repeated within a scheduled story'
  );
  assert.ok(created.every(({ options }) => options.quotaSource === 'scheduled_story'));
  assert.ok(
    requestPatches.every(({ patch }) => patch.intermediateData.generationKind === 'mixed_story'),
    'mixed schedules continue into the existing graphic-novel image worker'
  );
  assert.deepEqual(queued, [
    { type: 'text_generation', requestId: 'request-1' },
    { type: 'text_generation', requestId: 'request-2' },
  ]);
  assert.deepEqual(released, [
    {
      requestId: 'request-2',
      details: { reason: 'queue_enqueue_failed', errorMessage: 'queue unavailable' },
    },
  ]);

  console.log('scheduled story scheduler tests passed');
}

void main();
