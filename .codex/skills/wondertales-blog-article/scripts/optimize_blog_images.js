#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const workspaceRoot = path.resolve(__dirname, '../../../..');
const appDir = path.join(workspaceRoot, 'apps/universal-app');
const appRequire = createRequire(path.join(appDir, 'package.json'));
const sharp = appRequire('sharp');

const blogDir = path.join(appDir, 'public/landing/blog');
const originalsDir = path.join(blogDir, 'originals');
const outputDir = blogDir;
const scenePattern = /^(\d+|all)$/;

function usage() {
  console.error('Usage: node .codex/skills/wondertales-blog-article/scripts/optimize_blog_images.js <slug> [--scenes=1,2,3]');
  process.exit(1);
}

function parseArgs(argv) {
  const slug = argv[2];
  if (!slug || slug.startsWith('-')) usage();

  const scenesArg = argv.find((arg) => arg.startsWith('--scenes='));
  const scenes = scenesArg
    ? scenesArg.slice('--scenes='.length).split(',').map((value) => value.trim()).filter(Boolean)
    : ['1'];

  if (scenes.length === 0 || scenes.some((scene) => !scenePattern.test(scene))) {
    usage();
  }

  return { slug, scenes };
}

function sceneName(scene) {
  return String(scene).padStart(2, '0');
}

function sourceFor(slug, scene) {
  const base = `${slug}-scene-${sceneName(scene)}`;
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const candidate = path.join(originalsDir, `${base}.${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function optimizeOne(slug, scene) {
  const source = sourceFor(slug, scene);
  if (!source) {
    throw new Error(`Missing original for ${slug} scene ${sceneName(scene)} in ${originalsDir}`);
  }

  const dest = path.join(outputDir, `${slug}-scene-${sceneName(scene)}.webp`);
  await sharp(source)
    .rotate()
    .resize(1536, 864, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82, effort: 6 })
    .toFile(dest);

  const meta = await sharp(dest).metadata();
  if (meta.width !== 1536 || meta.height !== 864 || meta.format !== 'webp') {
    throw new Error(`Unexpected output metadata for ${dest}: ${meta.width}x${meta.height} ${meta.format}`);
  }

  const sizeKb = (fs.statSync(dest).size / 1024).toFixed(1);
  console.log(`Wrote ${path.relative(workspaceRoot, dest)} (${meta.width}x${meta.height}, ${sizeKb} KB)`);
}

async function main() {
  const { slug, scenes } = parseArgs(process.argv);
  if (!fs.existsSync(originalsDir)) {
    throw new Error(`Missing originals directory: ${originalsDir}`);
  }

  const selectedScenes = scenes.includes('all') ? ['1', '2', '3'] : scenes;
  for (const scene of selectedScenes) {
    await optimizeOne(slug, scene);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
