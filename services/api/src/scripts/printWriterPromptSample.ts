/**
 * Prints full writer prompts (plain + structured) for a fixed sample StorySpec — no LLM calls.
 * Run: pnpm --filter wondertales-api print:writer-prompts
 */
import type { StorySpec } from '../ai/types';
import { buildDirectTextPrompt, buildDirectTextPromptPlain } from '../prompts/text';

const STATIC_POLICY = {
  ageGroup: '6-8' as const,
  language: 'en' as const,
  allowedConflicts: [] as string[],
  constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
  readability: { maxSentenceLen: 18, targetWordsRange: [500, 800] as [number, number], dialogRatio: 0.5 },
  promptGuidelines: '',
};

const STATIC_STORY_SPEC: StorySpec = {
  language: 'en',
  ageGroup: '6-8',
  characters: [],
  policyProfile: STATIC_POLICY,
  goalName: 'Kindness',
  goalGuidance: 'Show small acts of kindness between friends.',
  worldRule: { name: 'Gentle magic', description: 'Magic only appears as soft light when someone shares.' },
};

// Matches StoryDomainService.getSceneCount('6-8') and getVocabularyLevel('6-8')
const SCENE_COUNT = 9;
const VOCAB_LEVEL = 'intermediate';

const plain = buildDirectTextPromptPlain({
  spec: STATIC_STORY_SPEC,
  sceneCount: SCENE_COUNT,
  vocabLevel: VOCAB_LEVEL,
});

const structured = buildDirectTextPrompt({
  spec: STATIC_STORY_SPEC,
  sceneCount: SCENE_COUNT,
  vocabLevel: VOCAB_LEVEL,
});

console.log('='.repeat(80));
console.log('PLAIN WRITER (Director flow) — buildDirectTextPromptPlain');
console.log('='.repeat(80));
console.log(plain);
console.log('\n');
console.log('='.repeat(80));
console.log('STRUCTURED WRITER — buildDirectTextPrompt');
console.log('='.repeat(80));
console.log(structured);
