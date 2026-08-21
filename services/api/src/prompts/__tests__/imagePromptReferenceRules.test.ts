import assert from 'node:assert/strict';
import { buildSceneImagePrompt, buildImageSystemInstruction, buildEnvironmentImagePrompt } from '../image/ImagePrompts';
import { ImageDomainService } from '../../domain/image/ImageDomainService';
import { collectSceneVisualCharacterNames } from '../../services/sceneVisualCharacterMentions';

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
            position: 'foreground left, beside the table',
            description: 'leaning over the table, curious expression, looking at the book',
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
  assert.ok(
    prompt.includes(
      'Character REF_IMAGE_1 is located in the foreground left, beside the table, leaning over the table'
    )
  );
}

function testDynamicForeshorteningShotPassesThroughToImagePrompt() {
  const prompt = buildSceneImagePrompt({
    sceneVisual: {
      setting: 'Autumn leaves lift from the path around the moving character.',
      cameraComposition: {
        shot: 'Extreme dynamic foreshortening with the camera directly on the action axis, one hand dominating the foreground while the body recedes sharply into depth',
        characters: [
          {
            name: 'Mia',
            description:
              'center, swinging safely toward the viewer, face visible, joyful expression',
            outfitId: 'o_mia_1',
          },
        ],
      },
      lighting: 'Warm afternoon light through the leaves',
    },
    ageGroup: '6-8',
    style: 'soft_watercolor',
    hasReferences: true,
    referenceCharacterNames: [{ name: 'Mia', isTurnaround: true }],
    imageIndexMap: new Map([['Mia', 1]]),
  });

  assert.match(prompt, /Composition: Extreme dynamic foreshortening/);
  assert.match(prompt, /camera directly on the action axis/);
  assert.match(prompt, /body recedes sharply into depth/);
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

  assert.ok(prompt.includes('- Scene-specific: A stone castle interior at the mouth of an ancient tunnel.'));
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

function testProductionCompositionReplacesEveryCharacterNameAndUsesAllMentionedRefs() {
  const sceneVisual = {
    setting:
      'Emilia and Romchyk stand near the central chaotic knot; Khomka is visible slightly above the ground plane within a loose wrap of floating code strands; Sonya stays close enough to Emilia while Emilia holds Sonya’s paw.',
    cameraComposition: {
      shot: 'Medium shot at eye level, tight enough to clearly show Emilia’s still posture, her hand passing through Khomka, and the dark knot behind them',
      characters: [
        {
          name: 'Emilia',
          description:
            'Center foreground standing with feet planted on the glossy surface, shoulders lowered; one hand held out in front with fingers spread as they pass through Khomka’s projection-space, the other hand drawn close to her chest; controlled, steady expression, gaze fixed on Khomka and the surrounding code strands.',
        },
        {
          name: 'Romchyk',
          description:
            'Left foreground close to Emilia’s leg, body angled toward the knot, low stance with a tense posture; focused expression, gaze locked on the code strands tightening around Khomka.',
        },
        {
          name: 'Linivchik Sonya',
          description:
            'Right mid-ground, standing with one paw extended, clearly pointing toward the dense dark knot in the center; calm face, gaze following the pointing direction.',
        },
      ],
    },
    lighting:
      'Cool, high-contrast digital lighting with golden thread glow as key light; soft violet rim light around characters; dark glossy floor reflections with ray-traced highlights.',
  };
  const bindings = [
    ['Emilia', 'REF_CH_EMILI_985EAE'],
    ['Romchyk', 'REF_CH_ROMCHIK_2C0172'],
    ['Linivchik Sonya', 'REF_CH_LINIVCHIK_SONYA_B73C2A'],
    ['Khomka', 'REF_CH_KHOMKA_98046A'],
  ] as const;

  const mentionedNames = collectSceneVisualCharacterNames(
    sceneVisual,
    sceneVisual.cameraComposition.characters.map((character) => character.name),
    bindings.map(([name]) => ({ name })),
  );
  assert.deepEqual(mentionedNames, ['Emilia', 'Romchyk', 'Linivchik Sonya', 'Khomka']);

  const prompt = buildSceneImagePrompt({
    sceneVisual,
    ageGroup: '6-8',
    style: 'warm_3d',
    hasReferences: true,
    hasEnvironmentImageRef: true,
    referenceCharacterNames: bindings.map(([name]) => ({ name, isTurnaround: true })),
    realWorldCharacters: [
      {
        name: 'Emilia',
        description:
          'The child has long, dark brown hair styled in many small braids and freckles across the nose and cheeks.',
      },
    ],
    imageIndexMap: new Map(bindings.map(([name], index) => [name, index + 2])),
    referenceImages: bindings.map(([characterName, referenceBindingId], index) => ({
      characterName,
      referenceBindingId,
      referenceKind: 'character' as const,
      imageIndex: index + 2,
      type: 'dressed_turnaround_reference',
    })),
  });

  const expectedComposition =
    'Composition: Medium shot at eye level, tight enough to clearly show REF_CH_EMILI_985EAE’s still posture, her hand passing through REF_CH_KHOMKA_98046A, and the dark knot behind them. Character REF_CH_EMILI_985EAE is located Center foreground standing with feet planted on the glossy surface, shoulders lowered; one hand held out in front with fingers spread as they pass through REF_CH_KHOMKA_98046A’s projection-space, the other hand drawn close to her chest; controlled, steady expression, gaze fixed on REF_CH_KHOMKA_98046A and the surrounding code strands. Character REF_CH_ROMCHIK_2C0172 is located Left foreground close to REF_CH_EMILI_985EAE’s leg, body angled toward the knot, low stance with a tense posture; focused expression, gaze locked on the code strands tightening around REF_CH_KHOMKA_98046A. Character REF_CH_LINIVCHIK_SONYA_B73C2A is located Right mid-ground, standing with one paw extended, clearly pointing toward the dense dark knot in the center; calm face, gaze following the pointing direction.';
  assert.deepEqual(
    prompt.split('\n').map((line) => line.slice(0, line.indexOf(':') + 1)),
    ['- Scene-specific:', '- Composition:', '- Lighting:'],
  );
  assert.ok(prompt.includes(expectedComposition));
  assert.ok(
    prompt.includes(
      '- Lighting: Cool, high-contrast digital lighting with golden thread glow as key light; soft violet rim light around characters; dark glossy floor reflections with ray-traced highlights.',
    ),
  );
  assert.doesNotMatch(prompt, /\b(?:Emilia|Romchyk|Khomka|Sonya)\b/u);
  assert.ok(!prompt.includes('Linivchik Sonya'));
  assert.ok(!prompt.includes('long, dark brown hair'));
  assert.ok(!prompt.includes('freckles across the nose'));
  assert.doesNotMatch(prompt, /safe for children/i);
  assert.doesNotMatch(prompt, /^- REF_CH_[^\n]+:/m);
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

  assert.ok(prompt.trimStart().startsWith('- Scene-specific:'));
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

function testTextOnlyCharacterDescriptionIsNeverAddedToScenePrompt() {
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

  assert.ok(!prompt.includes('Friendly adult helper with a calm smile'));
  assert.doesNotMatch(prompt, /^- (?:Stage Helper|REF_CH_[^:]+):/m);
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
  assert.ok(systemInstruction.includes('MUST OUTPUT ONLY the continuous storybook illustration'));
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
  assert.ok(systemInstruction.includes('ANATOMY AND ACTION:'));
  assert.ok(systemInstruction.includes('"swimming like a mermaid" means graceful horizontal swimming only'));
  assert.ok(systemInstruction.includes('Never add tails, fins, wings, animal limbs'));
  assert.ok(systemInstruction.includes('ENVIRONMENT REFERENCE: The provided location image defines reusable layout'));
  assert.ok(systemInstruction.includes('Keep the same location and spatial relationships'));
}

function testColoredPencilSystemInstructionForcesFullBleedArtwork() {
  const systemInstruction = buildImageSystemInstruction({
    style: 'colored_pencil',
    ageGroup: '6-8',
  });

  assert.match(systemInstruction, /full-bleed artwork extending past all four image edges/i);
  assert.match(systemInstruction, /never show a paper sheet, page edge, blank margin, mat, border, frame, or vignette/i);
  assert.doesNotMatch(systemInstruction, /illustration on textured paper/i);
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
  const underwaterPrompt = buildEnvironmentImagePrompt({
    environment: {
      id: 'underwater_fountain_basin',
      name: 'Underwater fountain basin',
      viewpointKind: 'submerged',
      description:
        'Submerged stone floor and curved basin walls under blue water; the exterior fountain rim and courtyard are outside the frame.',
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
  assert.ok(underwaterPrompt.includes('CAMERA VIEWPOINT KIND: submerged'));
  assert.ok(underwaterPrompt.includes('never substitute its exterior for an interior/submerged/enclosed view'));
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
  assert.ok(capturedSystemInstruction.includes('MUST OUTPUT ONLY the continuous storybook illustration'));
  assert.ok(!capturedPrompt.includes('MUST OUTPUT ONLY the continuous storybook illustration'));
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

  assert.ok(capturedSystemInstruction.includes('MUST OUTPUT ONLY the continuous storybook illustration'));
  assert.ok(!capturedPrompt.includes('MUST OUTPUT ONLY the continuous storybook illustration'));
  assert.doesNotMatch(capturedPrompt, /keep free of text/i);
}

async function testImageDomainRejectsEveryCharacterIdentityFallback() {
  let providerCalls = 0;
  const imageProvider = {
    async generateImage() {
      providerCalls += 1;
      throw new Error('provider must not be called');
    },
  };
  const service = new ImageDomainService(imageProvider as any);

  await assert.rejects(
    service.generateSceneWithReference({
      sceneId: 5,
      ageGroup: '6-8',
      style: 'warm_3d',
      realWorldCharacters: [
        { name: 'Emilia', description: 'text appearance fallback must be rejected' },
      ],
      imaginaryCharacters: [],
      referenceImages: [],
    }),
    /text-only character identities.*requires turnaround references/i,
  );

  await assert.rejects(
    service.generateSceneWithReference({
      sceneId: 5,
      ageGroup: '6-8',
      style: 'warm_3d',
      realWorldCharacters: [],
      imaginaryCharacters: [{ name: 'Khomka', isTurnaround: false }],
      referenceImages: [
        {
          instructionText: 'REF_CH_KHOMKA_98046A: identity',
          characterName: 'Khomka',
          referenceKind: 'character',
          referenceBindingId: 'REF_CH_KHOMKA_98046A',
        },
      ],
    }),
    /missing required delivered turnaround references: Khomka/i,
  );

  assert.equal(providerCalls, 0);
}

testReferenceBackedCharacterDoesNotDuplicateTextIdentity();
testDynamicForeshorteningShotPassesThroughToImagePrompt();
testLegacyUserPromptKeepsTextBanInSystemOnly();
testStructuredPromptSanitizesStyleIntentAndCrossScriptNoise();
testStructuredPromptReplacesLocalizedCharacterNameAliases();
testStructuredPromptUsesReferenceBindingIdsForDirectedActionText();
testProductionCompositionReplacesEveryCharacterNameAndUsesAllMentionedRefs();
testStructuredPromptKeepsSceneFirstAndStripsTextOutfitLanguage();
testReferenceBackedCharacterWithoutOutfitPlateKeepsReferenceClothes();
testTextOnlyCharacterDescriptionIsNeverAddedToScenePrompt();
testPlaceholderReferenceNameResolvesToSingleUnmatchedSceneCharacter();
testSystemInstructionStatesReferenceIdentityWins();
testColoredPencilSystemInstructionForcesFullBleedArtwork();
testEnvironmentPromptSanitizesCharacterOwnedLocations();

async function main() {
  await testImageDomainUsesPerSceneEnvironmentReferenceFlag();
  await testImageDomainSceneIllustrationUsesSystemOnlyTextBan();
  await testImageDomainRejectsEveryCharacterIdentityFallback();
  console.log('imagePromptReferenceRules tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
