/**
 * Focused tests for image validation provider fallback/block handling.
 *
 * Run: pnpm exec tsx src/domain/image/__tests__/imageValidationRun.test.ts
 */

import assert from 'node:assert/strict';
import type { ImageValidationResult } from '../../../ai/types';
import type { ITextProvider } from '../../../providers/base/ITextProvider';
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
} from '../../../providers/base/JsonSchema';
import {
  runGraphicNovelPanelImageValidation,
  runProductImageValidation,
  runSegmentedProductImageValidation,
  type GraphicNovelPanelImageValidationResult,
} from '../imageValidationRun';

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

function validLayoutResult(): ImageValidationResult {
  return {
    ...validResult(),
    hasArtworkOutsidePanelBounds: false,
    hasArtworkOverSpeechBubbles: false,
    hasExtraPanelStructure: false,
    layoutFeedback: 'ok',
  };
}

function segmentedLayoutResult() {
  return {
    hasArtworkOutsidePanelBounds: false,
    hasArtworkOverSpeechBubbles: false,
    hasExtraPanelStructure: true,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    layoutFeedback: 'one planned panel is visually split',
    overallFeedback: 'Layout has an extra split panel.',
  };
}

function segmentedCharacterResult(
  character: ImageValidationResult['characters'][number]
): Record<string, unknown> {
  return {
    character,
    hasUnexpectedCharacters: false,
    hasRenderingArtifacts: false,
    notes: character.issue || character.identityComparisonSummary,
  };
}

function validGraphicNovelPanelResult(): GraphicNovelPanelImageValidationResult {
  return {
    pageNumber: 1,
    expectedPanelCount: 1,
    detectedPanelCount: 1,
    hasExtraPanelStructure: false,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    layoutFeedback: 'One physical panel matches the expected page plan.',
    panels: [
      {
        panelNumber: 1,
        panelId: 'p1-1',
        panelDetected: true,
        matchedVisiblePanelDescription: 'A single visible panel with the starry chest.',
        visualMatchesExpectedMoment: true,
        unexpectedCharactersPresent: false,
        unexpectedNamedCharacters: [],
        renderingArtifacts: false,
        panelIssue: null,
        characters: [
          {
            name: 'Lera',
            characterKind: 'human',
            expectedPresent: true,
            found: false,
            recognizableScore: 0.1,
            faceMatchesReference: false,
            hairMatchesReference: false,
            ageReadMatchesReference: false,
            proportionsMatchReference: false,
            matchesColors: false,
            matchesOutfit: false,
            sameOverallDesignRead: null,
            silhouetteDriftSeverity: null,
            identityComparisonSummary: 'The expected child is not visible in this panel.',
            issue: 'character missing from panel',
          },
        ],
      },
    ],
    overallFeedback: 'Panel validation completed.',
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

async function testLayoutChecksSchemaAndPromptAreFlagged() {
  const primary = new MockTextProvider([validLayoutResult()]);

  const result = await runProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: true,
    },
    {
      visionModel: 'gemini-test',
    }
  );

  assert.strictEqual(result.hasArtworkOutsidePanelBounds, false);
  assert.strictEqual(result.hasArtworkOverSpeechBubbles, false);
  assert.strictEqual(result.hasExtraPanelStructure, false);
  assert.strictEqual(result.layoutFeedback, 'ok');
  assert.strictEqual(primary.calls.length, 1);
  assert.match(primary.calls[0].prompt, /GRAPHIC NOVEL LAYOUT CHECKS/);
  assert.ok((primary.calls[0].schema.required || []).includes('hasArtworkOutsidePanelBounds'));
  assert.ok((primary.calls[0].schema.required || []).includes('hasArtworkOverSpeechBubbles'));
  assert.ok((primary.calls[0].schema.required || []).includes('hasExtraPanelStructure'));
  assert.ok(!(primary.calls[0].schema.required || []).includes('hasTemplateColorResidue'));
  assert.ok((primary.calls[0].schema.required || []).includes('layoutFeedback'));
}

async function testLayoutTemplateReferenceIsIgnoredForValidation() {
  const primary = new MockTextProvider([validLayoutResult()]);

  const result = await runProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: true,
      includeBubbleChecks: false,
      referenceImages: [
        {
          characterName: 'Graphic novel page 3 layout template',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'layout_template',
        },
        ...validationInput.referenceImages,
      ],
    },
    {
      visionModel: 'gemini-test',
    }
  );

  assert.strictEqual(result.validationStatus, 'completed');
  assert.strictEqual(primary.calls.length, 1);
  assert.doesNotMatch(primary.calls[0].prompt, /LAYOUT TEMPLATE REFERENCES/);
  assert.doesNotMatch(primary.calls[0].prompt, /layout template/i);
  assert.match(primary.calls[0].prompt, /"Lera" -> Image 2 \[HUMAN; IDENTITY\]/);
  assert.ok(!primary.calls[0].prompt.includes('"Graphic novel page 3 layout template" ->'));
  assert.doesNotMatch(primary.calls[0].imageData?.[1]?.instructionText ?? '', /LAYOUT TEMPLATE/i);
  const manifest = result.requestManifest as {
    imageOrder: string[];
    references: Array<{ referenceKind: string; imageIndex: number }>;
  };
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_identity_Lera',
    '3_identity_Druzhok',
  ]);
  assert.strictEqual(manifest.references[0].referenceKind, 'identity');
  assert.strictEqual(manifest.references[0].imageIndex, 2);
}

async function testUnreferencedCharacterKeepsDescriptionAndClearsReferenceFields() {
  const primary = new MockTextProvider([validResult()]);

  const result = await runProductImageValidation(
    primary,
    {
      ...validationInput,
      referenceImages: [
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'outfit_plate',
        },
        {
          characterName: 'Druzhok',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
        },
      ],
    },
    {
      visionModel: 'gemini-test',
    }
  );

  assert.strictEqual(primary.calls.length, 1);
  assert.match(
    primary.calls[0].prompt,
    /"Lera" \| KIND=HUMAN \| Young girl beside the starry chest\./
  );
  assert.match(primary.calls[0].prompt, /"Lera" -> Image 2 \[HUMAN; OUTFIT_PLATE\]/);
  assert.doesNotMatch(
    primary.calls[0].prompt,
    /"Druzhok" \| KIND=IMAGINARY_CREATURE \| Small robo-dog/
  );

  const lera = result.characters.find((c) => c.name === 'Lera');
  assert.ok(lera, 'Lera validation row should be present');
  assert.strictEqual(lera.faceMatchesReference, null);
  assert.strictEqual(lera.hairMatchesReference, null);
  assert.strictEqual(lera.ageReadMatchesReference, null);
  assert.strictEqual(lera.proportionsMatchReference, null);
  assert.strictEqual(lera.sameOverallDesignRead, undefined);
  assert.strictEqual(lera.silhouetteDriftSeverity, undefined);
  assert.match(lera.identityComparisonSummary, /No identity reference was provided/);

  const druzhok = result.characters.find((c) => c.name === 'Druzhok');
  assert.ok(druzhok, 'Druzhok validation row should be present');
  assert.strictEqual(druzhok.proportionsMatchReference, true);
  assert.strictEqual(druzhok.sameOverallDesignRead, true);
}

async function testTurnaroundReferenceIsTracedInPromptAndManifest() {
  const primary = new MockTextProvider([validResult()]);

  const result = await runProductImageValidation(
    primary,
    {
      ...validationInput,
      referenceImages: [
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'turnaround',
        },
      ],
    },
    {
      visionModel: 'gemini-test',
    }
  );

  assert.strictEqual(primary.calls.length, 1);
  assert.match(primary.calls[0].prompt, /"Lera" -> Image 2 \[HUMAN; IDENTITY_TURNAROUND\]/);
  assert.match(
    primary.calls[0].imageData?.[1]?.instructionText ?? '',
    /IDENTITY TURNAROUND model sheet/
  );

  const manifest = result.requestManifest as {
    imageOrder: string[];
    references: Array<{ referenceKind: string; identitySource?: string; imageIndex: number }>;
  };
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_identity_turnaround_Lera',
  ]);
  assert.strictEqual(manifest.references[0].referenceKind, 'identity');
  assert.strictEqual(manifest.references[0].identitySource, 'turnaround');
  assert.strictEqual(manifest.references[0].imageIndex, 2);
}

async function testSegmentedValidationRunsLayoutAndPerCharacterPasses() {
  const primary = new MockTextProvider([
    segmentedLayoutResult(),
    segmentedCharacterResult({
      name: 'Lera',
      characterKind: 'human',
      found: false,
      duplicated: false,
      recognizableScore: 0.3,
      faceMatchesReference: false,
      hairMatchesReference: false,
      ageReadMatchesReference: true,
      proportionsMatchReference: true,
      matchesColors: false,
      matchesOutfit: false,
      sameOverallDesignRead: false,
      silhouetteDriftSeverity: 'severe',
      identityComparisonSummary:
        'Matches: child age read. Differs: wrong face and hair. First-glance design drifted.',
      issue: 'different child design',
    }),
    segmentedCharacterResult({
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
      identityComparisonSummary: 'Matches the reference creature.',
      issue: null as unknown as string | undefined,
    }),
  ]);

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: true,
      includeBubbleChecks: false,
      referenceImages: [
        {
          characterName: 'Graphic novel page 3 layout template',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'layout_template',
        },
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'turnaround',
        },
        {
          characterName: 'Druzhok',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'turnaround',
        },
      ],
    },
    { visionModel: 'gemini-test' }
  );

  assert.strictEqual(result.validationAttemptKind, 'segmented_parallel');
  assert.strictEqual(result.validationModelUsed, 'gemini-test');
  assert.strictEqual(result.characterCount, 1);
  assert.strictEqual(result.expectedCharacterCount, 2);
  assert.strictEqual(result.hasExtraPanelStructure, true);
  assert.match(result.layoutFeedback ?? '', /visually split/);
  assert.strictEqual(result.characters.find((c) => c.name === 'Lera')?.found, false);
  assert.strictEqual(result.characters.find((c) => c.name === 'Druzhok')?.found, true);

  assert.strictEqual(primary.calls.length, 3);
  const layoutCall = primary.calls.find((call) => call.prompt.includes('layout/artifact quality'));
  const leraCall = primary.calls.find((call) => call.prompt.includes('EXPECTED CHARACTER: "Lera"'));
  assert.ok(layoutCall, 'layout pass should run');
  assert.ok(leraCall, 'Lera character pass should run');
  assert.match(leraCall.prompt, /validate exactly ONE expected character/);
  assert.doesNotMatch(leraCall.prompt, /GRAPHIC NOVEL LAYOUT CHECKS/);
  assert.doesNotMatch(leraCall.prompt, /EXPECTED CHARACTER: "Druzhok"/);
  assert.strictEqual(leraCall.imageData?.length, 2);

  const manifest = result.requestManifest as {
    mode: string;
    imageOrder: string[];
    references: Array<{ referenceKind: string }>;
    passes: Array<{ passKind: string }>;
  };
  assert.strictEqual(manifest.mode, 'segmented_parallel_layout_plus_character_identity');
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_identity_turnaround_Lera',
    '3_identity_turnaround_Druzhok',
  ]);
  assert.ok(manifest.references.every((ref) => ref.referenceKind !== 'layout_template'));
  assert.deepStrictEqual(manifest.passes.map((pass) => pass.passKind).sort(), [
    'character_identity',
    'character_identity',
    'layout',
  ]);
}

async function testSegmentedValidationUsesOutfitPlateAsWardrobeGroundTruth() {
  const primary = new MockTextProvider([
    segmentedCharacterResult({
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
      sameOverallDesignRead: true,
      silhouetteDriftSeverity: 'none',
      identityComparisonSummary: 'Matches identity; outfit matches the outfit plate.',
      issue: null as unknown as string | undefined,
    }),
  ]);

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      expectedCharacters: [validationInput.expectedCharacters[0]],
      includeLayoutChecks: false,
      includeBubbleChecks: false,
      referenceImages: [
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'turnaround',
        },
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'outfit_plate',
        },
      ],
    },
    { visionModel: 'gemini-test' }
  );

  assert.strictEqual(primary.calls.length, 1);
  const leraCall = primary.calls[0];
  assert.strictEqual(leraCall.imageData?.length, 3);
  assert.match(leraCall.prompt, /Image 3 is the outfit plate/);
  assert.match(leraCall.prompt, /Set matchesOutfit=true/);
  assert.match(leraCall.prompt, /do not compare clothing to Image 2 identity\/default clothes/);
  assert.match(
    leraCall.prompt,
    /Identity-reference clothing must not make matchesOutfit=false/
  );

  const manifest = result.requestManifest as {
    imageOrder: string[];
    passes: Array<{
      passKind: string;
      imageOrder: Array<{ imageIndex: number; instructionText: string }>;
    }>;
  };
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_identity_turnaround_Lera',
    '3_outfit_plate_Lera',
  ]);
  assert.deepStrictEqual(
    manifest.passes[0].imageOrder.map((image) => image.imageIndex),
    [1, 2, 3]
  );
  assert.match(manifest.passes[0].imageOrder[2].instructionText, /OUTFIT PLATE for "Lera"/);
  assert.strictEqual(result.characters[0].matchesOutfit, true);
}

async function testGraphicNovelPanelValidationUsesSinglePanelArrayRequest() {
  const primary = new MockTextProvider([validGraphicNovelPanelResult()]);

  const result = await runGraphicNovelPanelImageValidation(
    primary,
    {
      imageData: TINY_PNG,
      mimeType: 'image/png',
      pageNumber: 1,
      pageCharacters: validationInput.expectedCharacters,
      panels: [
        {
          panelNumber: 1,
          panelId: 'p1-1',
          expectedVisualFocus: 'Lera opens the starry chest.',
          expectedSetting: 'Quiet attic room.',
          expectedCharacters: [validationInput.expectedCharacters[0]],
        },
      ],
      referenceImages: [
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'turnaround',
        },
      ],
    },
    {
      visionModel: 'gemini-test',
      operation: 'test_graphic_novel_panel_validation',
      recordModeration: false,
    }
  );

  assert.strictEqual(result.validationStatus, 'completed');
  assert.strictEqual(result.validationAttemptKind, 'comic_panel_page_page_1_primary');
  assert.strictEqual(result.validationModelUsed, 'gemini-test');
  assert.strictEqual(result.panels.length, 1);
  assert.strictEqual(result.panels[0].panelId, 'p1-1');
  assert.strictEqual(result.panels[0].characters[0].name, 'Lera');
  assert.strictEqual(result.panels[0].characters[0].found, false);

  assert.strictEqual(primary.calls.length, 1);
  assert.strictEqual(
    primary.calls[0].operation,
    'test_graphic_novel_panel_validation_comic_panels'
  );
  assert.match(primary.calls[0].prompt, /panel-by-panel in a single response/);
  assert.match(primary.calls[0].prompt, /Panel 1 \[p1-1\]/);
  assert.match(primary.calls[0].prompt, /PAGE CHARACTER ROSTER/);
  assert.match(primary.calls[0].prompt, /Page roster characters that should NOT be visible/);
  assert.match(primary.calls[0].prompt, /Druzhok/);
  assert.ok((primary.calls[0].schema.required || []).includes('panels'));
  assert.strictEqual(primary.calls[0].imageData?.length, 2);
  assert.match(primary.calls[0].imageData?.[0]?.instructionText ?? '', /GENERATED FULL COMIC PAGE/);
  assert.match(primary.calls[0].imageData?.[1]?.instructionText ?? '', /IDENTITY TURNAROUND/);

  const manifest = result.requestManifest as {
    mode: string;
    expectedPanels: Array<{ panelId: string }>;
    references: Array<{ characterName: string; imageIndex: number }>;
    passes: Array<{ passKind: string }>;
  };
  assert.strictEqual(manifest.mode, 'single_request_panel_array');
  assert.deepStrictEqual(
    manifest.expectedPanels.map((panel) => panel.panelId),
    ['p1-1']
  );
  assert.deepStrictEqual(
    manifest.references.map((ref) => [ref.characterName, ref.imageIndex]),
    [['Lera', 2]]
  );
  assert.deepStrictEqual(
    manifest.passes.map((pass) => pass.passKind),
    ['comic_panel_page']
  );
}

async function main() {
  await testFallbackAfterPrimaryBlocked();
  await testAllBlockedReturnsProviderBlocked();
  await testLayoutChecksSchemaAndPromptAreFlagged();
  await testLayoutTemplateReferenceIsIgnoredForValidation();
  await testUnreferencedCharacterKeepsDescriptionAndClearsReferenceFields();
  await testTurnaroundReferenceIsTracedInPromptAndManifest();
  await testSegmentedValidationRunsLayoutAndPerCharacterPasses();
  await testSegmentedValidationUsesOutfitPlateAsWardrobeGroundTruth();
  await testGraphicNovelPanelValidationUsesSinglePanelArrayRequest();
  console.log('imageValidationRun tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
