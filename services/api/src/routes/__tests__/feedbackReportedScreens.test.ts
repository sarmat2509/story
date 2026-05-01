import assert from 'node:assert/strict';
import { REPORTED_SCREENS } from '../feedback';

assert.ok(
  REPORTED_SCREENS.includes('published_story'),
  'feedback API should accept public story reports'
);

console.log('feedbackReportedScreens tests passed');
