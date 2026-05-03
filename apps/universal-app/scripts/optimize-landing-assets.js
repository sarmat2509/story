/**
 * Optimize landing page images.
 * Run: node scripts/optimize-landing-assets.js
 *
 * This script has two jobs:
 *   1. Rebuild base WebP files from original source PNGs when those originals
 *      are present in the workspace root.
 *   2. Generate responsive AVIF/WebP variants from committed public assets.
 *
 * The SSR landing renderer references the generated variants and keeps the
 * original PNG/WebP files as fallback images.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const workspaceRoot = path.join(__dirname, '../../..');
const publicDir = path.join(__dirname, '../public');
const landingDir = path.join(publicDir, 'landing');
const optimizedLandingDir = path.join(landingDir, 'optimized');

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

const heroResponsiveAsset = {
  src: path.join(publicDir, 'hero-mockup.webp'),
  destDir: optimizedLandingDir,
  outputBaseName: 'hero-mockup',
  widths: [720, 1080, 1440, 1800],
  webpQuality: 78,
  avifQuality: 44,
  description: 'Hero mockup responsive variants',
};

const landingResponsiveAssets = [
  'draw-to-hero.png',
  'listen-again.png',
  'safe-by-age.png',
  'create-in-minutes.png',
  'personal-keepsake.png',
  'reading-and-language.png',
  'bedtime-moments.png',
  'share-with-family.png',
  'voice-narration.png',
  'read-along-text.png',
  'age-adaptation.png',
  'favorite-hero-series.png',
  'draw-to-story.png',
  'multiple-child-profiles.png',
  'illustration-styles.png',
].map((fileName) => ({
  src: path.join(landingDir, fileName),
  destDir: optimizedLandingDir,
  outputBaseName: path.basename(fileName, path.extname(fileName)),
  widths: [480, 720, 960],
  webpQuality: 78,
  avifQuality: 44,
  description: `Landing card responsive variants (${fileName})`,
}));

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

async function writeResponsiveImage({ src, destDir, outputBaseName, widths, webpQuality, avifQuality, description }) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Skipping missing source: ${src}`);
    return;
  }

  ensureDir(destDir);

  const originalStats = fs.statSync(src);
  console.log(`📐 Generating ${description} from ${path.basename(src)} (${formatSize(originalStats.size)})...`);

  for (const width of widths) {
    const basePipeline = sharp(src).resize({ width, withoutEnlargement: true });
    const webpDest = path.join(destDir, `${outputBaseName}-${width}.webp`);
    const avifDest = path.join(destDir, `${outputBaseName}-${width}.avif`);

    await basePipeline.clone().webp({ quality: webpQuality, effort: 6 }).toFile(webpDest);
    await basePipeline.clone().avif({ quality: avifQuality, effort: 7 }).toFile(avifDest);

    const webpSize = fs.statSync(webpDest).size;
    const avifSize = fs.statSync(avifDest).size;
    console.log(`   ✓ ${path.basename(webpDest)} (${formatSize(webpSize)}), ${path.basename(avifDest)} (${formatSize(avifSize)})`);
  }
}

async function optimize() {
  ensureDir(publicDir);

  for (const { src, dest, quality, alphaQuality, description } of inputs) {
    if (!fs.existsSync(src)) {
      console.warn(`⚠️  Skipping missing original source: ${src}`);
      continue;
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

  await writeResponsiveImage(heroResponsiveAsset);

  for (const asset of landingResponsiveAssets) {
    await writeResponsiveImage(asset);
  }

  console.log('\n✓ All landing assets optimized.');
}

optimize().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
