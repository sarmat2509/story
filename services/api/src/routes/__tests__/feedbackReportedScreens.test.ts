import assert from 'node:assert/strict';
import {
  FEEDBACK_TOPICS,
  getFeedbackCategoryForTopic,
} from '@wondertales/shared';
import { REPORTED_SCREENS } from '../feedback';

assert.ok(
  REPORTED_SCREENS.includes('published_story'),
  'feedback API should accept public story reports'
);

for (const topic of [
  'billing',
  'refund',
  'unsafe_content',
  'generation_failed',
  'account_privacy',
] as const) {
  assert.ok(FEEDBACK_TOPICS.includes(topic), `feedback should accept ${topic} support topic`);
}

assert.equal(getFeedbackCategoryForTopic('billing'), 'other');
assert.equal(getFeedbackCategoryForTopic('refund'), 'other');
assert.equal(getFeedbackCategoryForTopic('account_privacy'), 'other');
assert.equal(getFeedbackCategoryForTopic('unsafe_content'), 'bug');
assert.equal(getFeedbackCategoryForTopic('generation_failed'), 'bug');

console.log('feedbackReportedScreens and support topic tests passed');
