/**
 * Generate a deliberately broken image-validation golden fixture with Seedream Lite.
 *
 * Usage:
 *   pnpm --filter wondertales-api exec tsx \
 *     src/scripts/generateImageValidationGoldenFixture.ts \
 *     --input /absolute/path/source.png \
 *     --output src/domain/image/__tests__/fixtures/duplicate-reflection-anatomy.seedream-lite.jpg
 */

import './loadEnvForScripts';

import fs from 'node:fs/promises';
import path from 'node:path';
import { SeedreamImageProvider } from '../providers/image/seedream';

type Args = {
  input: string;
  output: string;
};

function parseArgs(argv: string[]): Args {
  const value = (name: string): string | null => {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1]?.trim() ? argv[index + 1].trim() : null;
  };
  const input = value('--input');
  const output = value('--output');
  if (!input || !output) {
    throw new Error('Both --input and --output are required.');
  }
  return {
    input: path.resolve(input),
    output: path.resolve(output),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const originalImage = await fs.readFile(args.input);
  const provider = new SeedreamImageProvider(undefined, 'seedream-5-0-lite-260128');

  const generated = await provider.editImage({
    originalImage,
    originalMimeType: 'image/png',
    aspectRatio: '16:9',
    operation: 'image_validation_golden_fixture_edit',
    systemInstruction: [
      'Create a deterministic QA test image by editing the supplied illustration.',
      'Preserve the watercolor storybook style, camera, icy landscape, girl, white floating creature, reflective ice, and the existing reflected blue fairy.',
      'The requested visual defects are intentional test data and must be clearly visible.',
    ].join(' '),
    editInstructions: [
      'Show exactly two PHYSICAL copies of the same small blue winged fairy side-by-side in the upper-left ordinary scene space. Both physical copies must be fully visible above the ice, spatially separated, and must not be inside water, glass, a mirror, a picture, or a screen.',
      'Keep the pre-existing upside-down optical reflection of the blue fairy in the lower-left reflective ice. It must remain visibly bounded by the reflective ice surface and read as a reflection, not a third physical body.',
      'Make the RIGHT physical fairy visibly corrupted with unmistakable anatomy/rendering defects: three separate legs must emerge from its lower torso, one leg must bend backward in a corkscrew and end in two feet, and one arm must visibly fork at the elbow into two forearms with two separate hands. Keep the entire corrupted body unobstructed and large enough to inspect. These defects must be impossible to explain as occlusion, perspective, a tail, or contact with the other fairy.',
      'Do not add text. Do not duplicate the girl or the white floating creature. Preserve all other composition and style details.',
    ].join('\n'),
  });

  const expectedExtension = generated.mimeType === 'image/jpeg' ? '.jpg' : '.png';
  if (path.extname(args.output).toLowerCase() !== expectedExtension) {
    throw new Error(
      `Output extension must match Seedream response MIME ${generated.mimeType}; expected ${expectedExtension}.`
    );
  }

  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(args.output, generated.imageData);
  await fs.writeFile(
    `${args.output}.json`,
    `${JSON.stringify(
      {
        generatedBy: 'seedream-5-0-lite-260128',
        operation: 'image_validation_golden_fixture_edit',
        sourceFileName: path.basename(args.input),
        mimeType: generated.mimeType,
        width: generated.width,
        height: generated.height,
        expected: {
          visiblePhysicalBodyCount: 2,
          minimumVisibleReflectionCount: 1,
          duplicated: true,
          anatomyArtifactSeverity: ['moderate', 'severe'],
          hasRenderingArtifacts: true,
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  console.log(args.output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
