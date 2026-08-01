import assert from 'node:assert/strict';
import { StoryScheduleRuleSchema } from '../../../../../packages/shared/src/schemas';

const childIds = Array.from(
  { length: 6 },
  (_, index) => `d0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
);
const input = {
  childProfileIds: childIds,
  cadence: 'twice_weekly',
  runAtTime: '23:59',
  timezone: 'Europe/Madrid',
  formats: ['story', 'comic', 'mixed'],
  themes: ['__free__', 'forest', 'space'],
  morals: ['__free__', 'kindness', 'bravery'],
  languages: ['uk', 'en'],
  imageStyles: ['soft_watercolor', 'colored_pencil'],
  userNotes: null,
};

assert.deepEqual(StoryScheduleRuleSchema.parse(input), input);
assert.equal(
  StoryScheduleRuleSchema.safeParse({ ...input, runAtTime: '24:00' }).success,
  false,
  'the API accepts only 24-hour local time'
);
assert.equal(
  StoryScheduleRuleSchema.safeParse({ ...input, timezone: 'Moon/Base' }).success,
  false,
  'the API rejects an invalid IANA timezone'
);
assert.equal(
  StoryScheduleRuleSchema.safeParse({ ...input, themes: [] }).success,
  false,
  'at least one theme remains required, including the free-theme sentinel'
);

console.log('story schedule schema tests passed');
