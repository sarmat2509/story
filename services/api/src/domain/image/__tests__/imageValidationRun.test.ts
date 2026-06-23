/**
 * Focused tests for image validation provider fallback/block handling.
 *
 * Run: pnpm exec tsx src/domain/image/__tests__/imageValidationRun.test.ts
 */

import assert from 'node:assert/strict';
import type { ImageValidationResult } from '../../../ai/types';
import type { ITextProvider } from '../../../providers/base/ITextProvider';
import type { GenerateStructuredRequest, GenerateTextRequest } from '../../../providers/base/JsonSchema';
import { runProductImageValidation } from '../imageValidationRun';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

class MockTextProvider implements ITextProvider {
  calls: Array<GenerateStructuredRequest<unknown>> = [];

  constructor(private readonly responses: Array<unknown | Error>) {}

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.calls.push(request as GenerateStructuredRequest<unknown>);
    const next = this.responses.shift();
    if (next instanceof Error) throw next;
    return next as T;
  }

  async generateText(_request: GenerateTextRequest): Promise<string> {
    throw new Error('generateText not used');
  }
}

function validResult(): ImageValidationResult {
  return {
    characterCount: 2,
    expectedCharacterCount: 2,
    characters: [
      {
        name: 'Lera',
        characterKind: 'human',
        found: true,
        duplicated: false,
        recognizableScore: 1,
        faceMatchesReference: true,
        hairMatchesReference: true,
        ageReadMatchesReference: true,
        proportionsMatchReference: true,
        matchesColors: true,
        matchesOutfit: true,
        identityComparisonSummary: 'Matches reference.',
      },
      {
        name: 'Druzhok',
        characterKind: 'imaginary',
        found: true,
        duplicated: false,
        recognizableScore: 1,
        faceMatchesReference: null,
        hairMatchesReference: null,
        ageReadMatchesReference: null,
        proportionsMatchReference: true,
        matchesColors: true,
        matchesOutfit: true,
        sameOverallDesignRead: true,
        silhouetteDriftSeverity: 'none',
        identityComparisonSummary: 'Matches reference.',
      },
    ],
    hasUnexpectedCharacters: false,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    overallFeedback: 'ok',
  };
}

const validationInput = {
  imageData: TINY_PNG,
  mimeType: 'image/png',
  expectedCharacters: [
    {
      name: 'Lera',
      characterKind: 'human' as const,
      description: 'Young girl beside the starry chest.',
    },
    {
      name: 'Druzhok',
      characterKind: 'imaginary' as const,
      description: 'Small robo-dog with a light on the chest or forehead area.',
    },
  ],
  sceneVisual: {
    setting: 'The chest lid is closed and the painted stars shine.',
    lighting: 'Soft daylight.',
    cameraComposition: {
      shot: 'Medium shot at child eye level with the chest visible.',
      characters: [
        {
          name: 'Lera',
          description:
            'Foreground left, leaning forward with one hand pressed on the chest lid; determined expression.',
        },
        {
          name: 'Druzhok',
          description:
            'Midground right, standing alert with nose nearly touching the chest surface.',
        },
      ],
    },
  },
  referenceImages: [
    { characterName: 'Lera', imageData: TINY_PNG.toString('base64'), mimeType: 'image/png' },
    { characterName: 'Druzhok', imageData: TINY_PNG.toString('base64'), mimeType: 'image/png' },
  ],
};

async function testFallbackAfterPrimaryBlocked() {
  const primary = new MockTextProvider([
    new Error('Gemini structured generation failed: Content blocked by Gemini: PROHIBITED_CONTENT'),
    new Error('Gemini structured generation failed: Content blocked by Gemini: PROHIBITED_CONTENT'),
  ]);
  const fallback = new MockTextProvider([validResult()]);

  const result = await runProductImageValidation(primary, validationInput, {
    visionModel: 'gemini-test',
    fallbackTextProvider: fallback,
    fallbackVisionModel: 'openai-test',
  });

  assert.strictEqual(result.validationStatus, 'completed');
  assert.strictEqual(result.validationAttemptKind, 'fallback_compact');
  assert.strictEqual(result.validationModelUsed, 'openai-test');
  assert.strictEqual(primary.calls.length, 2);
  assert.strictEqual(fallback.calls.length, 1);
  assert.match(fallback.calls[0].systemInstruction ?? '', /image quality assurance inspector/);
  assert.doesNotMatch(fallback.calls[0].prompt, /chest lid is closed/i);
  assert.doesNotMatch(fallback.calls[0].prompt, /chest or forehead/i);
  assert.ok(result.requestManifest);
}

async function testAllBlockedReturnsProviderBlocked() {
  const primary = new MockTextProvider([
    new Error('Gemini structured generation failed: Content blocked by Gemini: PROHIBITED_CONTENT'),
    new Error('Gemini structured generation failed: Content blocked by Gemini: PROHIBITED_CONTENT'),
  ]);

  const result = await runProductImageValidation(primary, validationInput, {
    visionModel: 'gemini-test',
  });

  assert.strictEqual(result.validationStatus, 'provider_blocked');
  assert.strictEqual(result.validationAttemptKind, 'primary_reduced');
  assert.strictEqual(result.validationModelUsed, 'gemini-test');
  assert.strictEqual(primary.calls.length, 2);
  assert.ok(result.characters.every((c) => c.found));
  assert.ok(result.characters.every((c) => c.matchesOutfit));
  assert.match(result.overallFeedback, /provider-blocked/);
  const manifest = result.requestManifest as { attempts: Array<{ outcome: string }> };
  assert.deepStrictEqual(
    manifest.attempts.map((a) => a.outcome),
    ['provider_blocked', 'provider_blocked']
  );
}

async function main() {
  await testFallbackAfterPrimaryBlocked();
  await testAllBlockedReturnsProviderBlocked();
  console.log('imageValidationRun tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
