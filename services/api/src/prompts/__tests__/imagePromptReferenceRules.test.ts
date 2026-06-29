import assert from 'node:assert/strict';
import { buildSceneImagePrompt, buildImageSystemInstruction, buildEnvironmentImagePrompt } from '../image/ImagePrompts';
import { ImageDomainService } from '../../domain/image/ImageDomainService';

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

  assert.ok(prompt.includes('- Subject A (Image 1): match the character design from the sheet'));
  assert.ok(!prompt.includes('Mia'));
  assert.ok(!prompt.includes('8-year-old girl with short brown hair'));
  assert.ok(!prompt.includes('freckles'));
  assert.ok(!prompt.includes('yellow raincoat'));
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
  assert.ok(prompt.includes('Subject A (Image 1): foreground center-left beside Subject A'));
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

  assert.ok(prompt.includes('Subject A studies the glowing map while Subject A holds the lantern.'));
  assert.ok(prompt.includes('framing Subject A near the table'));
  assert.ok(prompt.includes('Subject A points at the map'));
  assert.ok(prompt.includes('Warm light near Subject A, cooler shadows behind Subject A.'));
  assert.ok(!prompt.includes('Емілія'));
  assert.ok(!prompt.includes('Emilia'));
  assert.ok(!prompt.includes('Эмилия'));
  assert.ok(!prompt.includes('Emilie'));
}

function testStructuredPromptKeepsSceneFirstAndUsesResultOrientedOutfitLanguage() {
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
    outfitPlateImageIndexByCharacter: new Map([['Емілія', 3]]),
  });

  assert.ok(prompt.trimStart().startsWith('- Scene:'));
  assert.ok(!prompt.includes('- Wardrobe plates:'));
  assert.ok(!prompt.includes('Technical reference command'));
  assert.ok(prompt.includes('Draw Subject A from Image 1 wearing Clothes A from Image 3.'));
  assert.ok(prompt.includes('Image 1 is PERSON SOURCE; Image 3 is CLOTHES SOURCE only.'));
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
    characterOutfits: {
      Lera: 'Mustard-yellow sweater, denim skirt, navy tights, brown ankle boots',
    },
  });

  assert.ok(prompt.includes('- Subject A (Image 2): match the character design from the sheet.'));
  assert.ok(!prompt.includes('Lera'));
  assert.ok(!prompt.includes('Outfit in this scene:'));
  assert.ok(!prompt.includes('Mustard-yellow sweater'));
}

function testTextOnlyCharacterStillReceivesOutfitText() {
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
        description: 'Friendly adult helper with a calm smile',
      },
    ],
    characterOutfits: {
      'Stage Helper': 'Blue crew vest, black trousers, comfortable sneakers',
    },
  });

  assert.ok(prompt.includes('Outfit in this scene: Blue crew vest, black trousers, comfortable sneakers.'));
  assert.ok(prompt.includes('- Subject A: Friendly adult helper with a calm smile.'));
  assert.ok(!prompt.includes('Stage Helper'));
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
    characterOutfits: {
      'Hooded Stranger': 'Long hooded cloak in muted deep green-gray, dark gloves, plain travel boots',
    },
  });

  assert.ok(prompt.includes('- Subject A (Image 2): match the reference photo.'));
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
  assert.ok(systemInstruction.includes('draw the person from Image M wearing the clothing/accessories from Image N'));
  assert.ok(systemInstruction.includes('Image M is PERSON SOURCE. Image N is CLOTHES SOURCE only.'));
  assert.ok(systemInstruction.includes('Only the clothes should change.'));
  assert.ok(systemInstruction.includes('Do not redesign, re-braid, re-style, simplify, beautify, or reinterpret hair'));
  assert.ok(systemInstruction.includes('ENVIRONMENT REFERENCE: The provided location image is for CONTENT only'));
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
  const imageProvider = {
    async generateImage(request: { systemInstruction?: string }) {
      capturedSystemInstruction = request.systemInstruction || '';
      return { imageUrl: 'https://example.com/test.png' };
    },
  };

  const service = new ImageDomainService(imageProvider as any);

  await service.generateSceneWithReference({
    sceneId: 1,
    ageGroup: '6-8',
    style: 'soft_watercolor',
    realWorldCharacters: [],
    imaginaryCharacters: [{ name: 'Mia', isTurnaround: true }],
    referenceImages: [
      {
        instructionText: 'Image 1: Character sheet for "Mia".',
        characterName: 'Mia',
        referenceKind: 'character',
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

  assert.ok(!capturedSystemInstruction.includes('ENVIRONMENT REFERENCE:'));
}

testReferenceBackedCharacterDoesNotDuplicateTextIdentity();
testStructuredPromptSanitizesStyleIntentAndCrossScriptNoise();
testStructuredPromptReplacesLocalizedCharacterNameAliases();
testStructuredPromptKeepsSceneFirstAndUsesResultOrientedOutfitLanguage();
testReferenceBackedCharacterWithoutOutfitPlateKeepsReferenceClothes();
testTextOnlyCharacterStillReceivesOutfitText();
testPlaceholderReferenceNameResolvesToSingleUnmatchedSceneCharacter();
testSystemInstructionStatesReferenceIdentityWins();
testEnvironmentPromptSanitizesCharacterOwnedLocations();

async function main() {
  await testImageDomainUsesPerSceneEnvironmentReferenceFlag();
  console.log('imagePromptReferenceRules tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
