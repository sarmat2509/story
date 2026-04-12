import assert from 'node:assert/strict';
import { buildSceneImagePrompt, buildImageSystemInstruction } from '../image/ImagePrompts';
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

  assert.ok(prompt.includes('- Mia (Image 1): match the character design from the sheet'));
  assert.ok(!prompt.includes('8-year-old girl with short brown hair'));
  assert.ok(!prompt.includes('freckles'));
  assert.ok(!prompt.includes('yellow raincoat'));
}

function testStructuredPromptSanitizesStyleIntentAndCrossScriptNoise() {
  const prompt = buildSceneImagePrompt({
    sceneVisual: {
      setting:
        'A stone castle interior at the mouth of an ancient tunnel. A watercolor children’s-book look with soft washes and paper texture. Fine dust motes drift near the tunnel mouth.',
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
  assert.ok(prompt.includes('Емілія (Image 1): foreground center-left beside Емілія'));
  assert.ok(!prompt.includes('Emilia'));
  assert.ok(!prompt.includes('as if ready to enter'));
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
  assert.ok(prompt.includes('They are wearing the outfit from Image 3.'));
  assert.ok(prompt.includes('Use the plate for clothing details only.'));
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

  assert.ok(prompt.includes('- Hooded Stranger (Image 2): match the reference photo.'));
  assert.ok(prompt.includes('Outfit in this scene: Long hooded cloak in muted deep green-gray, dark gloves, plain travel boots.'));
  assert.ok(!prompt.includes('- unknown (Image 2):'));
  assert.ok(!prompt.includes('- Hooded Stranger: Adult-height figure with face hidden in hood shadow.'));
}

function testSystemInstructionStatesReferenceIdentityWins() {
  const systemInstruction = buildImageSystemInstruction({
    style: 'soft_watercolor',
    ageGroup: '6-8',
    hasReferences: true,
    hasEnvironmentReference: true,
  });

  assert.ok(systemInstruction.includes('Character sheets establish IDENTITY'));
  assert.ok(systemInstruction.includes('use M for face, hair, and body identity; use N as the sole source for all clothing'));
  assert.ok(systemInstruction.includes('ENVIRONMENT REFERENCE: The provided location image is for CONTENT only'));
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
testStructuredPromptKeepsSceneFirstAndUsesResultOrientedOutfitLanguage();
testPlaceholderReferenceNameResolvesToSingleUnmatchedSceneCharacter();
testSystemInstructionStatesReferenceIdentityWins();

async function main() {
  await testImageDomainUsesPerSceneEnvironmentReferenceFlag();
  console.log('imagePromptReferenceRules tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
