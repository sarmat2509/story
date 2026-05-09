import assert from 'node:assert/strict';
import {
  FEEDBACK_TOPICS,
  getFeedbackCategoryForTopic,
  isContentReportTopic,
} from '@wondertales/shared';
import { REPORTED_SCREENS, isFeedbackTopicAllowedForSession } from '../feedback';

assert.ok(
  REPORTED_SCREENS.includes('published_story'),
  'feedback API should accept public story reports'
);

for (const topic of [
  'billing',
  'refund',
  'unsafe_content',
  'unsafe_image',
  'unsafe_text',
  'privacy_concern',
  'generation_failed',
  'account_privacy',
] as const) {
  assert.ok(FEEDBACK_TOPICS.includes(topic), `feedback should accept ${topic} support topic`);
}

assert.equal(getFeedbackCategoryForTopic('billing'), 'other');
assert.equal(getFeedbackCategoryForTopic('refund'), 'other');
assert.equal(getFeedbackCategoryForTopic('account_privacy'), 'other');
assert.equal(getFeedbackCategoryForTopic('privacy_concern'), 'other');
assert.equal(getFeedbackCategoryForTopic('unsafe_content'), 'bug');
assert.equal(getFeedbackCategoryForTopic('unsafe_image'), 'bug');
assert.equal(getFeedbackCategoryForTopic('unsafe_text'), 'bug');
assert.equal(getFeedbackCategoryForTopic('generation_failed'), 'bug');
assert.equal(isContentReportTopic('unsafe_image'), true);
assert.equal(isContentReportTopic('unsafe_text'), true);
assert.equal(isContentReportTopic('privacy_concern'), true);
assert.equal(isContentReportTopic('billing'), false);

assert.equal(
  isFeedbackTopicAllowedForSession('child', 'billing'),
  false,
  'child sessions cannot submit ordinary support feedback'
);
assert.equal(
  isFeedbackTopicAllowedForSession('child', 'unsafe_image'),
  true,
  'child sessions can report unsafe generated content'
);
assert.equal(
  isFeedbackTopicAllowedForSession('parent', 'billing'),
  true,
  'parent sessions can submit support feedback'
);

console.log('feedbackReportedScreens and support topic tests passed');
