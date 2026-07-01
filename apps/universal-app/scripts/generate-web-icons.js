const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const originalDir = path.join(__dirname, '../assets/images/originals');
const assetsDir = path.join(__dirname, '../assets/images');
const publicDir = path.join(__dirname, '../public');
const fullIconSource = path.join(originalDir, 'wonder-tales-w-icon.svg');
const smallIconSource = path.join(originalDir, 'wonder-tales-w-icon-small.svg');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const outputs = [
  { source: fullIconSource, dest: path.join(assetsDir, 'icon.png'), size: 1024, label: 'app icon' },
  { source: fullIconSource, dest: path.join(assetsDir, 'adaptive-icon.png'), size: 1024, label: 'adaptive icon' },
  { source: smallIconSource, dest: path.join(assetsDir, 'favicon.png'), size: 1024, label: 'small favicon source' },
  { source: smallIconSource, dest: path.join(publicDir, 'favicon.png'), size: 64, label: 'favicon' },
  { source: smallIconSource, dest: path.join(publicDir, 'icon-192.png'), size: 192, label: 'small web icon' },
  { source: fullIconSource, dest: path.join(publicDir, 'icon-512.png'), size: 512, label: 'large web icon' },
  { source: smallIconSource, dest: path.join(publicDir, 'apple-touch-icon.png'), size: 180, label: 'apple touch icon' }
];

async function generateIcons() {
  console.log('Generating app and web icons');
  
  for (const { source, dest, size, label } of outputs) {
    try {
      await sharp(source, { density: 384 })
        .resize(size, size, {
          fit: 'cover'
        })
        .png({ compressionLevel: 9 })
        .toFile(dest);
      console.log(`✓ Generated ${path.relative(path.join(__dirname, '..'), dest)} (${size}x${size}, ${label})`);
    } catch (err) {
      console.error(`✗ Failed to generate ${dest}:`, err.message);
    }
  }
  
  console.log('\nAll icons generated successfully.');
}

generateIcons().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
