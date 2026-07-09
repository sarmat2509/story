import assert from 'node:assert/strict';
import { buildSceneImagePrompt, buildImageSystemInstruction, buildEnvironmentImagePrompt } from '../image/ImagePrompts';
import { ImageDomainService } from '../../domain/image/ImageDomainService';

const forbiddenSyntheticAlias = ['Sub', 'ject'].join('');

function testReferenceBackedCharacterDoesNotDuplicateTextIdentity() {
  const prompt = buildSceneImagePrompt({
    sceneVisual: {
      setting: 'Cozy library corner with an open picture book on the table.',
      cameraComposition: {
        shot: 'Medium-wide shot at child eye-level',
        characters: [
          {
            name: 'Mia',
            description: 'foreground left, leaning over the table, curious expression, looking at the book',
            outfitId: 'o_mia_1',
          },
        ],
      },
      lighting: 'Warm afternoon window light',
    },
    ageGroup: '6-8',
    style: 'soft_watercolor',
    hasReferences: true,
    referenceCharacterNames: [{ name: 'Mia', isTurnaround: true }],
    realWorldCharacters: [
      { name: 'Mia', description: '8-year-old girl with short brown hair, freckles, and a yellow raincoat' },
    ],
    imageIndexMap: new Map([['Mia', 1]]),
  });

  assert.doesNotMatch(prompt, /match the full character design from the sheet/i);
  assert.doesNotMatch(prompt, /match the attached full character reference image/i);
  assert.doesNotMatch(prompt, /MUST AVOID any kind of text/);
  assert.doesNotMatch(prompt, /keep free of text/i);
  assert.ok(!prompt.includes('Mia'));
  assert.ok(!prompt.includes('8-year-old girl with short brown hair'));
  assert.ok(!prompt.includes('freckles'));
  assert.ok(!prompt.includes('yellow raincoat'));
}

function testLegacyUserPromptKeepsTextBanInSystemOnly() {
  const prompt = buildSceneImagePrompt({
    visualPrompt: 'A bright meadow with a red kite flying over flowers.',
    ageGroup: '6-8',
    style: 'soft_watercolor',
    hasReferences: false,
  });

  assert.doesNotMatch(prompt, /MUST AVOID any kind of text/);
  assert.doesNotMatch(prompt, /Keep the frame free of words/i);
  assert.doesNotMatch(prompt, /keep free of text/i);
  assert.doesNotMatch(prompt, /avoid:.*\btext\b/i);
  assert.doesNotMatch(prompt, /avoid:.*\bletters\b/i);
  assert.doesNotMatch(prompt, /avoid:.*\btypography\b/i);
}

function testStructuredPromptSanitizesStyleIntentAndCrossScriptNoise() {
  const prompt = buildSceneImagePrompt({
    sceneVisual: {
      setting:
        'A stone castle interior at the mouth of an ancient tunnel. A watercolor children’s-book look with soft washes and paper texture. [STYLE: Describe with nocturnal calm palette.] Fine dust motes drift near the tunnel mouth.',
      cameraComposition: {
        shot: 'Medium-wide shot at child eye-level',
        characters: [
          {
            name: 'Емілія',
            description:
              'foreground center-left beside Emilia, one hand lifted to adjust her high ponytail, freckles visible, body angle leaning slightly forward as if ready to enter',
            outfitId: 'o-emilia-1',
          },
        ],
      },
      lighting: 'Soft daylight from the right with gentle stone highlights.',
    },
    ageGroup: '6-8',
    style: 'soft_watercolor',
    hasReferences: true,
    referenceCharacterNames: [{ name: 'Емілія', isTurnaround: true }],
    imageIndexMap: new Map([['Емілія', 1]]),
  });

  assert.ok(prompt.includes('- Scene: A stone castle interior at the mouth of an ancient tunnel.'));
  assert.ok(!prompt.includes('children’s-book look'));
  assert.ok(!prompt.includes('paper texture'));
  assert.ok(!prompt.includes('[STYLE:'));
  assert.ok(!prompt.includes('Describe with nocturnal calm palette'));
  assert.ok(prompt.includes('Character REF_IMAGE_1 is located foreground center-left beside REF_IMAGE_1'));
  assert.ok(!prompt.includes('Емілія'));
  assert.ok(!prompt.includes('Emilia'));
  assert.ok(!prompt.includes('as if ready to enter'));
}

function testStructuredPromptReplacesLocalizedCharacterNameAliases() {
  const prompt = buildSceneImagePrompt({
    sceneVisual: {
      setting: 'Эмилия studies the glowing map while Emilia holds the lantern.',
      cameraComposition: {
        shot: 'Medium shot at child eye-level, framing Emilie near the table',
        characters: [
          {
            name: 'Емілія',
            description: 'foreground center, Эмилия points at the map with a calm expression',
            outfitId: 'o-emilia-1',
          },
        ],
      },
      lighting: 'Warm light near Emilia, cooler shadows behind Эмилия.',
    },
    ageGroup: '6-8',
    style: 'soft_watercolor',
    hasReferences: true,
    referenceCharacterNames: [
      { name: 'Емілія', isTurnaround: true, nameAliases: ['Emilia', 'Эмилия', 'Emilie'] },
    ],
    imageIndexMap: new Map([['Емілія', 1]]),
  });

  assert.ok(prompt.includes('REF_IMAGE_1 studies the glowing map while REF_IMAGE_1 holds the lantern.'));
  assert.ok(prompt.includes('framing REF_IMAGE_1 near the table'));
  assert.ok(prompt.includes('Character REF_IMAGE_1 is located foreground center, REF_IMAGE_1 points at the map'));
  assert.ok(prompt.includes('Warm light near REF_IMAGE_1, cooler shadows behind REF_IMAGE_1.'));
  assert.ok(!prompt.includes('Емілія'));
  assert.ok(!prompt.includes('Emilia'));
  assert.ok(!prompt.includes('Эмилия'));
  assert.ok(!prompt.includes('Emilie'));
}

function testStructuredPromptUsesReferenceBindingIdsForDirectedActionText() {
  const prompt = buildSceneImagePrompt({
    sceneVisual: {
      setting: 'A quiet spaceship corridor with a round glowing doorway.',
      cameraComposition: {
        shot: 'Medium-wide shot: Emilia enters the spaceship through the glowing doorway.',
        characters: [
          {
            name: 'Emilia',
            description: 'foreground left, Emilia reaches toward the control panel',
          },
        ],
      },
      lighting: 'Cool blue corridor light around Emilia.',
    },
    ageGroup: '6-8',
    style: 'soft_watercolor',
    hasReferences: true,
    referenceCharacterNames: [{ name: 'Emilia', isTurnaround: true }],
    imageIndexMap: new Map([['Emilia', 1]]),
    referenceImages: [
      {
        referenceBindingId: 'REF_CH_EMILIA_TEST01',
        characterName: 'Emilia',
        referenceKind: 'character',
        imageIndex: 1,
        type: 'dressed_turnaround_reference',
      },
    ],
  });

  assert.ok(prompt.includes('REF_CH_EMILIA_TEST01 enters the spaceship'));
  assert.doesNotMatch(prompt, /match the full character design from the sheet/i);
  assert.ok(prompt.includes('Character REF_CH_EMILIA_TEST01 is located foreground left, REF_CH_EMILIA_TEST01 reaches toward the control panel'));
  assert.ok(prompt.includes('Cool blue corridor light around REF_CH_EMILIA_TEST01.'));
  assert.ok(!prompt.includes(forbiddenSyntheticAlias));
  assert.ok(!prompt.includes('Emilia'));
}

function testStructuredPromptKeepsSceneFirstAndStripsTextOutfitLanguage() {
  const prompt = buildSceneImagePrompt({
    sceneVisual: {
      setting: 'Lush tropical jungle at sunrise with a narrow dirt path and pink orchids in the foreground.',
      cameraComposition: {
        shot: 'Medium shot at child eye-level',
        characters: [
          {
            name: 'Емілія',
            description: 'foreground center on the path, standing, hands at the zipper, gaze angled down toward the jacket',
            outfitId: 'o-emilia-jungle',
          },
        ],
      },
      lighting: 'Soft golden dawn light through the canopy.',
    },
    ageGroup: '6-8',
    style: 'soft_watercolor',
    hasReferences: true,
    referenceCharacterNames: [{ name: 'Емілія', isTurnaround: true }],
    imageIndexMap: new Map([['Емілія', 1]]),
  });

  assert.ok(prompt.trimStart().startsWith('- Scene:'));
  assert.ok(!prompt.includes('- Wardrobe plates:'));
  assert.ok(!prompt.includes('Technical reference command'));
  assert.doesNotMatch(prompt, /Draw .* wearing/i);
  assert.doesNotMatch(prompt, /CLOTHES SOURCE/i);
  assert.ok(!prompt.includes('jacket'));
  assert.ok(!prompt.includes('zipper'));
  assert.ok(!prompt.includes('Емілія'));
}

function testReferenceBackedCharacterWithoutOutfitPlateKeepsReferenceClothes() {
  const prompt = buildSceneImagePrompt({
    sceneVisual: {
      setting: 'A sunny attic with a painted treasure chest.',
      cameraComposition: {
        shot: 'Medium shot at child eye-level',
        characters: [
          {
            name: 'Lera',
            description: 'foreground center, one hand on the chest lid, curious expression',
            outfitId: 'o-lera-day',
          },
        ],
      },
      lighting: 'Warm window light.',
    },
    ageGroup: '4-5',
    style: 'warm_3d',
    hasReferences: true,
    referenceCharacterNames: [{ name: 'Lera', isTurnaround: true }],
    imageIndexMap: new Map([['Lera', 2]]),
  });

  assert.doesNotMatch(prompt, /match the full character design from the sheet/i);
  assert.ok(!prompt.includes('Lera'));
  assert.ok(!prompt.includes('Outfit in this scene:'));
  assert.ok(!prompt.includes('Mustard-yellow sweater'));
}

function testTextOnlyCharacterDoesNotReceiveLegacyOutfitText() {
  const prompt = buildSceneImagePrompt({
    sceneVisual: {
      setting: 'A backstage dressing room.',
      cameraComposition: {
        shot: 'Medium shot',
        characters: [
          {
            name: 'Stage Helper',
            description: 'midground beside the curtain, holding a clipboard',
            outfitId: 'o-helper',
          },
        ],
      },
      lighting: 'Soft indoor light.',
    },
    ageGroup: '6-8',
    style: 'soft_watercolor',
    hasReferences: false,
    realWorldCharacters: [
      {
        name: 'Stage Helper',
        description: 'Friendly adult helper with a calm smile, blue crew vest, black trousers',
      },
    ],
    characterOutfits: {
      'Stage Helper': 'Blue crew vest, black trousers, comfortable sneakers',
    },
  } as Parameters<typeof buildSceneImagePrompt>[0] & { characterOutfits?: Record<string, string> });

  assert.ok(prompt.includes('- Stage Helper: Friendly adult helper with a calm smile'));
  assert.ok(!prompt.includes('Outfit in this scene:'));
  assert.ok(!prompt.includes('Blue crew vest'));
  assert.ok(!prompt.includes('blue crew vest'));
  assert.ok(!prompt.includes('black trousers'));
}

function testPlaceholderReferenceNameResolvesToSingleUnmatchedSceneCharacter() {
  const prompt = buildSceneImagePrompt({
    sceneVisual: {
      setting: 'A dim jungle fork with a darker side trail to the right.',
      cameraComposition: {
        shot: 'Medium-wide shot at child eye-level',
        characters: [
          {
            name: 'Hooded Stranger',
            description: 'mid-left beside the tree, one hand extended toward the darker trail',
            outfitId: 'o-hooded-stranger',
          },
        ],
      },
      lighting: 'Filtered daylight with deeper shade at the side trail entrance.',
    },
    ageGroup: '6-8',
    style: 'soft_watercolor',
    hasReferences: true,
    referenceCharacterNames: ['unknown'],
    realWorldCharacters: [
      {
        name: 'Hooded Stranger',
        description: 'Adult-height figure with face hidden in hood shadow.',
      },
    ],
    imageIndexMap: new Map([['unknown', 2]]),
  });

  assert.doesNotMatch(prompt, /match the full character reference/i);
  assert.ok(!prompt.includes('Outfit in this scene:'));
  assert.ok(!prompt.includes('- unknown (Image 2):'));
  assert.ok(!prompt.includes('Hooded Stranger'));
  assert.ok(!prompt.includes('Adult-height figure with face hidden in hood shadow.'));
}

function testSystemInstructionStatesReferenceIdentityWins() {
  const systemInstruction = buildImageSystemInstruction({
    style: 'soft_watercolor',
    ageGroup: '6-8',
    hasReferences: true,
    hasEnvironmentReference: true,
  });

  assert.ok(systemInstruction.includes('Character sheets establish locked IDENTITY'));
  assert.ok(systemInstruction.includes('MUST AVOID any kind of text'));
  assert.doesNotMatch(systemInstruction, /internal binding tokens/);
  assert.doesNotMatch(systemInstruction, /Reference IDs such as REF_CH_\*/);
  assert.doesNotMatch(systemInstruction, /Never render reference IDs/);
  assert.doesNotMatch(systemInstruction, /labels, captions, speech bubbles/);
  assert.doesNotMatch(systemInstruction, /outfit plate/i);
  assert.doesNotMatch(systemInstruction, /CLOTHES SOURCE/i);
  assert.doesNotMatch(systemInstruction, /draw the person from .* wearing/i);
  assert.doesNotMatch(systemInstruction, /CLOTHING:/);
  assert.doesNotMatch(systemInstruction, /Do not/i);
  assert.doesNotMatch(systemInstruction, /CONTACT GEOMETRY/i);
  assert.doesNotMatch(systemInstruction, /touches, opens, presses/i);
  assert.doesNotMatch(systemInstruction, /clay, felt, colored pencil, cel animation, 3D, comic ink, or watercolor/i);
  assert.ok(systemInstruction.includes('Preserve hair and facial identity faithfully'));
  assert.ok(systemInstruction.includes('ENVIRONMENT REFERENCE: The provided location image defines reusable layout'));
  assert.ok(systemInstruction.includes('Keep the same location and spatial relationships'));
}

function testEnvironmentPromptSanitizesCharacterOwnedLocations() {
  const gardenPrompt = buildEnvironmentImagePrompt({
    environment: {
      id: 'env_old_garden',
      name: 'Old overgrown garden',
      description:
        'An old overgrown garden in morning light. Behind the bench, a dense hedge of green bushes fills the background; a small arched gap in the bushes reveals the rounded rise of Matilda’s shell pushing up from under a thick layer of brown leaves.',
    },
  });
  const shellPrompt = buildEnvironmentImagePrompt({
    environment: {
      id: 'env_shell_forest',
      name: 'Matilda’s Shell Forest: Dew Springs Clearing',
      description:
        'On top of Matilda’s shell: a miniature forest clearing with springy mossy grass covering most of the ground. A dense patch of waist-high (to Emilia) fern thickets occupies the left midground. A large rounded gray boulder stands in the background right, its base surrounded by darker wet soil where snails gather. The shell’s curved edge is visible as a rough brown rim in the far background.',
    },
  });

  assert.ok(gardenPrompt.includes('ENVIRONMENT REFERENCE PLATE ONLY'));
  assert.ok(gardenPrompt.includes('style-neutral full-color location design plate'));
  assert.ok(gardenPrompt.includes('not line art'));
  assert.ok(gardenPrompt.includes('Do not lock the final art medium'));
  assert.ok(gardenPrompt.includes('Keep functional architectural elements physically anchored and usable'));
  assert.ok(gardenPrompt.includes('avoid freestanding doors, floating handles'));
  assert.ok(gardenPrompt.includes('large inert shell-shaped mound under a thick layer of brown leaves'));
  assert.ok(gardenPrompt.includes('no people, no characters, no animals, no creatures'));
  assert.ok(!gardenPrompt.includes('Matilda'));

  assert.ok(shellPrompt.includes('on top of a large inert shell-shaped landform'));
  assert.ok(shellPrompt.includes('small-story-scale height fern thickets'));
  assert.ok(shellPrompt.includes('small static traces remain'));
  assert.ok(shellPrompt.includes('render only an inert landform or prop'));
  assert.ok(!shellPrompt.includes('Matilda'));
  assert.ok(!shellPrompt.includes('Emilia'));
  assert.ok(!shellPrompt.includes('snails gather'));
}

async function testImageDomainUsesPerSceneEnvironmentReferenceFlag() {
  let capturedSystemInstruction = '';
  let capturedPrompt = '';
  let capturedAspectRatio = '';
  let capturedOperation = '';
  let capturedReferenceLabels: string[] = [];
  const imageProvider = {
    async generateImage(request: {
      prompt?: string;
      systemInstruction?: string;
      aspectRatio?: string;
      operation?: string;
      referenceImages?: Array<{ instructionText?: string }>;
    }) {
      capturedPrompt = request.prompt || '';
      capturedSystemInstruction = request.systemInstruction || '';
      capturedAspectRatio = request.aspectRatio || '';
      capturedOperation = request.operation || '';
      capturedReferenceLabels = request.referenceImages?.map((ref) => ref.instructionText || '') || [];
      return {
        imageData: Buffer.from('test-image'),
        mimeType: 'image/png',
        width: 1344,
        height: 768,
        format: 'png' as const,
      };
    },
  };

  const service = new ImageDomainService(imageProvider as any);
  const originalGenerateImageWithInstructions =
    service.generateImageWithInstructions.bind(service);
  let calledSharedGenerateMethod = false;
  service.generateImageWithInstructions = async (request) => {
    calledSharedGenerateMethod = true;
    return originalGenerateImageWithInstructions(request);
  };

  await service.generateSceneWithReference({
    sceneId: 1,
    ageGroup: '6-8',
    style: 'soft_watercolor',
    realWorldCharacters: [],
    imaginaryCharacters: [{ name: 'Mia', isTurnaround: true }],
    referenceImages: [
      {
        instructionText: 'REF_CH_MIA_TEST01: character identity reference.',
        characterName: 'Mia',
        referenceKind: 'character',
        imageIndex: 1,
        referenceBindingId: 'REF_CH_MIA_TEST01',
      },
    ],
    systemInstruction: buildImageSystemInstruction({
      style: 'soft_watercolor',
      ageGroup: '6-8',
      hasReferences: true,
      hasEnvironmentReference: true,
    }),
    imageIndexMap: new Map([['Mia', 1]]),
    hasEnvironmentImageRef: false,
  });

  assert.ok(calledSharedGenerateMethod);
  assert.equal(capturedAspectRatio, '16:9');
  assert.equal(capturedOperation, 'image_generate');
  assert.ok(!capturedSystemInstruction.includes('ENVIRONMENT REFERENCE:'));
  assert.ok(capturedSystemInstruction.includes('MUST AVOID any kind of text'));
  assert.ok(!capturedPrompt.includes('MUST AVOID any kind of text'));
  assert.ok(!capturedPrompt.includes('REF_CH_MIA_TEST01'));
  assert.ok(capturedReferenceLabels.includes('REF_CH_MIA_TEST01: character identity reference.'));
  assert.ok(!capturedPrompt.includes(forbiddenSyntheticAlias));
}

async function testImageDomainSceneIllustrationUsesSystemOnlyTextBan() {
  let capturedSystemInstruction = '';
  let capturedPrompt = '';
  const imageProvider = {
    async generateImage(request: { prompt?: string; systemInstruction?: string }) {
      capturedPrompt = request.prompt || '';
      capturedSystemInstruction = request.systemInstruction || '';
      return {
        imageData: Buffer.from('test-image'),
        mimeType: 'image/png',
        width: 1344,
        height: 768,
        format: 'png' as const,
      };
    },
  };

  const service = new ImageDomainService(imageProvider as any);
  await service.generateSceneIllustration({
    sceneId: 2,
    ageGroup: '6-8',
    style: 'soft_watercolor',
    visualPrompt: 'A bright meadow with a red kite flying over flowers.',
    mode: 'without_references',
  });

  assert.ok(capturedSystemInstruction.includes('MUST AVOID any kind of text'));
  assert.ok(!capturedPrompt.includes('MUST AVOID any kind of text'));
  assert.doesNotMatch(capturedPrompt, /keep free of text/i);
}

testReferenceBackedCharacterDoesNotDuplicateTextIdentity();
testLegacyUserPromptKeepsTextBanInSystemOnly();
testStructuredPromptSanitizesStyleIntentAndCrossScriptNoise();
testStructuredPromptReplacesLocalizedCharacterNameAliases();
testStructuredPromptUsesReferenceBindingIdsForDirectedActionText();
testStructuredPromptKeepsSceneFirstAndStripsTextOutfitLanguage();
testReferenceBackedCharacterWithoutOutfitPlateKeepsReferenceClothes();
testTextOnlyCharacterDoesNotReceiveLegacyOutfitText();
testPlaceholderReferenceNameResolvesToSingleUnmatchedSceneCharacter();
testSystemInstructionStatesReferenceIdentityWins();
testEnvironmentPromptSanitizesCharacterOwnedLocations();

async function main() {
  await testImageDomainUsesPerSceneEnvironmentReferenceFlag();
  await testImageDomainSceneIllustrationUsesSystemOnlyTextBan();
  console.log('imagePromptReferenceRules tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
