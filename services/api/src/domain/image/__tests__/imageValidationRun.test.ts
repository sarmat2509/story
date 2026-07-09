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

  constructor(
    private readonly responses: Array<
      unknown | Error | ((request: GenerateStructuredRequest<unknown>) => unknown | Error)
    >
  ) {}

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.calls.push(request as GenerateStructuredRequest<unknown>);
    const response = this.responses.shift();
    const next =
      typeof response === 'function'
        ? response(request as GenerateStructuredRequest<unknown>)
        : response;
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
    missingExpectedCharacters: [],
    characterBoundingBoxes: [
      {
        name: 'Lera',
        found: true,
        xMin: 0,
        yMin: 0,
        xMax: 1000,
        yMax: 1000,
        confidence: 100,
        visibility: 'full_body',
        notes: 'Lera occupies the tiny mock image.',
      },
      {
        name: 'Druzhok',
        found: true,
        xMin: 0,
        yMin: 0,
        xMax: 1000,
        yMax: 1000,
        confidence: 100,
        visibility: 'full_body',
        notes: 'Druzhok occupies the tiny mock image.',
      },
    ],
    hasArtworkOutsidePanelBounds: false,
    hasArtworkOverSpeechBubbles: false,
    hasExtraPanelStructure: true,
    hasUnexpectedCharacters: false,
    unexpectedCharacterNotes: null,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    layoutFeedback: 'one planned panel is visually split',
    overallFeedback: 'Layout has an extra split panel.',
  };
}

function segmentedLayoutResultWithDruzhokDuplicate() {
  const result = segmentedLayoutResult();
  return {
    ...result,
    characterBoundingBoxes: result.characterBoundingBoxes.map((box) =>
      box.name === 'Druzhok'
        ? {
            ...box,
            duplicated: true,
            duplicateCount: 2,
            duplicateNotes: 'One copy is visible near the top and another copy is lower left.',
          }
        : {
            ...box,
            duplicated: false,
            duplicateCount: box.found ? 1 : 0,
            duplicateNotes: null,
          }
    ),
  };
}

function segmentedLayoutResultWithDruzhokNotVisible() {
  const result = segmentedLayoutResult();
  return {
    ...result,
    missingExpectedCharacters: ['Druzhok'],
    characterBoundingBoxes: result.characterBoundingBoxes.map((box) =>
      box.name === 'Druzhok'
        ? {
            ...box,
            found: false,
            xMin: 0,
            yMin: 0,
            xMax: 0,
            yMax: 0,
            confidence: 0,
            visibility: 'not_visible',
            duplicated: false,
            duplicateCount: 0,
            duplicateNotes: null,
            notes: 'No visible Druzhok candidate exists in the image.',
          }
        : {
            ...box,
            duplicated: false,
            duplicateCount: box.found ? 1 : 0,
            duplicateNotes: null,
          }
    ),
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

function segmentedCharacterResultByPrompt(
  characters: Record<string, ImageValidationResult['characters'][number]>
): (request: GenerateStructuredRequest<unknown>) => Record<string, unknown> {
  return (request) => {
    const name = Object.keys(characters).find((candidate) =>
      request.prompt.includes(`EXPECTED CHARACTER: "${candidate}"`)
    );
    assert.ok(name, `No mock segmented character result for prompt: ${request.prompt}`);
    return segmentedCharacterResult(characters[name]);
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
  assert.doesNotMatch(primary.calls[0].prompt, /"Lera" -> Image \d/);
  assert.match(primary.calls[0].prompt, /"Druzhok" -> Image 2 \[IMAGINARY_CREATURE; IDENTITY\]/);
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
    /IDENTITY TURNAROUND reference/
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
  const characterResponse = segmentedCharacterResultByPrompt({
    Lera: {
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
    },
    Druzhok: {
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
    },
  });
  const primary = new MockTextProvider([
    segmentedLayoutResult(),
    characterResponse,
    characterResponse,
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
  assert.deepStrictEqual(result.missingExpectedCharacters, ['Lera']);
  assert.strictEqual(result.hasExtraPanelStructure, true);
  assert.match(result.layoutFeedback ?? '', /visually split/);
  assert.strictEqual(result.characters.find((c) => c.name === 'Lera')?.found, false);
  assert.strictEqual(result.characters.find((c) => c.name === 'Druzhok')?.found, true);
  assert.deepStrictEqual(result.characters.find((c) => c.name === 'Lera')?.characterBoundingBox, {
    found: true,
    xMin: 0,
    yMin: 0,
    xMax: 1000,
    yMax: 1000,
    confidence: 100,
    visibility: 'full_body',
    duplicated: false,
    duplicateCount: 1,
    duplicateNotes: null,
    notes: 'Lera occupies the tiny mock image.',
  });
  assert.deepStrictEqual(result.characters.find((c) => c.name === 'Lera')?.characterCropRect, {
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  });

  assert.strictEqual(primary.calls.length, 3);
  const layoutCall = primary.calls.find((call) =>
    call.prompt.includes('validate expected cast and global image quality')
  );
  const leraCall = primary.calls.find((call) => call.prompt.includes('EXPECTED CHARACTER: "Lera"'));
  const druzhokCall = primary.calls.find((call) =>
    call.prompt.includes('EXPECTED CHARACTER: "Druzhok"')
  );
  assert.ok(layoutCall, 'layout pass should run');
  assert.ok(leraCall, 'Lera character pass should run');
  assert.ok(druzhokCall, 'Druzhok character pass should run');
  assert.strictEqual(layoutCall.imageData?.length, 3);
  assert.match(layoutCall.prompt, /IDENTITY REFERENCES FOR BBOX LABELING/);
  assert.match(layoutCall.prompt, /Image 2: turnaround identity reference for "Lera"/);
  assert.match(layoutCall.prompt, /Image 3: turnaround identity reference for "Druzhok"/);
  assert.match(layoutCall.prompt, /EXPECTED CHARACTER STAGING HINTS/);
  assert.match(layoutCall.prompt, /trust the stable visual identity from the reference image/);
  assert.match(layoutCall.prompt, /scan the whole Image 1 for ALL visible copies/);
  assert.match(layoutCall.prompt, /dog-like fairy as a chicken-like creature/);
  assert.match(layoutCall.prompt, /Lera \(human; identity reference=Image 2\)/);
  assert.match(layoutCall.prompt, /Druzhok \(imaginary; identity reference=Image 3\)/);
  assert.match(leraCall.prompt, /validate exactly ONE expected HUMAN character/);
  assert.match(leraCall.prompt, /full-image QA pass handles duplicate detection/);
  assert.match(leraCall.prompt, /Do not search outside this crop/);
  assert.match(leraCall.prompt, /found=true only when the cropped candidate/);
  assert.doesNotMatch(leraCall.prompt, /Search Image 1/);
  assert.doesNotMatch(leraCall.prompt, /duplicated=true only means/);
  assert.doesNotMatch(leraCall.prompt, /GRAPHIC NOVEL LAYOUT CHECKS/);
  assert.doesNotMatch(leraCall.prompt, /EXPECTED CHARACTER: "Druzhok"/);
  assert.doesNotMatch(leraCall.prompt, /DESCRIPTION:/);
  assert.doesNotMatch(leraCall.prompt, /Young girl beside the starry chest/);
  assert.match(leraCall.prompt, /Compare Image 1 against Image 2 only/);
  assert.match(leraCall.prompt, /SCENE-SPECIFIC POSE\/PROP CONTEXT/);
  assert.match(leraCall.prompt, /one hand pressed on the chest lid/);
  assert.match(leraCall.prompt, /Human face visibility rule/);
  assert.match(leraCall.prompt, /Human hair rule/);
  assert.match(leraCall.prompt, /Scene prop handling/);
  assert.strictEqual(leraCall.imageData?.length, 2);
  assert.match(
    druzhokCall.prompt,
    /validate exactly ONE expected IMAGINARY CREATURE character/
  );
  assert.match(druzhokCall.prompt, /species\/subtype read/);
  assert.match(
    druzhokCall.prompt,
    /Set faceMatchesReference=null, hairMatchesReference=null, and ageReadMatchesReference=null/
  );
  assert.match(druzhokCall.prompt, /Visible-anchor scoring/);
  assert.match(druzhokCall.prompt, /Biological\/design anchors outrank accessories/);
  assert.match(druzhokCall.prompt, /matching hat\/wing\/prop alone never proves identity/);
  assert.match(druzhokCall.prompt, /cap recognizableScore at 0\.6/);
  assert.match(druzhokCall.prompt, /cap recognizableScore at 0\.55/);
  assert.match(druzhokCall.prompt, /full-image QA pass handles duplicate detection/);
  assert.match(druzhokCall.prompt, /Do not search outside this crop/);
  assert.match(druzhokCall.prompt, /found=true only when the cropped candidate/);
  assert.doesNotMatch(druzhokCall.prompt, /Search Image 1/);
  assert.doesNotMatch(druzhokCall.prompt, /duplicated=true only means/);
  assert.doesNotMatch(druzhokCall.prompt, /Human face visibility rule/);
  assert.doesNotMatch(druzhokCall.prompt, /Human hair rule/);
  assert.doesNotMatch(druzhokCall.prompt, /For humans use/);
  assert.doesNotMatch(druzhokCall.prompt, /For animals\/imaginary creatures use/);

  const manifest = result.requestManifest as {
    mode: string;
    imageOrder: string[];
    references: Array<{ referenceKind: string }>;
    characterBoundingBoxes: unknown[];
    characterCrops: unknown[];
    passes: Array<{ passKind: string }>;
  };
  assert.strictEqual(manifest.mode, 'segmented_parallel_scene_qa_layout_plus_character_identity');
  assert.strictEqual(manifest.characterBoundingBoxes.length, 2);
  assert.strictEqual(manifest.characterCrops.length, 2);
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_identity_turnaround_Lera',
    '3_identity_turnaround_Druzhok',
  ]);
  assert.ok(manifest.references.every((ref) => ref.referenceKind !== 'layout_template'));
  assert.deepStrictEqual(manifest.passes.map((pass) => pass.passKind).sort(), [
    'character_identity',
    'character_identity',
    'scene_qa',
  ]);
}

async function testSceneQaDuplicateEvidenceOverridesSingleCropResult() {
  const characterResponse = segmentedCharacterResultByPrompt({
    Lera: {
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
      identityComparisonSummary: 'Matches the reference child.',
      issue: null as unknown as string | undefined,
    },
    Druzhok: {
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
      identityComparisonSummary: 'The cropped creature matches the reference.',
      issue: null as unknown as string | undefined,
    },
  });
  const primary = new MockTextProvider([
    segmentedLayoutResultWithDruzhokDuplicate(),
    characterResponse,
    characterResponse,
  ]);

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: false,
      includeBubbleChecks: false,
    },
    { visionModel: 'gemini-test' }
  );

  assert.match(primary.calls[0].prompt, /duplicateCount/);
  assert.strictEqual(result.characterCount, 3);
  assert.strictEqual(result.expectedCharacterCount, 2);
  const druzhok = result.characters.find((character) => character.name === 'Druzhok');
  assert.ok(druzhok, 'Druzhok validation should be present');
  assert.strictEqual(druzhok.duplicated, true);
  assert.match(druzhok.issue ?? '', /Duplicate visible copies detected \(2\)/);

  const manifest = result.requestManifest as {
    characterBoundingBoxes: Array<{ name: string; duplicated?: boolean; duplicateCount?: number }>;
  };
  const druzhokBox = manifest.characterBoundingBoxes.find((box) => box.name === 'Druzhok');
  assert.strictEqual(druzhokBox?.duplicated, true);
  assert.strictEqual(druzhokBox?.duplicateCount, 2);
}

async function testSceneQaMissingCharacterSkipsCropValidation() {
  const characterResponse = segmentedCharacterResultByPrompt({
    Lera: {
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
      identityComparisonSummary: 'Matches the reference child.',
      issue: null as unknown as string | undefined,
    },
  });
  const primary = new MockTextProvider([
    segmentedLayoutResultWithDruzhokNotVisible(),
    characterResponse,
  ]);

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: false,
      includeBubbleChecks: false,
    },
    { visionModel: 'gemini-test' }
  );

  assert.strictEqual(primary.calls.length, 2);
  assert.ok(
    primary.calls.some((call) => call.prompt.includes('EXPECTED CHARACTER: "Lera"')),
    'visible character crop should be validated'
  );
  assert.ok(
    !primary.calls.some((call) => call.prompt.includes('EXPECTED CHARACTER: "Druzhok"')),
    'not-visible character should not run a crop validator'
  );
  const druzhok = result.characters.find((character) => character.name === 'Druzhok');
  assert.ok(druzhok, 'Druzhok validation should be present');
  assert.strictEqual(druzhok.found, false);
  assert.strictEqual(druzhok.characterCropRect, null);
  assert.match(druzhok.issue ?? '', /scene_qa_marked_not_visible/);
  assert.deepStrictEqual(result.missingExpectedCharacters, ['Druzhok']);

  const manifest = result.requestManifest as {
    characterCrops: Array<{
      characterName: string;
      status: string;
      normalizedBox?: Record<string, unknown>;
      cropRect?: Record<string, unknown>;
      cropMimeType?: string;
      inlineBase64Chars?: number;
    }>;
  };
  const leraCrop = manifest.characterCrops.find((crop) => crop.characterName === 'Lera');
  assert.ok(leraCrop, 'Lera crop manifest should exist');
  assert.strictEqual(leraCrop.status, 'cropped');
  assert.deepStrictEqual(leraCrop.normalizedBox, {
    name: 'Lera',
    found: true,
    xMin: 0,
    yMin: 0,
    xMax: 1000,
    yMax: 1000,
    confidence: 100,
    visibility: 'full_body',
    duplicated: false,
    duplicateCount: 1,
    duplicateNotes: null,
    notes: 'Lera occupies the tiny mock image.',
  });
  assert.deepStrictEqual(leraCrop.cropRect, { left: 0, top: 0, width: 1, height: 1 });
  assert.strictEqual(leraCrop.cropMimeType, 'image/png');
  assert.ok((leraCrop.inlineBase64Chars ?? 0) > 0);

  const druzhokCrop = manifest.characterCrops.find((crop) => crop.characterName === 'Druzhok');
  assert.ok(druzhokCrop, 'Druzhok missing manifest should exist');
  assert.deepStrictEqual(druzhokCrop, {
    characterName: 'Druzhok',
    status: 'scene_qa_marked_not_visible',
    normalizedBox: {
      name: 'Druzhok',
      found: false,
      xMin: 0,
      yMin: 0,
      xMax: 0,
      yMax: 0,
      confidence: 0,
      visibility: 'not_visible',
      duplicated: false,
      duplicateCount: 0,
      duplicateNotes: null,
      notes: 'No visible Druzhok candidate exists in the image.',
    },
  });
}

async function testSegmentedValidationUsesDressedReferenceAsWardrobeGroundTruth() {
  const primary = new MockTextProvider([
    segmentedLayoutResult(),
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
      identityComparisonSummary: 'Matches the dressed character reference.',
      issue: null as unknown as string | undefined,
    }),
  ]);

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      expectedCharacters: [{ ...validationInput.expectedCharacters[0], validateOutfit: true }],
      includeLayoutChecks: false,
      includeBubbleChecks: false,
      referenceImages: [
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'dressed_turnaround',
        },
      ],
    },
    { visionModel: 'gemini-test' }
  );

  assert.strictEqual(primary.calls.length, 2);
  const leraCall = primary.calls.find((call) => call.prompt.includes('EXPECTED CHARACTER: "Lera"'));
  assert.ok(leraCall, 'Lera character pass should run');
  assert.strictEqual(leraCall.imageData?.length, 2);
  assert.match(leraCall.prompt, /Image 2 is this character dressed turnaround reference/);
  assert.doesNotMatch(leraCall.prompt, /outfit plate/i);
  assert.doesNotMatch(leraCall.prompt, /DESCRIPTION:/);
  assert.doesNotMatch(leraCall.prompt, /Young girl beside the starry chest/);
  assert.match(leraCall.prompt, /Compare Image 1 against Image 2 only/);
  assert.match(leraCall.prompt, /SCENE-SPECIFIC POSE\/PROP CONTEXT/);
  assert.match(leraCall.prompt, /one hand pressed on the chest lid/);
  assert.match(leraCall.prompt, /held\/carried props/);
  assert.match(leraCall.prompt, /Set matchesOutfit=true/);
  assert.match(leraCall.prompt, /evaluate outfit against Image 2 only/);
  assert.deepStrictEqual(
    leraCall.inputParts?.map((part) => part.type),
    ['text', 'image', 'text', 'image', 'text']
  );
  assert.match(
    leraCall.inputParts?.[0]?.type === 'text' ? leraCall.inputParts[0].text : '',
    /Image 1: GENERATED CHARACTER CROP/
  );
  assert.match(
    leraCall.inputParts?.[2]?.type === 'text' ? leraCall.inputParts[2].text : '',
    /DRESSED TURNAROUND reference for "Lera"/
  );
  assert.match(
    leraCall.inputParts?.[4]?.type === 'text' ? leraCall.inputParts[4].text : '',
    /EXPECTED CHARACTER: "Lera"/
  );

  const manifest = result.requestManifest as {
    imageOrder: string[];
    passes: Array<{
      passKind: string;
      imageOrder: Array<{ imageIndex: number; instructionText: string }>;
      input: Array<{ type: string; text?: string }>;
    }>;
  };
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_dressed_turnaround_Lera',
  ]);
  const leraPass = manifest.passes.find((pass) => pass.passKind === 'character_identity');
  assert.ok(leraPass, 'Lera character pass should be recorded');
  assert.deepStrictEqual(
    leraPass.imageOrder.map((image) => image.imageIndex),
    [1, 2]
  );
  assert.match(leraPass.imageOrder[1].instructionText, /DRESSED TURNAROUND reference for "Lera"/);
  assert.deepStrictEqual(
    leraPass.input.map((part) => part.type),
    ['text', 'image', 'text', 'image', 'text']
  );
  assert.strictEqual(result.characters[0].matchesOutfit, true);
}

async function testSegmentedCharacterWithoutReferenceKeepsDescriptionFallback() {
  const primary = new MockTextProvider([
    segmentedLayoutResult(),
    segmentedCharacterResult({
      name: 'Lera',
      characterKind: 'human',
      found: false,
      duplicated: false,
      recognizableScore: 0.1,
      faceMatchesReference: null,
      hairMatchesReference: null,
      ageReadMatchesReference: null,
      proportionsMatchReference: null,
      matchesColors: false,
      matchesOutfit: true,
      sameOverallDesignRead: null,
      silhouetteDriftSeverity: null,
      actualVisibleDescription: null,
      identityComparisonSummary: 'No matching child candidate is visible.',
      issue: 'missing',
    }),
    segmentedCharacterResult({
      name: 'Druzhok',
      characterKind: 'imaginary',
      found: false,
      duplicated: false,
      recognizableScore: 0.1,
      faceMatchesReference: null,
      hairMatchesReference: null,
      ageReadMatchesReference: null,
      proportionsMatchReference: null,
      matchesColors: false,
      matchesOutfit: true,
      sameOverallDesignRead: null,
      silhouetteDriftSeverity: null,
      actualVisibleDescription: null,
      identityComparisonSummary: 'No matching creature candidate is visible.',
      issue: 'missing',
    }),
  ]);

  await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: false,
      includeBubbleChecks: false,
      referenceImages: [],
    },
    { visionModel: 'gemini-test' }
  );

  const leraCall = primary.calls.find((call) => call.prompt.includes('EXPECTED CHARACTER: "Lera"'));
  const druzhokCall = primary.calls.find((call) =>
    call.prompt.includes('EXPECTED CHARACTER: "Druzhok"')
  );
  assert.ok(leraCall, 'Lera character pass should run without reference');
  assert.ok(druzhokCall, 'Druzhok character pass should run without reference');
  assert.match(leraCall.prompt, /No identity reference is attached/);
  assert.match(leraCall.prompt, /validate exactly ONE expected HUMAN character/);
  assert.match(leraCall.prompt, /DESCRIPTION: Young girl beside the starry chest\./);
  assert.match(druzhokCall.prompt, /No identity reference is attached/);
  assert.match(druzhokCall.prompt, /validate exactly ONE expected IMAGINARY CREATURE character/);
  assert.match(
    druzhokCall.prompt,
    /DESCRIPTION: Small robo-dog with a light on the chest or forehead area\./
  );
  assert.doesNotMatch(druzhokCall.prompt, /Human face visibility rule/);
  assert.strictEqual(leraCall.imageData?.length, 1);
}

async function testGraphicNovelSinglePanelValidationUsesSegmentedSceneValidator() {
  const primary = new MockTextProvider([
    {
      missingExpectedCharacters: [],
      characterBoundingBoxes: [
        {
          name: 'Lera',
          found: true,
          xMin: 0,
          yMin: 0,
          xMax: 1000,
          yMax: 1000,
          confidence: 100,
          visibility: 'full_body',
          notes: 'Lera occupies the tiny mock panel.',
        },
      ],
      hasUnexpectedCharacters: false,
      unexpectedCharacterNotes: null,
      hasTextOrLetters: false,
      hasRenderingArtifacts: false,
      overallFeedback: 'Single panel scene QA passed.',
    },
    segmentedCharacterResult({
      name: 'Lera',
      characterKind: 'human',
      found: false,
      duplicated: false,
      recognizableScore: 0.1,
      faceMatchesReference: false,
      hairMatchesReference: false,
      ageReadMatchesReference: false,
      proportionsMatchReference: false,
      matchesColors: false,
      matchesOutfit: true,
      sameOverallDesignRead: false,
      silhouetteDriftSeverity: 'severe',
      actualVisibleDescription: 'different child in the panel',
      identityComparisonSummary: 'The expected child is not visible in this panel.',
      issue: 'character missing from panel',
    }),
  ]);

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
  assert.strictEqual(result.validationAttemptKind, 'segmented_parallel');
  assert.strictEqual(result.validationModelUsed, 'gemini-test');
  assert.strictEqual(result.expectedPanelCount, 1);
  assert.strictEqual(result.detectedPanelCount, 1);
  assert.strictEqual(result.panels.length, 1);
  assert.strictEqual(result.panels[0].panelId, 'p1-1');
  assert.strictEqual(result.panels[0].characters[0].name, 'Lera');
  assert.strictEqual(result.panels[0].characters[0].found, false);
  assert.match(result.panels[0].panelIssue ?? '', /character missing from panel/);

  assert.strictEqual(primary.calls.length, 2);
  const sceneQaCall = primary.calls.find((call) =>
    call.prompt.includes('validate expected cast and global image quality')
  );
  const characterCall = primary.calls.find((call) =>
    call.prompt.includes('EXPECTED CHARACTER: "Lera"')
  );
  assert.ok(sceneQaCall, 'scene QA pass should run');
  assert.ok(characterCall, 'character identity pass should run');
  assert.strictEqual(sceneQaCall.operation, 'test_graphic_novel_panel_validation_scene_qa');
  assert.strictEqual(
    characterCall.operation,
    'test_graphic_novel_panel_validation_character_identity'
  );
  assert.doesNotMatch(sceneQaCall.prompt, /panel-by-panel in a single response/);
  assert.doesNotMatch(sceneQaCall.prompt, /PAGE CHARACTER ROSTER/);
  assert.doesNotMatch(characterCall.prompt, /Panel 1 \[p1-1\]/);
  assert.ok(!(sceneQaCall.schema.required || []).includes('panels'));
  assert.ok((sceneQaCall.schema.required || []).includes('missingExpectedCharacters'));
  assert.strictEqual(sceneQaCall.imageData?.length, 1);
  assert.strictEqual(characterCall.imageData?.length, 2);
  assert.match(characterCall.imageData?.[0]?.instructionText ?? '', /GENERATED CHARACTER CROP/);
  assert.match(characterCall.imageData?.[1]?.instructionText ?? '', /IDENTITY TURNAROUND/);
  assert.doesNotMatch(characterCall.prompt, /DESCRIPTION:/);
  assert.doesNotMatch(characterCall.prompt, /Young girl beside the starry chest/);
  assert.match(characterCall.prompt, /validate exactly ONE expected HUMAN character/);
  assert.match(characterCall.prompt, /Compare Image 1 against Image 2 only/);
  assert.match(characterCall.prompt, /Human face visibility rule/);
  assert.match(characterCall.prompt, /faceMatchesReference=null/);
  assert.match(characterCall.prompt, /SCENE-SPECIFIC POSE\/PROP CONTEXT/);
  assert.match(characterCall.prompt, /Scene prop handling/);
  assert.deepStrictEqual(
    characterCall.inputParts?.map((part) => part.type),
    ['text', 'image', 'text', 'image', 'text']
  );

  const manifest = result.requestManifest as {
    mode: string;
    includeWardrobeChecks: boolean;
    imageOrder: string[];
    references: Array<{ characterName: string; imageIndex: number }>;
    passes: Array<{ passKind: string; input: Array<{ type: string }> }>;
    graphicNovelPanelAdapter: {
      mode: string;
      pageNumber: number;
      panelNumber: number;
      panelId: string;
    };
  };
  assert.strictEqual(manifest.mode, 'segmented_parallel_scene_qa_plus_character_identity');
  assert.strictEqual(manifest.includeWardrobeChecks, true);
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_identity_turnaround_Lera',
  ]);
  assert.deepStrictEqual(
    manifest.references.map((ref) => [ref.characterName, ref.imageIndex]),
    [['Lera', 2]]
  );
  assert.deepStrictEqual(
    manifest.passes.map((pass) => pass.passKind),
    ['scene_qa', 'character_identity']
  );
  assert.deepStrictEqual(
    manifest.passes[1].input.map((part) => part.type),
    ['text', 'image', 'text', 'image', 'text']
  );
  assert.deepStrictEqual(manifest.graphicNovelPanelAdapter, {
    mode: 'single_panel_segmented',
    pageNumber: 1,
    panelNumber: 1,
    panelId: 'p1-1',
  });
}

async function testGraphicNovelMultiPanelPromptUsesTurnaroundInsteadOfDescription() {
  const primary = new MockTextProvider([
    {
      pageNumber: 1,
      expectedPanelCount: 2,
      detectedPanelCount: 2,
      hasExtraPanelStructure: false,
      hasTextOrLetters: false,
      hasRenderingArtifacts: false,
      layoutFeedback: 'Two visible panels match the expected page plan.',
      panels: [
        {
          ...validGraphicNovelPanelResult().panels[0],
          panelNumber: 1,
          panelId: 'p1-1',
        },
        {
          ...validGraphicNovelPanelResult().panels[0],
          panelNumber: 2,
          panelId: 'p1-2',
        },
      ],
      overallFeedback: 'Panel validation completed.',
    },
  ]);

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
        {
          panelNumber: 2,
          panelId: 'p1-2',
          expectedVisualFocus: 'Druzhok guards the chest.',
          expectedSetting: 'Quiet attic room.',
          expectedCharacters: [validationInput.expectedCharacters[1]],
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

  assert.strictEqual(primary.calls.length, 1);
  assert.match(primary.calls[0].prompt, /Image 2: turnaround identity reference for "Lera"/);
  assert.match(primary.calls[0].prompt, /- Lera \(human; reference=Image 2\)/);
  assert.doesNotMatch(primary.calls[0].prompt, /Lera \(human; description=/);
  assert.doesNotMatch(primary.calls[0].prompt, /Young girl beside the starry chest/);
  assert.match(
    primary.calls[0].prompt,
    /Druzhok \(imaginary; description=Small robo-dog with a light on the chest or forehead area\./
  );

  const manifest = result.requestManifest as { prompt: string; mode: string };
  assert.strictEqual(manifest.mode, 'single_request_panel_array');
  assert.doesNotMatch(manifest.prompt, /Young girl beside the starry chest/);
  assert.match(manifest.prompt, /Lera \(human; reference=Image 2/);
}

async function main() {
  await testFallbackAfterPrimaryBlocked();
  await testAllBlockedReturnsProviderBlocked();
  await testLayoutChecksSchemaAndPromptAreFlagged();
  await testLayoutTemplateReferenceIsIgnoredForValidation();
  await testUnreferencedCharacterKeepsDescriptionAndClearsReferenceFields();
  await testTurnaroundReferenceIsTracedInPromptAndManifest();
  await testSegmentedValidationRunsLayoutAndPerCharacterPasses();
  await testSceneQaDuplicateEvidenceOverridesSingleCropResult();
  await testSceneQaMissingCharacterSkipsCropValidation();
  await testSegmentedValidationUsesDressedReferenceAsWardrobeGroundTruth();
  await testSegmentedCharacterWithoutReferenceKeepsDescriptionFallback();
  await testGraphicNovelSinglePanelValidationUsesSegmentedSceneValidator();
  await testGraphicNovelMultiPanelPromptUsesTurnaroundInsteadOfDescription();
  console.log('imageValidationRun tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
