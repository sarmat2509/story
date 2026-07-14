import assert from 'node:assert/strict';
import type { StorySpec } from '../../ai/types';
import { buildDirectTextPromptPlain } from '../text';

const baseSpec: StorySpec = {
  language: 'en',
  ageGroup: '6-8',
  characters: [],
  policyProfile: {
    ageGroup: '6-8',
    language: 'en',
    allowedConflicts: [],
    constraints: {
      mustHaveHappyEnding: true,
      noShamingLanguage: true,
    },
    readability: {
      maxSentenceLen: 12,
      targetWordsRange: [200, 400],
      dialogRatio: 0.5,
    },
    promptGuidelines: '',
  },
  scenarioCard: {
    id: 'holiday-test',
    name: 'Holiday Test',
    description: 'A culturally grounded family celebration.',
    promptGuidance: 'Keep the named tradition specific to one family or community.',
  },
  scenarioGuidance: 'A familiar family celebration changes when an unexpected guest arrives.',
};

const prompt = buildDirectTextPromptPlain({
  spec: baseSpec,
  sceneCount: 5,
  vocabLevel: 'intermediate',
});

assert.match(
  prompt,
  /Theme guidance \(binding\): Keep the named tradition specific to one family or community\./
);
assert.match(
  prompt,
  /Creative seed \(loose direction, not an outline\): A familiar family celebration changes when an unexpected guest arrives\./
);
assert.match(
  prompt,
  /freely invent the conflict, story events, supporting cast, surprises, and resolution/
);
assert.doesNotMatch(prompt, /Setting & Premise:/);

const legacyPremise = 'A legacy premise stored in both old StorySpec fields.';
const legacyPrompt = buildDirectTextPromptPlain({
  spec: {
    ...baseSpec,
    scenarioCard: {
      ...baseSpec.scenarioCard!,
      promptGuidance: legacyPremise,
    },
    scenarioGuidance: legacyPremise,
  },
  sceneCount: 5,
  vocabLevel: 'intermediate',
});

assert.equal(
  legacyPrompt.match(new RegExp(legacyPremise.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length,
  1,
  'legacy in-flight specs must not duplicate the old premise as binding theme guidance'
);

console.log('creativeSeedPrompt tests passed');
