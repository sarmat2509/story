import assert from 'node:assert/strict';
import {
  hashModerationSubject,
  recordModerationDecision,
  sanitizeModerationMetadata,
} from '../moderationDecisionService';

assert.equal(
  hashModerationSubject('same subject'),
  hashModerationSubject('same subject'),
  'moderation subject hashes are deterministic'
);
assert.notEqual(
  hashModerationSubject('same subject'),
  hashModerationSubject('different subject'),
  'different moderation subjects produce different hashes'
);
assert.equal(hashModerationSubject('same subject').length, 32);

assert.deepEqual(
  sanitizeModerationMetadata({
    requestId: 'request-1',
    promptText: 'do not store this',
    childPhotoPath: 'development/user/photos/child/a.jpg',
    nested: {
      categories: ['self_harm', 'dangerous_instructions'],
      rawMessage: 'also private',
    },
    longCode: 'a'.repeat(200),
  }),
  {
    requestId: 'request-1',
    promptText: '[redacted]',
    childPhotoPath: '[redacted]',
    nested: {
      categories: ['self_harm', 'dangerous_instructions'],
      rawMessage: '[redacted]',
    },
    longCode: `${'a'.repeat(160)}...`,
  },
  'metadata sanitizer keeps support-safe fields while redacting raw content carriers'
);

void (async function main() {
  const createdEvents: unknown[] = [];
  await recordModerationDecision(
    {
      userId: '11111111-1111-4111-8111-111111111111',
      stage: 'prompt_pre_queue',
      source: 'story_goal',
      subjectType: 'prompt',
      subjectRefHash: hashModerationSubject('unsafe prompt'),
      decision: 'blocked',
      code: 'PROMPT_SAFETY_BLOCKED',
      category: 'self_harm',
      ruleId: 'self-harm',
      metadata: { promptText: 'unsafe prompt', promptLength: 13 },
    },
    {
      async create(event) {
        createdEvents.push(event);
        return { ...event, id: 'event-id', createdAt: new Date() } as any;
      },
    }
  );

  assert.equal(createdEvents.length, 1, 'recordModerationDecision writes through injected repository');
  assert.deepEqual((createdEvents[0] as any).metadata, {
    promptText: '[redacted]',
    promptLength: 13,
  });

  console.log('moderationDecisionService tests passed');
})();
