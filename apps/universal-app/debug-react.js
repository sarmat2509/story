#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking for React duplicates...\n');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const reactPaths = [
  path.join(projectRoot, 'node_modules/react/package.json'),
  path.join(workspaceRoot, 'node_modules/react/package.json'),
  path.join(workspaceRoot, 'node_modules/.pnpm/react@18.2.0/node_modules/react/package.json'),
];

reactPaths.forEach((reactPath) => {
  if (fs.existsSync(reactPath)) {
    const pkg = JSON.parse(fs.readFileSync(reactPath, 'utf8'));
    console.log(`✅ Found React ${pkg.version} at:`);
    console.log(`   ${reactPath}\n`);
  } else {
    console.log(`❌ Not found: ${reactPath}\n`);
  }
});

console.log('\n📦 Checking symlinks...');
const appReactPath = path.join(projectRoot, 'node_modules/react');
if (fs.existsSync(appReactPath)) {
  const stats = fs.lstatSync(appReactPath);
  if (stats.isSymbolicLink()) {
    const target = fs.readlinkSync(appReactPath);
    console.log(`🔗 apps/universal-app/node_modules/react -> ${target}`);
  } else {
    console.log(`📁 apps/universal-app/node_modules/react is a real directory`);
  }
}

console.log('\n💡 Run this to check versions:');
console.log('   pnpm list react --depth=0');
