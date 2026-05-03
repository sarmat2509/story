import assert from 'node:assert/strict';
import {
  FEEDBACK_TOPICS,
  getFeedbackCategoryForTopic,
} from '@wondertales/shared';
import { REPORTED_SCREENS, rejectChildFeedbackSubmission } from '../feedback';

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

function makeResponse() {
  const response = {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
  return response;
}

const childResponse = makeResponse();
assert.equal(
  rejectChildFeedbackSubmission({ sessionMode: 'child' } as any, childResponse as any),
  true,
  'child sessions cannot submit support feedback'
);
assert.equal(childResponse.statusCode, 403);
assert.deepEqual(childResponse.payload, {
  status: 'error',
  message: 'Parent session required',
  code: 'PARENT_SESSION_REQUIRED',
});

const parentResponse = makeResponse();
assert.equal(
  rejectChildFeedbackSubmission({ sessionMode: 'parent' } as any, parentResponse as any),
  false,
  'parent sessions can continue through feedback validation'
);
assert.equal(parentResponse.statusCode, 200);

console.log('feedbackReportedScreens and support topic tests passed');
