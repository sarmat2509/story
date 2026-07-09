/**
 * Domain-layer story text generation: StoryDomainService + stub ITextProvider (no HTTP, no real LLM).
 */
import assert from 'node:assert';
import type { StorySpec } from '../../../ai/types';
import type { ITextProvider } from '../../../providers/base/ITextProvider';
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
} from '../../../providers/base/JsonSchema';
import { StoryDomainService } from '../StoryDomainService';

const STATIC_POLICY = {
  ageGroup: '6-8' as const,
  language: 'en' as const,
  allowedConflicts: [] as string[],
  constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
  readability: {
    maxSentenceLen: 18,
    targetWordsRange: [500, 800] as [number, number],
    dialogRatio: 0.5,
  },
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
  worldRule: {
    name: 'Gentle magic',
    description: 'Magic only appears as soft light when someone shares.',
  },
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

  constructor(private readonly fixture = PLAIN_LLM_FIXTURE) {}

  async generateText(request: GenerateTextRequest): Promise<string> {
    this.lastGenerateTextRequest = request;
    return this.fixture;
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
    'description line parsed from fixture'
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
    'prompt is built (child profile, rules, plain output contract)'
  );
  assert.ok(
    stub.lastGenerateTextRequest!.prompt.includes(
      'Role boundary: you are the Story Writer, not the Visual Director.'
    ),
    'Writer prompt keeps visual metadata in the Director step'
  );
  assert.ok(
    stub.lastGenerateTextRequest!.prompt.includes(
      'WORLD RULE DRAMATURGY (author-only constraint):'
    ),
    'world rules are treated as hidden dramaturgy, not exposition'
  );
  assert.ok(
    !stub.lastGenerateTextRequest!.prompt.includes('Introduce this rule in Scene'),
    'prompt must not ask Writer to explicitly introduce a world rule'
  );
  assert.ok(
    !stub.lastGenerateTextRequest!.prompt.includes('OUTPUT FORMAT (JSON)'),
    'plain Writer prompt must not include the old structured JSON contract'
  );
  assert.strictEqual(stub.lastGenerateTextRequest!.operation, 'text_plain');
}

async function testGenerateTextPlainRejectsEmptyWriterOutput() {
  const stub = new PlainOnlyStubTextProvider('title: Untitled\n\ndescription:');
  const domain = new StoryDomainService(stub);

  await assert.rejects(
    () => domain.generateTextPlain(STATIC_STORY_SPEC),
    /Writer returned no readable story scenes/,
    'empty writer output must fail before validation/persistence'
  );
}

async function testGenerateTextCompatibilityUsesPlainWriter() {
  const stub = new PlainOnlyStubTextProvider();
  const domain = new StoryDomainService(stub);

  const result = await domain.generateText(STATIC_STORY_SPEC);

  assert.strictEqual(result.title, 'The Tiny Light');
  assert.strictEqual(result.language, 'en');
  assert.strictEqual(result.scenes.length, 2);
  assert.deepStrictEqual(
    result.characters,
    [],
    'plain Writer does not create a JSON character roster'
  );
  assert.deepStrictEqual(
    result.environments,
    [],
    'visual environments belong to Director, not Writer'
  );
  assert.deepStrictEqual(result.outfits, [], 'outfits belong to Director, not Writer');
  assert.ok(stub.lastGenerateTextRequest, 'provider received a plain text request');
  assert.strictEqual(stub.lastGenerateTextRequest!.operation, 'text_plain');
}

async function testWriterPromptDoesNotExposeCharacterIds() {
  const stub = new PlainOnlyStubTextProvider();
  const domain = new StoryDomainService(stub);

  await domain.generateTextPlain({
    ...STATIC_STORY_SPEC,
    characters: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Емілія',
        type: 'person',
        description: 'A curious child who likes building things.',
      } as any,
    ],
  });

  assert.ok(stub.lastGenerateTextRequest, 'provider received a request');
  assert.ok(
    stub.lastGenerateTextRequest!.prompt.includes('1. Емілія'),
    'Writer prompt lists the localized story name'
  );
  assert.ok(
    stub.lastGenerateTextRequest!.prompt.includes(
      'Do not translate, rename, or append bracket metadata'
    ),
    'Writer prompt instructs prose names to stay clean'
  );
  assert.ok(
    !stub.lastGenerateTextRequest!.prompt.includes('[ID:'),
    'Writer prompt must not expose technical character IDs'
  );
}

async function testContinuationWriterPromptDoesNotExposeIds() {
  const stub = new PlainOnlyStubTextProvider();
  const domain = new StoryDomainService(stub);

  await domain.generateTextPlain(STATIC_STORY_SPEC, {
    isContinuation: true,
    continuationContext: {
      previousOutlines: [
        {
          title: 'First Part',
          moral: 'Friends help each other.',
          scenes: [{ setting: 'Forest', goal: 'They found a glowing path.' }],
        },
      ],
      requiredCharacters: [
        {
          name: 'Snow Spirit [ID: snow-spirit-1]',
          type: 'imaginary',
          description: 'A gentle snowy helper.',
          role: 'friend',
        },
      ],
      optionalCharacters: [],
      usedPlots: [],
      previousEnvironments: [
        {
          id: 'env_forest_001',
          name: 'Winter Forest',
          description: 'Snowy trees and a quiet trail.',
        },
      ],
      previousOutfits: [
        {
          id: 'outfit_snow_001',
          characterName: 'Snow Spirit [ID: snow-spirit-1]',
          description: 'natural snowy glow',
        },
      ],
    },
  });

  assert.ok(stub.lastGenerateTextRequest, 'provider received a continuation request');
  assert.ok(
    stub.lastGenerateTextRequest!.prompt.includes('Snow Spirit (imaginary)'),
    'character name is clean'
  );
  assert.ok(
    !stub.lastGenerateTextRequest!.prompt.includes('Friends help each other.'),
    'previous moral must not be carried into continuation prompt'
  );
  assert.ok(
    !stub.lastGenerateTextRequest!.prompt.includes('[ID:'),
    'continuation prompt must not expose IDs'
  );
  assert.ok(
    !stub.lastGenerateTextRequest!.prompt.includes('env_forest_001'),
    'environment IDs stay out of Writer prompt'
  );
  assert.ok(
    !stub.lastGenerateTextRequest!.prompt.includes('outfit_snow_001'),
    'outfit IDs stay out of Writer prompt'
  );
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
    false
  );

  assert.strictEqual(result.isValid, false, 'blocked validation must not auto-pass as safe');
  assert.strictEqual(result.violations.length, 1);
  assert.strictEqual(result.violations[0].category, 'content_policy');
  assert.strictEqual(result.violations[0].severity, 'critical');
  assert.strictEqual(stub.lastGenerateStructuredRequest!.operation, 'validateScene');
}

async function testValidateSceneAllowsCustomUsageOperation() {
  const stub = new BlockedValidationStubTextProvider();
  const domain = new StoryDomainService(stub, stub, stub);

  const result = await domain.validateScene(
    {
      sceneId: 2,
      text: 'The writer scene needs validation.',
    } as any,
    STATIC_POLICY,
    false,
    undefined,
    { operation: 'writer_text_validation' }
  );

  assert.strictEqual(stub.lastGenerateStructuredRequest!.operation, 'writer_text_validation');
  assert.strictEqual(result.requestManifest?.operation, 'writer_text_validation');
  assert.strictEqual(result.validationScore, 0);
}

async function testValidateScenesBatchFailsClosedWhenProviderBlocksValidation() {
  const stub = new BlockedValidationStubTextProvider();
  const domain = new StoryDomainService(stub, stub, stub);

  const result = await domain.validateScenesBatch(
    [{ sceneId: 1, text: 'First scene.' } as any, { sceneId: 2, text: 'Second scene.' } as any],
    STATIC_POLICY
  );

  assert.strictEqual(
    result.failedScenes.length,
    2,
    'all scenes fail closed when batch validation is blocked'
  );
  assert.deepStrictEqual(
    result.failedScenes.map((scene) => scene.sceneId),
    [1, 2]
  );
  assert.ok(
    result.failedScenes.every((scene) => scene.violations[0]?.category === 'content_policy')
  );
}

void (async () => {
  await testGenerateTextPlainUsesDomainAndParsesScenes();
  await testGenerateTextPlainRejectsEmptyWriterOutput();
  await testGenerateTextCompatibilityUsesPlainWriter();
  await testWriterPromptDoesNotExposeCharacterIds();
  await testContinuationWriterPromptDoesNotExposeIds();
  await testValidateSceneFailsClosedWhenProviderBlocksValidation();
  await testValidateSceneAllowsCustomUsageOperation();
  await testValidateScenesBatchFailsClosedWhenProviderBlocksValidation();
  console.log('storyDomainTextGeneration tests OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
