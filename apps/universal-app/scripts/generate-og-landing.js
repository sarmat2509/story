/**
 * Generate og-landing.png (1200x630) for Open Graph sharing.
 * Run: node scripts/generate-og-landing.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const publicDir = path.join(__dirname, '../public');
const outputPath = path.join(publicDir, 'og-landing.png');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const width = 1200;
const height = 630;

async function generateOgLanding() {
  console.log('📦 Generating og-landing.png (1200x630)...');

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0ea5e9;stop-opacity:0.15" />
          <stop offset="100%" style="stop-color:#0ea5e9;stop-opacity:0.05" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="#ffffff"/>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <text x="600" y="280" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="72" font-weight="700" fill="#0ea5e9" text-anchor="middle">WonderTales</text>
      <text x="600" y="360" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="28" fill="#64748b" text-anchor="middle">Turn drawings into characters. Listen, read, publish.</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);

  console.log('✓ Generated og-landing.png');
}

generateOgLanding().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
