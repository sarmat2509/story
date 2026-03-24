/**
 * Slice voice avatar grid image into 20 individual avatars.
 * Grid: 4 rows x 5 columns.
 *
 * Run: node scripts/slice-voice-avatars.js
 *
 * Input: Generated Image March 13, 2026 - 11_25PM.png (workspace root)
 * Output: public/landing/voice-avatars/avatar-00.png ... avatar-19.png
 *
 * Avatar index (0-19): row-major, left to right, top to bottom.
 * Excluded (dark-skinned): 6, 13, 16, 19
 *
 * Voice-to-avatar mapping (fair skin, varied):
 * Female: 0, 1, 2, 5, 7, 10, 11, 12, 15, 18
 * Male: 8, 9, 14, 17
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROWS = 4;
const COLS = 5;

const workspaceRoot = path.join(__dirname, '../../..');
const publicDir = path.join(__dirname, '../public');
const outputDir = path.join(publicDir, 'landing', 'voice-avatars');

const inputPath = path.join(workspaceRoot, 'Generated Image March 13, 2026 - 11_25PM.png');

// Voice name -> avatar index (fair skin, varied by gender)
const VOICE_AVATAR_MAP = {
  // Female voices (Google + ElevenLabs + OpenAI)
  lyra: 0,
  hydra: 2,
  andromeda: 5,
  cassiopeia: 10,
  marin: 7,
  coral: 1,
  ballad: 11,
  // Male voices
  phoenix: 8,
  centaurus: 9,
  perseus: 14,
  orion: 17,
  cedar: 9,
};

async function sliceAvatars() {
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Source not found: ${inputPath}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const metadata = await sharp(inputPath).metadata();
  const { width, height } = metadata;
  const cellWidth = Math.floor(width / COLS);
  const cellHeight = Math.floor(height / ROWS);

  console.log(`📐 Image: ${width}x${height}, cell: ${cellWidth}x${cellHeight}`);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const idx = row * COLS + col;
      const left = col * cellWidth;
      const top = row * cellHeight;

      const outputPath = path.join(outputDir, `avatar-${String(idx).padStart(2, '0')}.png`);
      await sharp(inputPath)
        .extract({ left, top, width: cellWidth, height: cellHeight })
        .png()
        .toFile(outputPath);

      console.log(`   ✓ avatar-${String(idx).padStart(2, '0')}.png`);
    }
  }

  // Write mapping for reference
  const mappingPath = path.join(outputDir, 'voice-avatar-mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify(VOICE_AVATAR_MAP, null, 2));
  console.log(`\n📋 Mapping written to ${path.relative(workspaceRoot, mappingPath)}`);
  console.log('\n✓ All avatars sliced.');
}

sliceAvatars().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
