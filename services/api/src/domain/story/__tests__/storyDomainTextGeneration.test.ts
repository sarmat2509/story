/**
 * Domain-layer story text generation: StoryDomainService + stub ITextProvider (no HTTP, no real LLM).
 */
import assert from 'node:assert';
import type { StorySpec } from '../../../ai/types';
import type { ITextProvider } from '../../../providers/base/ITextProvider';
import type { GenerateStructuredRequest, GenerateTextRequest } from '../../../providers/base/JsonSchema';
import { StoryDomainService } from '../StoryDomainService';

const STATIC_POLICY = {
  ageGroup: '6-8' as const,
  language: 'en' as const,
  allowedConflicts: [] as string[],
  constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
  readability: { maxSentenceLen: 18, targetWordsRange: [500, 800] as [number, number], dialogRatio: 0.5 },
  promptGuidelines: '',
};

/** Minimal valid StorySpec for prompt builders */
const STATIC_STORY_SPEC: StorySpec = {
  language: 'en',
  ageGroup: '6-8',
  characters: [],
  policyProfile: STATIC_POLICY,
  goalName: 'Kindness',
  goalGuidance: 'Show small acts of kindness between friends.',
  worldRule: { name: 'Gentle magic', description: 'Magic only appears as soft light when someone shares.' },
};

const PLAIN_LLM_FIXTURE = `title: The Tiny Light

description: A short bedtime tale about a glowworm who shares her glow.

---
[happy] The forest was quiet. A small glowworm woke under a leaf.
---
[thoughtful] She wondered if anyone else felt lonely in the dark.`;

/** Stub: only plain generateText is used */
class PlainOnlyStubTextProvider implements ITextProvider {
  public lastGenerateTextRequest: GenerateTextRequest | null = null;

  async generateText(request: GenerateTextRequest): Promise<string> {
    this.lastGenerateTextRequest = request;
    return PLAIN_LLM_FIXTURE;
  }

  async generateStructured<T>(_request: GenerateStructuredRequest<T>): Promise<T> {
    throw new Error('generateStructured must not be called for generateTextPlain');
  }
}

async function testGenerateTextPlainUsesDomainAndParsesScenes() {
  const stub = new PlainOnlyStubTextProvider();
  const domain = new StoryDomainService(stub);

  const result = await domain.generateTextPlain(STATIC_STORY_SPEC);

  assert.strictEqual(result.title, 'The Tiny Light');
  assert.strictEqual(
    result.description,
    'A short bedtime tale about a glowworm who shares her glow.',
    'description line parsed from fixture',
  );
  assert.strictEqual(result.scenes.length, 2, 'two --- blocks → two scenes');
  assert.ok(result.scenes[0].text.includes('glowworm'), 'first scene body preserved');
  assert.ok(result.scenes[0].text.includes('[happy]'), 'audio-style tags preserved in scene text');
  assert.strictEqual(result.scenes[0].sceneId, 1);
  assert.strictEqual(result.scenes[1].sceneId, 2);
  assert.ok(result.fullText.includes(result.scenes[0].text), 'fullText joins scene bodies');
  assert.ok(result.wordCount >= 10, 'wordCount computed server-side');

  assert.ok(stub.lastGenerateTextRequest, 'provider received a request');
  assert.ok(
    (stub.lastGenerateTextRequest!.prompt?.length ?? 0) > 500,
    'prompt is built (child profile, rules, plain output contract)',
  );
  assert.strictEqual(stub.lastGenerateTextRequest!.operation, 'text_plain');
}

const STRUCTURED_LLM_FIXTURE = {
  title: 'Stub Adventure',
  language: 'en',
  characters: [] as Array<Record<string, unknown>>,
  moral: 'Helping others feels good.',
  outfits: [
    { id: 'o_hero_1', characterName: 'River', description: 'natural appearance' },
  ],
  environments: [{ id: 'meadow', name: 'Meadow', description: 'Green grass, distant hills, afternoon sun.' }],
  scenes: [
    {
      sceneId: 1,
      environmentId: 'meadow',
      text: 'River ran through the meadow. The air smelled sweet.',
      sceneVisual: {
        setting: 'Open grass, wildflowers near foreground.',
        cameraComposition: {
          shot: 'Medium shot',
          characters: [{ name: 'River', description: 'running, smiling', outfitId: 'o_hero_1' }],
        },
        lighting: 'Warm afternoon sunlight.',
      },
    },
  ],
};

/** Stub: only structured generation is used */
class StructuredOnlyStubTextProvider implements ITextProvider {
  public lastGenerateStructuredRequest: GenerateStructuredRequest<unknown> | null = null;

  async generateText(_request: GenerateTextRequest): Promise<string> {
    throw new Error('generateText must not be called for generateText');
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.lastGenerateStructuredRequest = request;
    return STRUCTURED_LLM_FIXTURE as T;
  }
}

async function testGenerateTextUsesDomainAndBuildsFullText() {
  const stub = new StructuredOnlyStubTextProvider();
  const domain = new StoryDomainService(stub);

  const result = await domain.generateText(STATIC_STORY_SPEC);

  assert.strictEqual(result.title, 'Stub Adventure');
  assert.strictEqual(result.language, 'en');
  assert.strictEqual(result.scenes.length, 1);
  assert.ok(result.scenes[0].text.includes('River ran'), 'scene text from fixture');
  assert.ok(result.fullText.includes('River ran'), 'fullText derived from scenes');
  assert.ok((result.wordCount ?? 0) >= 5);

  assert.ok(stub.lastGenerateStructuredRequest, 'provider received structured request');
  assert.ok((stub.lastGenerateStructuredRequest!.prompt?.length ?? 0) > 500, 'structured prompt is non-trivial');
  assert.strictEqual(stub.lastGenerateStructuredRequest!.operation, 'text_structured');
}

class BlockedValidationStubTextProvider implements ITextProvider {
  public lastGenerateStructuredRequest: GenerateStructuredRequest<unknown> | null = null;

  async generateText(_request: GenerateTextRequest): Promise<string> {
    throw new Error('generateText must not be called for validation');
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.lastGenerateStructuredRequest = request;
    throw new Error('Content blocked by Gemini: PROHIBITED_CONTENT');
  }
}

async function testValidateSceneFailsClosedWhenProviderBlocksValidation() {
  const stub = new BlockedValidationStubTextProvider();
  const domain = new StoryDomainService(stub, stub, stub);

  const result = await domain.validateScene(
    {
      sceneId: 1,
      text: 'The scene needs validation.',
    } as any,
    STATIC_POLICY,
    false,
  );

  assert.strictEqual(result.isValid, false, 'blocked validation must not auto-pass as safe');
  assert.strictEqual(result.violations.length, 1);
  assert.strictEqual(result.violations[0].category, 'content_policy');
  assert.strictEqual(result.violations[0].severity, 'critical');
  assert.strictEqual(stub.lastGenerateStructuredRequest!.operation, 'validateScene');
}

async function testValidateScenesBatchFailsClosedWhenProviderBlocksValidation() {
  const stub = new BlockedValidationStubTextProvider();
  const domain = new StoryDomainService(stub, stub, stub);

  const result = await domain.validateScenesBatch(
    [
      { sceneId: 1, text: 'First scene.' } as any,
      { sceneId: 2, text: 'Second scene.' } as any,
    ],
    STATIC_POLICY,
  );

  assert.strictEqual(result.failedScenes.length, 2, 'all scenes fail closed when batch validation is blocked');
  assert.deepStrictEqual(
    result.failedScenes.map((scene) => scene.sceneId),
    [1, 2],
  );
  assert.ok(result.failedScenes.every((scene) => scene.violations[0]?.category === 'content_policy'));
}

void (async () => {
  await testGenerateTextPlainUsesDomainAndParsesScenes();
  await testGenerateTextUsesDomainAndBuildsFullText();
  await testValidateSceneFailsClosedWhenProviderBlocksValidation();
  await testValidateScenesBatchFailsClosedWhenProviderBlocksValidation();
  console.log('storyDomainTextGeneration tests OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
