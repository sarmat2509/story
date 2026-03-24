/**
 * TEMPORARY — try outfit-plate prompt + environment image provider (Gemini Flash Image).
 *
 * Host:
 *   cd services/api && npx tsx src/scripts/tryOutfitPlateGeneration.ts
 *
 * Docker:
 *   docker compose -f docker-compose.dev.yml run --rm --entrypoint="" api npx tsx src/scripts/tryOutfitPlateGeneration.ts --out ./uploads/try-outfit-test.png "Your outfit text"
 *
 * Loads repo-root `.env.local` / `.env` before config when run on the host.
 * Requires: GOOGLE_API_KEY
 */

import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_OUTFIT =
  'Light blue short-sleeved dress with white Peter Pan collar and full skirt; one pair of white Mary Jane shoes with small buckles. Nothing else.';

function repoRoot(): string {
  return path.resolve(__dirname, '../../../..');
}

/** Populate process.env from monorepo root .env.local / .env (does not override existing). */
function loadRepoEnvFiles(): void {
  const root = repoRoot();
  for (const name of ['.env.local', '.env'] as const) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gac && !path.isAbsolute(gac)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(root, gac);
  }
}

async function main() {
  loadRepoEnvFiles();

  const [{ config }, { buildOutfitPlatePrompt }, { getEnvironmentImageProvider }, { logger }] =
    await Promise.all([
      import('../config'),
      import('../prompts/image/ImagePrompts'),
      import('../services/aiService'),
      import('../utils/logger'),
    ]);

  const argv = process.argv.slice(2);
  let outputPathFromArgs: string | null = null;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--out' || a === '-o') && argv[i + 1]) {
      outputPathFromArgs = argv[i + 1];
      i++;
      continue;
    }
    rest.push(a);
  }
  let outfitParts = rest;
  if (!outputPathFromArgs && rest.length >= 1 && /\.png$/i.test(rest[rest.length - 1])) {
    outputPathFromArgs = rest.pop()!;
    outfitParts = rest;
  }
  const outfitText = outfitParts.join(' ').trim() || DEFAULT_OUTFIT;

  if (!config.google.apiKey) {
    // eslint-disable-next-line no-console
    console.error('GOOGLE_API_KEY is not set (check repo .env.local)');
    process.exitCode = 1;
    return;
  }

  const imageStyle = process.env.TRY_OUTFIT_STYLE || 'soft_watercolor';
  const ageGroup = process.env.TRY_OUTFIT_AGE || '6-8';

  const prompt = buildOutfitPlatePrompt({
    outfitDescription: outfitText,
    imageStyle,
    ageGroup,
    scenarioCardId: process.env.TRY_OUTFIT_SCENARIO || undefined,
  });

  logger.info({ outfitText, imageStyle, ageGroup, promptLength: prompt.length }, 'Full prompt');
  logger.info({ prompt }, 'tryOutfitPlateGeneration prompt (full)');

  const provider = getEnvironmentImageProvider();
  const result = await provider.generateImage({
    prompt,
    aspectRatio: '1:1',
    operation: 'image_outfit_plate',
  });

  const buffer = Buffer.isBuffer(result.imageData)
    ? result.imageData
    : Buffer.from(result.imageData as string, 'base64');

  const testOutputDir = path.join(__dirname, '../../test-output');
  if (!fs.existsSync(testOutputDir)) {
    fs.mkdirSync(testOutputDir, { recursive: true });
  }

  const outputPath = outputPathFromArgs
    ? path.isAbsolute(outputPathFromArgs)
      ? outputPathFromArgs
      : path.join(process.cwd(), outputPathFromArgs)
    : path.join(testOutputDir, `try-outfit-plate-${Date.now()}.png`);

  fs.writeFileSync(outputPath, buffer);
  logger.info({ outputPath, bytes: buffer.length, mimeType: result.mimeType }, 'Saved');
  // eslint-disable-next-line no-console
  console.log('OK', outputPath, buffer.length, 'bytes');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('tryOutfitPlateGeneration failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
