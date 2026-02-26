const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceIcon = path.join(__dirname, '../assets/images/favicon.png');
const publicDir = path.join(__dirname, '../public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const sizes = [
  { name: 'favicon.png', size: 64 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 }
];

async function generateIcons() {
  console.log('📦 Generating web icons from', sourceIcon);
  
  for (const { name, size } of sizes) {
    try {
      await sharp(sourceIcon)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toFile(path.join(publicDir, name));
      console.log(`✓ Generated ${name} (${size}x${size})`);
    } catch (err) {
      console.error(`✗ Failed to generate ${name}:`, err.message);
    }
  }
  
  console.log('\n🎉 All web icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
