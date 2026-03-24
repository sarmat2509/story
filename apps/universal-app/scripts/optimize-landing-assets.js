/**
 * Optimize landing page images: hero mockup and sparkles overlay.
 * Converts PNG to WebP and places in public/ folder.
 * Run: node scripts/optimize-landing-assets.js
 *
 * Input files (from workspace root):
 *   - logo-wonder-tales (1).png -> logo.webp
 *   - Generated Image March 12, 2026 - 9_56PM (1).png -> hero-mockup.webp
 *   - Generated Image March 13, 2026 - 12_27AM (4).png -> sparkles-overlay.webp
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const workspaceRoot = path.join(__dirname, '../../..');
const publicDir = path.join(__dirname, '../public');

const inputs = [
  {
    src: path.join(workspaceRoot, 'logo-wonder-tales (1).png'),
    dest: path.join(publicDir, 'logo.webp'),
    quality: 90,
    alphaQuality: 95,
    description: 'Logo Wonder Tales',
  },
  {
    src: path.join(workspaceRoot, 'Generated Image March 12, 2026 - 9_56PM (1).png'),
    dest: path.join(publicDir, 'hero-mockup.webp'),
    quality: 85,
    description: 'Hero mockup (drawing to story)',
  },
  {
    src: path.join(workspaceRoot, 'Generated Image March 13, 2026 - 12_27AM (4).png'),
    dest: path.join(publicDir, 'sparkles-overlay.webp'),
    quality: 85,
    description: 'Sparkles overlay (repeating background, light pink)',
  },
];

async function optimize() {
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  for (const { src, dest, quality, alphaQuality, description } of inputs) {
    if (!fs.existsSync(src)) {
      console.error(`❌ Source not found: ${src}`);
      process.exit(1);
    }

    console.log(`📦 Converting ${description}...`);
    const webpOpts = { quality, effort: 6 };
    if (alphaQuality != null) webpOpts.alphaQuality = alphaQuality;
    await sharp(src)
      .webp(webpOpts)
      .toFile(dest);

    const stats = fs.statSync(dest);
    console.log(`   ✓ ${path.basename(dest)} (${(stats.size / 1024).toFixed(1)} KB)`);
  }

  console.log('\n✓ All landing assets optimized.');
}

optimize().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
