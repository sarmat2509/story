import assert from 'node:assert/strict';
import type { StorySpec } from '../../ai/types';
import { clearRepositoryTestOverrides, installRepositoryTestOverrides } from '../../repositories';
import { clearAiServiceTestOverrides, installAiServiceTestOverrides } from '../aiService';
import { validateStoryTextScenes } from '../storyOrchestration/validation';
import { MockTextProvider } from '../../testing/ai';

const STORY_SPEC: StorySpec = {
  language: 'en',
  ageGroup: '6-8',
  characters: [],
  goalName: 'Kindness',
  goalGuidance: 'Friends help one another.',
  policyProfile: {
    ageGroup: '6-8',
    language: 'en',
    allowedConflicts: [],
    constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
    readability: {
      maxSentenceLen: 18,
      targetWordsRange: [500, 800],
      dialogRatio: 0.5,
    },
    promptGuidelines: '',
  },
};

type RequestRow = {
  progress: number;
  progressData: Record<string, unknown> | null;
};

type RepositoryTestOverrides = Parameters<typeof installRepositoryTestOverrides>[0];

function installProgressRepositoryFakes(): void {
  const request: RequestRow = { progress: 0, progressData: null };
  const storyRepository = {
    async transaction<T>(callback: (tx: object) => Promise<T>): Promise<T> {
      return callback({});
    },
    async findRequestForUpdate(): Promise<RequestRow> {
      return structuredClone(request);
    },
    async updateRequest(_requestId: string, update: Partial<RequestRow>): Promise<RequestRow> {
      Object.assign(request, structuredClone(update));
      return structuredClone(request);
    },
    async findRecentWithMetadata(): Promise<[]> {
      return [];
    },
    async findRecentWithAudioMetadata(): Promise<[]> {
      return [];
    },
  };
  const assetRepository = {
    async findRecentImageGenerationTimes(): Promise<[]> {
      return [];
    },
  };

  installRepositoryTestOverrides({
    story: storyRepository as unknown as RepositoryTestOverrides['story'],
    asset: assetRepository as unknown as RepositoryTestOverrides['asset'],
  });
}

function validScene(sceneId: number) {
  return { sceneId, isValid: true, violations: [] } as const;
}

function invalidScene(sceneId: number, message: string) {
  return {
    sceneId,
    isValid: false,
    violations: [
      {
        category: 'content_policy' as const,
        severity: 'high' as const,
        message,
        suggestion: 'Use calm, child-safe wording.',
      },
    ],
  };
}

async function testRepairsOnlyFailedSceneAndRevalidates(): Promise<void> {
  installProgressRepositoryFakes();
  const writerProvider = new MockTextProvider().queueStructured('regenerateScene', {
    scenes: [
      {
        sceneId: 2,
        text: 'Mira held the lantern beside the gate sensor. Its warm light woke the latch, and the gate swung open.',
      },
    ],
  });
  const validationProvider = new MockTextProvider()
    .queueStructured('writer_text_validation', {
      failedScenes: [
        {
          sceneId: 2,
          violations: [
            {
              category: 'causal_link_missing',
              severity: 'high',
              message: 'The story does not show how raising the lantern opened the gate.',
              suggestion:
                'Show the lantern light activating the gate sensor and releasing the latch.',
              relatedSceneIds: [1, 2],
              evidence: 'Scene 1 establishes a jammed gate; Scene 2 only says it opened.',
            },
          ],
        },
      ],
    })
    .queueStructured('writer_text_validation', { failedScenes: [] });
  installAiServiceTestOverrides({
    textProvider: writerProvider,
    directorTextProvider: writerProvider,
    validationTextProvider: validationProvider,
  });

  const firstScene = {
    sceneId: 1,
    text: 'Mira found a lantern beside a gate whose latch would not move.',
    environmentId: 'env_path',
    marker: { mustStayUntouched: true },
  };
  const secondScene = {
    sceneId: 2,
    text: 'Mira raised the lantern. Somehow the gate opened, and the friends crossed.',
    environmentId: 'env_bridge',
    marker: { mustAlsoStayUntouched: true },
  };
  const originalFirstScene = structuredClone(firstScene);
  const originalSecondMetadata = {
    environmentId: secondScene.environmentId,
    marker: structuredClone(secondScene.marker),
  };
  const text = {
    title: 'The Lantern Path',
    scenes: [firstScene, secondScene],
    fullText: `${firstScene.text}\n\n${secondScene.text}`,
    wordCount: 18,
  };

  const result = await validateStoryTextScenes({
    requestId: 'request-text-repair',
    userId: 'user-text-repair',
    storyId: 'story-text-repair',
    text,
    spec: STORY_SPEC,
    maxRetries: 1,
  });

  assert.deepStrictEqual(result.validatedText.scenes[0], originalFirstScene);
  assert.equal(
    result.validatedText.scenes[1].text,
    'Mira held the lantern beside the gate sensor. Its warm light woke the latch, and the gate swung open.'
  );
  assert.deepStrictEqual(
    {
      environmentId: result.validatedText.scenes[1].environmentId,
      marker: result.validatedText.scenes[1].marker,
    },
    originalSecondMetadata
  );
  assert.equal(
    result.validatedText.fullText,
    `${originalFirstScene.text}\n\nMira held the lantern beside the gate sensor. Its warm light woke the latch, and the gate swung open.`
  );
  assert.equal(result.textValidation.status, 'passed');
  assert.deepStrictEqual(result.textValidation.passedSceneIds, [1, 2]);
  assert.deepStrictEqual(
    result.textValidation.attempts.map((attempt) => [
      attempt.sceneId,
      attempt.phase,
      attempt.isValid,
    ]),
    [
      [1, 'initial', true],
      [2, 'initial', false],
      [1, 'revalidation', true],
      [2, 'revalidation', true],
    ]
  );
  assert.equal(result.textValidation.attempts[0].rawManifest?.operation, 'writer_text_validation');
  assert.match(String(result.textValidation.attempts[0].rawManifest?.prompt), /SCENE 1/);

  assert.equal(writerProvider.structuredRequests.length, 1);
  assert.equal(writerProvider.structuredRequests[0].operation, 'regenerateScene');
  assert.match(writerProvider.structuredRequests[0].prompt, /scene 2/i);
  assert.match(writerProvider.structuredRequests[0].prompt, /causal_link_missing/i);
  assert.match(writerProvider.structuredRequests[0].prompt, /activating the gate sensor/i);
  assert.match(writerProvider.structuredRequests[0].prompt, /Mira found a lantern/);
  assert.deepStrictEqual(
    validationProvider.structuredRequests.map((request) => request.operation),
    ['writer_text_validation', 'writer_text_validation']
  );
  assert.match(validationProvider.structuredRequests[0].prompt, /COMPLETE STORY/);
  assert.match(validationProvider.structuredRequests[0].prompt, /SCENE 1/);
  assert.match(validationProvider.structuredRequests[0].prompt, /SCENE 2/);
  assert.match(
    validationProvider.structuredRequests[1].prompt,
    /Mira held the lantern beside the gate sensor/
  );
  writerProvider.assertExhausted();
  validationProvider.assertExhausted();
}

async function testThrowsWhenRepairedSceneStillFailsValidation(): Promise<void> {
  installProgressRepositoryFakes();
  const writerProvider = new MockTextProvider().queueStructured('regenerateScene', {
    scenes: [{ sceneId: 1, text: 'The danger remained in the repaired scene.' }],
  });
  const validationProvider = new MockTextProvider()
    .queueStructured('writer_text_validation', {
      failedScenes: [invalidScene(1, 'The original scene is unsafe for this age group.')],
    })
    .queueStructured('writer_text_validation', {
      failedScenes: [invalidScene(1, 'The repaired scene is still unsafe for this age group.')],
    });
  installAiServiceTestOverrides({
    textProvider: writerProvider,
    directorTextProvider: writerProvider,
    validationTextProvider: validationProvider,
  });
  const text = {
    title: 'Unsafe Draft',
    scenes: [{ sceneId: 1, text: 'The original danger remained.' }],
    fullText: 'The original danger remained.',
    wordCount: 4,
  };

  await assert.rejects(
    validateStoryTextScenes({
      requestId: 'request-text-exhaustion',
      userId: 'user-text-exhaustion',
      storyId: 'story-text-exhaustion',
      text,
      spec: STORY_SPEC,
      maxRetries: 1,
    }),
    /Story text validation failed after safety retries for 1 scene/
  );

  assert.equal(text.scenes[0].text, 'The danger remained in the repaired scene.');
  assert.equal(writerProvider.structuredRequests.length, 1);
  assert.equal(validationProvider.structuredRequests.length, 2);
  writerProvider.assertExhausted();
  validationProvider.assertExhausted();
}

async function testRejectsRepairThatRemovesKeepsakeMarker(): Promise<void> {
  installProgressRepositoryFakes();
  const writerProvider = new MockTextProvider().queueStructured('regenerateScene', {
    scenes: [
      {
        sceneId: 2,
        text: 'Mira crossed the open gate and kept the small silver key as a reminder.',
      },
    ],
  });
  const validationProvider = new MockTextProvider()
    .queueStructured('writer_text_validation', {
      failedScenes: [
        {
          sceneId: 2,
          violations: [
            {
              category: 'language_clarity',
              severity: 'medium',
              message: 'Clarify the final sentence without changing the keepsake.',
              suggestion: 'Make the sentence more direct.',
              relatedSceneIds: [2],
            },
          ],
        },
      ],
    })
    .queueStructured('writer_text_validation', { failedScenes: [] });
  installAiServiceTestOverrides({
    textProvider: writerProvider,
    directorTextProvider: writerProvider,
    validationTextProvider: validationProvider,
  });

  const finalScene =
    'Mira crossed the open gate and kept the {small silver key} as a reminder.';
  const text = {
    title: 'The Silver Key',
    scenes: [
      { sceneId: 1, text: 'Mira found the safe path through the garden.' },
      { sceneId: 2, text: finalScene },
    ],
    fullText: `Mira found the safe path through the garden.\n\n${finalScene}`,
    wordCount: 22,
  };

  const result = await validateStoryTextScenes({
    requestId: 'request-keepsake-preservation',
    userId: 'user-keepsake-preservation',
    storyId: 'story-keepsake-preservation',
    text,
    spec: STORY_SPEC,
    maxRetries: 1,
  });

  assert.equal(result.validatedText.scenes[1].text, finalScene);
  assert.match(result.validatedText.fullText, /\{small silver key\}/);
  assert.equal(result.textValidation.status, 'passed');
  writerProvider.assertExhausted();
  validationProvider.assertExhausted();
}

async function testFallsBackToPerSceneValidationWhenBatchIsBlocked(): Promise<void> {
  installProgressRepositoryFakes();
  const writerProvider = new MockTextProvider();
  const validationProvider = new MockTextProvider()
    .queueError(
      'structured',
      'writer_text_validation',
      'Content blocked by Gemini: PROHIBITED_CONTENT'
    )
    .queueStructured('writer_text_validation', validScene(1))
    .queueStructured('writer_text_validation', validScene(2));
  installAiServiceTestOverrides({
    textProvider: writerProvider,
    directorTextProvider: writerProvider,
    validationTextProvider: validationProvider,
  });

  const text = {
    title: 'A Calm Walk',
    scenes: [
      { sceneId: 1, text: 'Mira and Leo followed the sunny path.' },
      { sceneId: 2, text: 'They reached home and waved goodbye.' },
    ],
    fullText: 'Mira and Leo followed the sunny path.\n\nThey reached home and waved goodbye.',
    wordCount: 13,
  };

  const result = await validateStoryTextScenes({
    requestId: 'request-text-batch-fallback',
    userId: 'user-text-batch-fallback',
    storyId: 'story-text-batch-fallback',
    text,
    spec: STORY_SPEC,
    maxRetries: 1,
  });

  assert.equal(result.textValidation.status, 'passed');
  assert.equal(validationProvider.structuredRequests.length, 3);
  assert.match(validationProvider.structuredRequests[0].prompt, /COMPLETE STORY/);
  assert.match(validationProvider.structuredRequests[1].prompt, /SCENE ID: 1/);
  assert.match(validationProvider.structuredRequests[2].prompt, /SCENE ID: 2/);
  writerProvider.assertExhausted();
  validationProvider.assertExhausted();
}

async function testFallsBackWhenBatchPayloadIsInvalid(): Promise<void> {
  installProgressRepositoryFakes();
  const writerProvider = new MockTextProvider();
  const validationProvider = new MockTextProvider()
    .queueStructured('writer_text_validation', { unexpected: true })
    .queueStructured('writer_text_validation', validScene(1));
  installAiServiceTestOverrides({
    textProvider: writerProvider,
    directorTextProvider: writerProvider,
    validationTextProvider: validationProvider,
  });

  const text = {
    title: 'Lantern Home',
    scenes: [{ sceneId: 1, text: 'Mira followed the lantern home and hugged her family.' }],
    fullText: 'Mira followed the lantern home and hugged her family.',
    wordCount: 9,
  };

  const result = await validateStoryTextScenes({
    requestId: 'request-text-invalid-batch-fallback',
    userId: 'user-text-invalid-batch-fallback',
    storyId: 'story-text-invalid-batch-fallback',
    text,
    spec: STORY_SPEC,
    maxRetries: 1,
  });

  assert.equal(result.textValidation.status, 'passed');
  assert.equal(validationProvider.structuredRequests.length, 2);
  assert.match(validationProvider.structuredRequests[0].prompt, /COMPLETE STORY/);
  assert.match(validationProvider.structuredRequests[1].prompt, /SCENE ID: 1/);
  writerProvider.assertExhausted();
  validationProvider.assertExhausted();
}

async function main(): Promise<void> {
  try {
    await testRepairsOnlyFailedSceneAndRevalidates();
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
    await testThrowsWhenRepairedSceneStillFailsValidation();
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
    await testRejectsRepairThatRemovesKeepsakeMarker();
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
    await testFallsBackToPerSceneValidationWhenBatchIsBlocked();
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
    await testFallsBackWhenBatchPayloadIsInvalid();
    console.log('story text validation repair tests passed');
  } finally {
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
