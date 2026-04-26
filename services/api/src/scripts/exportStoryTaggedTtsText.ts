/**
 * Export TTS input for a story: per scene-group `vendorStylePromptEn` + tagged text (from partial
 * `audio_assets` + `assets.generation_params`), then optional full concatenated text from the final row.
 *
 * Usage:
 *   pnpm --filter wondertales-api exec tsx src/scripts/exportStoryTaggedTtsText.ts -- <story-uuid> [--out=path.txt]
 */

import './loadEnvForScripts';
import fs from 'fs';
import path from 'path';
import { getAssetRepository } from '../repositories';
import { readVendorStylePromptEnFromGenerationParams } from '../services/ttsProsodyTaggingService';

function parseOutArg(): string | null {
  const raw = process.argv.find((a) => a.startsWith('--out='));
  if (!raw) return null;
  const p = raw.slice('--out='.length).trim();
  return p || null;
}

function storyIdFromArgs(): string | null {
  const dash = process.argv.indexOf('--');
  const rest = dash >= 0 ? process.argv.slice(dash + 1) : process.argv.slice(2);
  const id = rest.find((a) => !a.startsWith('--'));
  return id?.trim() || null;
}

async function main(): Promise<void> {
  const storyId = storyIdFromArgs();
  if (!storyId) {
    console.error('Usage: tsx exportStoryTaggedTtsText.ts -- <story-uuid> [--out=path.txt]');
    process.exit(1);
  }

  const finalResult = await getAssetRepository().findFinalCompletedAudioByStoryId(storyId);
  if (!finalResult) {
    console.error(`No final completed audio for story ${storyId}`);
    process.exit(1);
  }

  const allAudio = await getAssetRepository().findAudioAssetsByStoryId(storyId);
  const partials = allAudio
    .filter(
      (r) =>
        r.status === 'completed' &&
        r.sceneGroupIndex !== null &&
        r.sceneGroupIndex !== undefined &&
        !r.isFinal
    )
    .sort((a, b) => Number(a.sceneGroupIndex) - Number(b.sceneGroupIndex));

  const lines: string[] = [
    'Story tagged TTS export',
    `storyId: ${storyId}`,
    `exportedAt: ${new Date().toISOString()}`,
    '',
  ];

  if (partials.length > 0) {
    const assets = await Promise.all(
      partials.map((row) => getAssetRepository().findById(row.assetId))
    );
    for (let i = 0; i < partials.length; i++) {
      const row = partials[i]!;
      const asset = assets[i];
      const gp = asset?.generationParams as Record<string, unknown> | undefined;
      const style = readVendorStylePromptEnFromGenerationParams(gp ?? {});
      const tagged =
        row.synthesisTaggedText?.trim() ||
        (typeof gp?.ttsSynthesisText === 'string' ? gp.ttsSynthesisText.trim() : '');
      lines.push(
        `=== GROUP ${row.sceneGroupIndex} (assets.id=${row.assetId}) ===`,
        '',
        '=== VENDOR_STYLE_PROMPT_EN ===',
        style || '(none)',
        '',
        '=== SYNTHESIS_TAGGED_TEXT ===',
        tagged || '(empty)',
        ''
      );
    }
  } else {
    lines.push('(No partial audio_assets rows — single-path or legacy data.)', '');
  }

  const fromColumn = finalResult.audioAsset.synthesisTaggedText?.trim();
  const finalGp = finalResult.asset.generationParams as Record<string, unknown> | null | undefined;
  const fromParams =
    typeof finalGp?.ttsSynthesisText === 'string' ? finalGp.ttsSynthesisText.trim() : '';
  const fullText = fromColumn || fromParams;
  if (!fullText) {
    console.error('No synthesis_tagged_text or generation_params.ttsSynthesisText on final asset');
    process.exit(1);
  }

  const finalStyle = readVendorStylePromptEnFromGenerationParams(finalGp ?? {});
  lines.push(
    '=== FINAL ASSET (concatenated TTS input, audio_assets.is_final=true) ===',
    `assets.id=${finalResult.asset.id}`,
    '',
    '=== VENDOR_STYLE_PROMPT_EN (stored on final asset; often first-chunk style) ===',
    finalStyle || '(none)',
    '',
    '=== SYNTHESIS_TAGGED_TEXT (full) ===',
    fullText,
    ''
  );

  const apiRoot = path.resolve(__dirname, '../..');
  const defaultOut = path.join(apiRoot, `story-${storyId}-tagged-tts.txt`);
  const outArg = parseOutArg();
  const outPath = outArg
    ? path.isAbsolute(outArg)
      ? outArg
      : path.resolve(process.cwd(), outArg)
    : defaultOut;

  const body = lines.join('\n');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, 'utf8');
  console.log(
    `Wrote ${outPath} (${body.length} chars, groups=${partials.length}, full=${fullText.length} chars)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
