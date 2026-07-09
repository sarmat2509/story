import assert from 'node:assert/strict';
import { storyQuizResponseSchema } from '../../../../domain/quiz/schemas';
import { GeminiSchemaAdapter } from '../GeminiSchemaAdapter';

function run() {
  const schema = new GeminiSchemaAdapter().convert(storyQuizResponseSchema);
  const activities = schema.properties?.activities;

  assert.ok(activities, 'story quiz schema should expose activities');
  assert.equal(activities.minItems, 2);
  assert.equal(
    activities.maxItems,
    undefined,
    'Gemini rejects the full nested story quiz activity schema when activities.maxItems is present'
  );

  assert.equal(
    schema.properties?.sections?.maxItems,
    2,
    'other array caps should remain available to Gemini'
  );
}

run();
console.log('GeminiSchemaAdapter tests passed');
