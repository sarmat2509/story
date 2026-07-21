import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  GRAPHIC_NOVEL_PAGE_DISPLAY_MAX_BYTES,
  graphicNovelPageDisplayImageUrl,
  optimizeGraphicNovelPageForDisplay,
} from '../pageImageOptimization';

async function main(): Promise<void> {
  const original = await sharp({
    create: {
      width: 1536,
      height: 2048,
      channels: 4,
      background: { r: 55, g: 109, b: 168, alpha: 0.8 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="1536" height="2048"><circle cx="768" cy="1024" r="500" fill="#ffdb7d"/></svg>'
        ),
      },
    ])
    .png()
    .toBuffer();

  const display = await optimizeGraphicNovelPageForDisplay(original);
  const displayMetadata = await sharp(display.data).metadata();
  assert.equal(display.mimeType, 'image/webp');
  assert.ok(display.fileSizeBytes <= GRAPHIC_NOVEL_PAGE_DISPLAY_MAX_BYTES);
  assert.equal(displayMetadata.format, 'webp');
  assert.equal(displayMetadata.width, 1536);
  assert.equal(displayMetadata.height, 2048);
  assert.equal(displayMetadata.hasAlpha, true, 'reader copy should retain page transparency');

  assert.equal(
    graphicNovelPageDisplayImageUrl({
      imageUrl: 'production/user/story/image/original.png',
      generationParams: { displayImageStoragePath: 'production/user/story/image/display.webp' },
    }),
    'production/user/story/image/display.webp'
  );
  assert.equal(
    graphicNovelPageDisplayImageUrl({ imageUrl: 'production/user/story/image/original.png' }),
    'production/user/story/image/original.png'
  );

  console.log('graphic novel page display image optimization tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
