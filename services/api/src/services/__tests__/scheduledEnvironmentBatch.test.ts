import assert from 'node:assert/strict';
import {
  buildScheduledEnvironmentBatchRequest,
  parseScheduledEnvironmentCustomId,
} from '../batchImageService';

const storyId = 'c1000000-0000-4000-8000-000000000001';

const request = buildScheduledEnvironmentBatchRequest({
  storyId,
  environment: {
    id: 'moon-garden_2',
    name: 'Moon garden',
    description: 'A quiet garden with silver flowers and a small fountain.',
  },
  scenarioCardId: 'fantasy_forest',
});

assert.equal(request.customId, `scheduled_environment_${storyId}_moon-garden_2`);
assert.equal(request.aspectRatio, '16:9');
assert.ok(request.modelOverride, 'scheduled environments explicitly choose the batch model');
assert.match(request.prompt, /silver flowers/i);
assert.deepEqual(parseScheduledEnvironmentCustomId(request.customId), {
  storyId,
  environmentId: 'moon-garden_2',
});
assert.equal(parseScheduledEnvironmentCustomId(`story_${storyId}_scene_1`), null);
assert.equal(parseScheduledEnvironmentCustomId('scheduled_environment_bad'), null);

console.log('scheduled environment batch request tests passed');
