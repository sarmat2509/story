import assert from 'node:assert';
import type { StoryQuizPayloadApi } from '@wondertales/shared';
import {
  StoryQuizAnswerValidationError,
  isCheckRewardComplete,
  mergeStoryQuizAnswer,
  normalizeStoryQuizAnswer,
} from '../progress';

const payload: StoryQuizPayloadApi = {
  title: 'Quiz',
  language: 'en',
  sourceAgeGroup: '6-8',
  quizAgeBucket: '6-8',
  sections: [
    { rubric: 'check_reward', title: 'Check', activityIds: ['check_1', 'check_2'] },
    { rubric: 'think_talk', title: 'Talk', activityIds: ['talk_1'] },
  ],
  activities: [
    {
      id: 'check_1',
      rubric: 'check_reward',
      kind: 'choose_object',
      interactionType: 'single_choice',
      resultKind: 'objective',
      deliveryMode: 'self_read',
      question: 'What was found?',
      options: [
        { id: 'stone', label: 'Stone' },
        { id: 'key', label: 'Key' },
      ],
      correctOptionId: 'stone',
    },
    {
      id: 'check_2',
      rubric: 'check_reward',
      kind: 'sequence_three_events',
      interactionType: 'sequence_order',
      resultKind: 'objective',
      deliveryMode: 'self_read',
      question: 'What came first?',
      options: [
        { id: 'first', label: 'First' },
        { id: 'second', label: 'Second' },
      ],
      preferredOrderIds: ['first', 'second'],
    },
    {
      id: 'talk_1',
      rubric: 'think_talk',
      kind: 'what_if',
      interactionType: 'single_choice',
      resultKind: 'reflective',
      deliveryMode: 'self_read',
      question: 'What would you do?',
      options: [
        { id: 'ask', label: 'Ask for help' },
        { id: 'try', label: 'Try again' },
      ],
    },
  ],
  reward: {
    label: 'Prize',
    unlockPolicy: 'complete_check_reward',
    bonusRules: ['all_check_completed'],
  },
  createdAt: '2026-06-22T00:00:00.000Z',
};

const answeredAt = new Date('2026-06-22T12:00:00.000Z');

assert.equal(
  normalizeStoryQuizAnswer(payload, 'check_1', { selectedIds: ['stone'] }, answeredAt)?.result,
  'correct',
  'server marks objective answer correct from payload key'
);

assert.equal(
  normalizeStoryQuizAnswer(payload, 'check_1', { selectedIds: ['key'] }, answeredAt)?.result,
  'retry',
  'server marks objective answer retry from payload key'
);

assert.equal(
  normalizeStoryQuizAnswer(payload, 'talk_1', { selectedIds: ['ask'] }, answeredAt)?.result,
  'reflective',
  'think_talk answer is saved as reflective, not correct'
);

assert.throws(
  () => normalizeStoryQuizAnswer(payload, 'check_1', { selectedIds: ['unknown'] }, answeredAt),
  StoryQuizAnswerValidationError,
  'unknown option ids are rejected'
);

let answers = mergeStoryQuizAnswer(payload, {}, 'check_1', { selectedIds: ['stone'] }, answeredAt);
answers = mergeStoryQuizAnswer(
  payload,
  answers,
  'check_2',
  { selectedIds: ['first', 'second'] },
  answeredAt
);
assert.equal(
  isCheckRewardComplete(payload, answers),
  true,
  'all correct check_reward answers complete the reward section'
);

answers = mergeStoryQuizAnswer(payload, answers, 'check_1', { selectedIds: [] }, answeredAt);
assert.equal(answers.check_1, undefined, 'empty answer clears saved activity progress');
assert.equal(
  isCheckRewardComplete(payload, answers),
  false,
  'clearing one answer removes check_reward completion'
);

console.log('storyQuizProgress tests passed');
