/**
 * One-off: load a story from DB, build the same narration canon as deferred TTS, run the prosody LLM,
 * write tagged text (and optional Google style prompt) to a file.
 *
 * Requires DATABASE_URL, text vendor key (e.g. GEMINI_API_KEY), same as production prosody.
 *
 * Usage:
 *   pnpm --filter wondertales-api exec tsx src/scripts/runStoryDeferredProsody.ts -- --story-id=<uuid>
 *   pnpm --filter wondertales-api exec tsx src/scripts/runStoryDeferredProsody.ts -- <uuid> [--out=./tagged.txt] [--provider=google]
 *
 * Compare full-text vs index-json branches (same as production parallel LLM), save raw index JSON:
 *   ... -- --story-id=<uuid> --compare-branches [--index-out=./story-uuid-index-raw.txt]
 *
 * When `stories.full_text` is empty, scene text is grouped like audio jobs (`groupScenesIntoChunks`;
 * concurrency defaults to 2, override with `DEFER_TTS_CONCURRENCY=5`).
 */

import './loadEnvForScripts';

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { groupScenesIntoChunks } from '../domain/audio/sceneGrouper';
import { getAudioProviderByName, getTextProvider } from '../services/aiService';
import { enrichDeferredProsodyForTtsChunk } from '../services/ttsProsodyTaggingService';
import { getSceneRepository, getStoryRepository } from '../repositories';
import { stripForAudio } from '../utils/audioTags';
import { logger } from '../utils/logger';
import { evaluateProsodyLexicalDiffPolicy } from '../utils/ttsProsodyCanonLexicalDiff';
import {
  explainTaggedCanonMismatch,
  normalizeCanonLikeAudioDomain,
  validateTaggedAgainstCanon,
} from '../utils/ttsProsodyTaggedText';

const StoryIdSchema = z.string().uuid();

function parseStoryId(): string | null {
  const fromEq = process.argv.find((a) => a.startsWith('--story-id='));
  if (fromEq) {
    const v = fromEq.slice('--story-id='.length).trim();
    return v || null;
  }
  const dash = process.argv.indexOf('--');
  const rest = dash >= 0 ? process.argv.slice(dash + 1) : process.argv.slice(2);
  const pos = rest.find((a) => !a.startsWith('--') && StoryIdSchema.safeParse(a.trim()).success);
  return pos?.trim() || null;
}

function parseOutPath(storyId: string): string {
  const raw = process.argv.find((a) => a.startsWith('--out='));
  if (!raw) {
    const apiRoot = path.resolve(__dirname, '../..');
    return path.join(apiRoot, `story-${storyId}-tagged-tts.txt`);
  }
  const p = raw.slice('--out='.length).trim();
  if (!p) {
    const apiRoot = path.resolve(__dirname, '../..');
    return path.join(apiRoot, `story-${storyId}-tagged-tts.txt`);
  }
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function parseProvider(): string {
  const raw = process.argv.find((a) => a.startsWith('--provider='));
  const v = raw ? raw.slice('--provider='.length).trim().toLowerCase() : '';
  return v || 'google';
}

function parseCompareBranches(): boolean {
  return process.argv.includes('--compare-branches');
}

function parseIndexOutPath(storyId: string): string | null {
  if (!parseCompareBranches()) return null;
  const raw = process.argv.find((a) => a.startsWith('--index-out='));
  if (!raw) {
    const apiRoot = path.resolve(__dirname, '../..');
    return path.join(apiRoot, `story-${storyId}-deferred-prosody-index-raw.txt`);
  }
  const p = raw.slice('--index-out='.length).trim();
  if (!p) {
    const apiRoot = path.resolve(__dirname, '../..');
    return path.join(apiRoot, `story-${storyId}-deferred-prosody-index-raw.txt`);
  }
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function assertTextProviderConfigured(): void {
  const v = (process.env.AI_TEXT_VENDOR || 'gemini').trim();
  if (v === 'gemini' && !process.env.GEMINI_API_KEY?.trim()) {
    console.error('GEMINI_API_KEY is required (AI_TEXT_VENDOR=gemini).');
    process.exit(1);
  }
  if (v === 'openai' && !process.env.OPENAI_API_KEY?.trim()) {
    console.error('OPENAI_API_KEY is required (AI_TEXT_VENDOR=openai).');
    process.exit(1);
  }
}

function parseConcurrency(): number {
  const raw = process.env.DEFER_TTS_CONCURRENCY?.trim();
  const n = raw ? Number(raw) : 2;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}

async function main(): Promise<void> {
  assertTextProviderConfigured();

  const storyIdRaw = parseStoryId();
  const parsedId = storyIdRaw ? StoryIdSchema.safeParse(storyIdRaw) : null;
  if (!parsedId?.success) {
    console.error(
      'Usage: tsx src/scripts/runStoryDeferredProsody.ts -- --story-id=<uuid> [--out=path] [--provider=google]\n' +
        '   or: tsx src/scripts/runStoryDeferredProsody.ts -- <uuid> ...'
    );
    process.exit(1);
  }
  const storyId = parsedId.data;

  const providerName = parseProvider();
  const story = await getStoryRepository().findById(storyId);
  if (!story) {
    console.error(`Story not found: ${storyId}`);
    process.exit(1);
  }

  const language = (story.language || 'en').toLowerCase();

  let rawNarration: string;
  if (story.fullText && String(story.fullText).trim().length > 0) {
    rawNarration = String(story.fullText);
  } else {
    const scenes = await getSceneRepository().findByStoryId(storyId);
    if (scenes.length === 0) {
      console.error('Story has no full_text and no scenes.');
      process.exit(1);
    }
    const scenesForAudio = scenes.map((s) => ({
      sceneId: s.sceneId,
      text: stripForAudio(s.text || ''),
    }));
    const chunkProvider = getAudioProviderByName(providerName);
    const maxCharsPerChunk = chunkProvider.getMaxCharsPerChunk();
    const concurrencyLimit = parseConcurrency();
    const sceneGroups = groupScenesIntoChunks(scenesForAudio, concurrencyLimit, maxCharsPerChunk);
    rawNarration = sceneGroups.map((g) => g.text).join(' ');
    logger.info(
      { storyId, groups: sceneGroups.length, concurrencyLimit, maxCharsPerChunk },
      'Built narration from scenes (no full_text)'
    );
  }

  const fullCanon = normalizeCanonLikeAudioDomain(rawNarration, language);
  console.log('language:', language, 'canonChars:', fullCanon.length);

  let catalog;
  try {
    catalog = getAudioProviderByName(providerName).getTtsSpeechTagCatalog();
  } catch (e) {
    console.error(`Provider "${providerName}": ${(e as Error).message}`);
    process.exit(1);
  }

  if (catalog.markupModel === 'none_use_instructions') {
    console.error('Catalog has no deferred markup; nothing to generate.');
    process.exit(1);
  }

  // Warm / verify text provider (matches verifyDeferredTtsProsody pattern)
  getTextProvider();

  const compareBranches = parseCompareBranches();
  const indexOutPath = parseIndexOutPath(storyId);

  const enriched = await enrichDeferredProsodyForTtsChunk({
    canonText: fullCanon,
    catalog,
    language,
    storyId,
    includeVendorStylePromptEn: providerName === 'google',
    captureBranchDiagnostics: compareBranches,
  });

  const ok = validateTaggedAgainstCanon(enriched.taggedText, fullCanon, catalog, language);
  const diag = enriched.branchDiagnostics;
  const lines: string[] = [
    'Deferred TTS prosody — from DB story',
    `storyId: ${storyId}`,
    `written: ${new Date().toISOString()}`,
    `provider: ${providerName}`,
    `markupModel: ${catalog.markupModel}`,
    `usedLlm: ${enriched.usedLlm}`,
    `canonValidationOk: ${ok}`,
    ...(diag
      ? [
          `branchCompare: parallelIndex=${String(diag.deferredProsodyParallelIndex)} productionWinner=${diag.winner}`,
          `fullTextBranch: status=${diag.fullText.status} finalizeOk=${String(diag.fullText.finalizeOk)}`,
          `indexJsonBranch: status=${diag.indexJson.status} finalizeOk=${String(diag.indexJson.finalizeOk)}`,
        ]
      : []),
    '',
    '=== CANON (normalized narration) ===',
    fullCanon,
    '',
    '=== TAGGED_TEXT ===',
    enriched.taggedText,
    '',
  ];

  if (enriched.vendorStylePromptEn?.trim()) {
    lines.push('=== VENDOR_STYLE_PROMPT_EN ===', enriched.vendorStylePromptEn.trim(), '');
  }

  if (diag) {
    lines.push(
      '=== BRANCH: FULL TEXT (after finalize) ===',
      diag.fullText.taggedAfterFinalize,
      '',
      '=== BRANCH: INDEX JSON (after finalize) ===',
      diag.indexJson.taggedAfterFinalize,
      '',
      '=== BRANCH NOTES ===',
      `fullText raw keys: ${diag.fullText.rawParsed ? Object.keys(diag.fullText.rawParsed).join(', ') : '(none)'}`,
      `indexJson applied before finalize: ${diag.indexJson.appliedBeforeFinalize ? 'yes' : 'no'}`,
      ''
    );
  }

  if (!ok) {
    const detail = explainTaggedCanonMismatch(enriched.taggedText, fullCanon, catalog, language);
    const lexical = evaluateProsodyLexicalDiffPolicy(
      enriched.taggedText,
      fullCanon,
      catalog,
      language
    );
    lines.push(
      '=== VALIDATION_MISMATCH ===',
      `index: ${detail.index} lenStripped: ${detail.lenA} lenCanon: ${detail.lenB}`,
      `windowStripped: ${JSON.stringify(detail.windowA)}`,
      `windowCanon: ${JSON.stringify(detail.windowB)}`,
      '',
      '=== LEXICAL_DIFF_POLICY ===',
      lexical.policySummary,
      `approvedBracketTagCount: ${lexical.approvedBracketTagCount}`,
      '',
      '=== UNIFIED_DIFF_LEXICAL_NORMALIZED (minus = canon, plus = LLM after strip+norm) ===',
      lexical.unifiedDiffLexicalNormalized || '(empty)',
      ''
    );
    logger.warn(
      { storyId, ...detail },
      'Tagged output did not pass canon validation (see file section)'
    );
  }

  const outPath = parseOutPath(storyId);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log('Wrote:', outPath);

  if (indexOutPath && diag) {
    const indexPayload = {
      written: new Date().toISOString(),
      storyId,
      provider: providerName,
      indexJsonStatus: diag.indexJson.status,
      indexJsonFinalizeOk: diag.indexJson.finalizeOk,
      productionWinner: diag.winner,
      rawParsed: diag.indexJson.rawParsed ?? null,
    };
    fs.mkdirSync(path.dirname(indexOutPath), { recursive: true });
    fs.writeFileSync(indexOutPath, JSON.stringify(indexPayload, null, 2), 'utf8');
    console.log('Wrote index branch raw JSON:', indexOutPath);
  }

  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
