/**
 * Smoke-test deferred prosody tagging for Gemini-TTS and Grok catalogs:
 * sample prose → LLM `taggedText` → strip approved markup → must equal canon (empty diff vs normalized original).
 *
 * Requires the configured text vendor API key (default Gemini: GEMINI_API_KEY).
 * Google Cloud / Grok TTS credentials are not required — only `getAudioProviderByName` catalog + text LLM.
 *
 * Usage:
 *   pnpm --filter wondertales-api verify:defer-tts-prosody
 *   pnpm --filter wondertales-api verify:defer-tts-prosody -- --llm
 *   pnpm --filter wondertales-api verify:defer-tts-prosody -- --providers=google
 *   pnpm --filter wondertales-api verify:defer-tts-prosody -- --tagged-out=./my-tagged.txt
 *   (Provider `google`: one LLM call returns `taggedText` + `vendorStylePromptEn`. Grok: `taggedText` only.)
 *   pnpm --filter wondertales-api verify:defer-tts-prosody -- --from-file=story-llm-generated-sample.txt
 *   pnpm --filter wondertales-api verify:defer-tts-prosody -- --from-file=story-ru-scary-sample.txt --language=ru --tagged-out=./defer-tts-ru-scary-tagged-output.txt
 *   (--from-file wins over --llm; path relative to cwd or services/api/)
 */
import './loadEnvForScripts';

import fs from 'fs';
import path from 'path';
import { enrichDeferredProsodyForTtsChunk } from '../services/ttsProsodyTaggingService';
import { getAudioProviderByName, getTextProvider } from '../services/aiService';
import { stripAllTags } from '../utils/audioTags';
import {
  normalizeCanonLikeAudioDomain,
  stripApprovedCatalogMarkup,
  validateTaggedAgainstCanon,
} from '../utils/ttsProsodyTaggedText';

const STATIC_PROSE =
  'Luna walked to the window. The garden looked quiet after the rain. ' +
  '"Should we go outside?" she asked. Mother smiled and nodded.';

function parseProviders(): string[] {
  const raw = process.argv.find((a) => a.startsWith('--providers='));
  if (!raw) return ['google', 'grok'];
  return raw
    .slice('--providers='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function wantsLlm(): boolean {
  return process.argv.includes('--llm');
}

function parseFromFileArg(): string | null {
  const raw = process.argv.find((a) => a.startsWith('--from-file='));
  if (!raw) return null;
  const rel = raw.slice('--from-file='.length).trim();
  if (!rel) return null;
  if (path.isAbsolute(rel)) return rel;
  const fromCwd = path.resolve(process.cwd(), rel);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const apiPackageRoot = path.resolve(__dirname, '../..');
  return path.resolve(apiPackageRoot, rel);
}

/** App story language (canon normalize + LLM + validation). Default `en`. */
function parseLanguageArg(): string {
  const raw = process.argv.find((a) => a.startsWith('--language='));
  const v = raw ? raw.slice('--language='.length).trim().toLowerCase() : '';
  return v || 'en';
}

/**
 * Strip director-style headers and scene labels; remove old [audio] tags so prosody starts from clean prose.
 * If the file has `--- fullText ---`, use only that block (single canonical narration) — avoids duplicating per-scene + fullText.
 */
function proseFromDirectorSampleFile(raw: string): string {
  const fullTextMatch = raw.match(/---\s*fullText\s*---\s*([\s\S]*?)(?:\n---|\s*$)/i);
  let body: string;
  if (fullTextMatch && fullTextMatch[1]?.trim()) {
    body = fullTextMatch[1].trim();
  } else {
    body = raw;
    const scenesIdx = raw.search(/---\s*scenes\s*---/i);
    if (scenesIdx >= 0) {
      body = raw.slice(scenesIdx).replace(/^---\s*scenes\s*---\s*/i, '');
    }
    body = body
      .replace(/^###\s*scene\s*\d+\s*$/gim, '\n\n')
      .replace(/^title:.*$/gim, '')
      .replace(/^description:.*$/gim, '')
      .replace(/^wordCount:.*$/gim, '');
  }
  return stripAllTags(body).replace(/\s{2,}/g, ' ').trim();
}

/** UTF-8 text file: canon + per-provider taggedText (default: services/api/defer-tts-tagged-output.txt). */
function parseTaggedOutPath(): string {
  const raw = process.argv.find((a) => a.startsWith('--tagged-out='));
  const apiPackageRoot = path.resolve(__dirname, '../..');
  if (!raw) return path.join(apiPackageRoot, 'defer-tts-tagged-output.txt');
  const p = raw.slice('--tagged-out='.length).trim();
  if (!p) return path.join(apiPackageRoot, 'defer-tts-tagged-output.txt');
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

function firstMismatchDetail(expected: string, actual: string): string {
  const minLen = Math.min(expected.length, actual.length);
  for (let i = 0; i < minLen; i++) {
    if (expected[i] !== actual[i]) {
      const span = 56;
      return (
        `diverge at index ${i}:\n` +
        `  expected: ${JSON.stringify(expected.slice(Math.max(0, i - 16), i + span))}\n` +
        `  actual:   ${JSON.stringify(actual.slice(Math.max(0, i - 16), i + span))}`
      );
    }
  }
  if (expected.length !== actual.length) {
    return `length mismatch: expected ${expected.length}, actual ${actual.length}`;
  }
  return '(strings equal)';
}

async function maybeGenerateProseWithLlm(): Promise<string> {
  if (!wantsLlm()) return STATIC_PROSE;
  const tp = getTextProvider();
  const text = await tp.generateText({
    prompt: [
      'Write exactly two short paragraphs of children story narration in English.',
      'Plain prose only. Do not use square brackets. Do not use angle-bracket tags.',
      'About 70–120 words. One named child and one adult.',
      'Finish with a complete final sentence (period at the end).',
    ].join('\n'),
    temperature: 0.65,
    maxTokens: 8192,
    operation: 'verify_defer_tts_story_sample',
  });
  return text.trim();
}

async function main(): Promise<void> {
  assertTextProviderConfigured();

  const storyLanguage = parseLanguageArg();
  const fromPath = parseFromFileArg();
  let rawProse: string;
  if (fromPath) {
    if (!fs.existsSync(fromPath)) {
      console.error(`--from-file not found: ${fromPath}`);
      process.exit(1);
    }
    rawProse = proseFromDirectorSampleFile(fs.readFileSync(fromPath, 'utf8'));
    console.log(`Loaded prose from ${fromPath} (${rawProse.length} chars after cleanup)`);
  } else if (wantsLlm()) {
    rawProse = await maybeGenerateProseWithLlm();
  } else {
    rawProse = STATIC_PROSE;
  }

  const canon = normalizeCanonLikeAudioDomain(rawProse, storyLanguage);
  console.log('Story language:', storyLanguage);
  console.log('Canon length:', canon.length);
  console.log('Canon (first 220 chars):', canon.slice(0, 220).replace(/\n/g, '\\n'));
  console.log('Canon (last 120 chars):', canon.slice(-120).replace(/\n/g, '\\n'));
  console.log('---');

  const providers = parseProviders();
  let ran = 0;
  let failed = false;
  const taggedRuns: Array<{
    provider: string;
    markupModel: string;
    taggedText: string;
    vendorStylePromptEn?: string;
    usedLlm: boolean;
    ok: boolean;
  }> = [];

  for (const name of providers) {
    let catalog;
    try {
      catalog = getAudioProviderByName(name).getTtsSpeechTagCatalog();
    } catch (e) {
      console.warn(`[SKIP] provider "${name}": ${(e as Error).message}`);
      continue;
    }

    ran++;
    console.log(`\n=== Catalog: ${name} (markupModel=${catalog.markupModel}) ===`);

    const { taggedText, usedLlm, vendorStylePromptEn } = await enrichDeferredProsodyForTtsChunk({
      canonText: canon,
      catalog,
      language: storyLanguage,
      storyId: `verify-deferred-tts-prosody:${name}`,
      includeVendorStylePromptEn: name === 'google',
    });

    console.log('usedLlm:', usedLlm, 'taggedLen:', taggedText.length);
    console.log('Tagged preview:', taggedText.slice(0, 280).replace(/\n/g, '\\n'));
    if (vendorStylePromptEn?.trim()) {
      console.log(
        'Style prompt (first 200 chars):',
        vendorStylePromptEn.trim().slice(0, 200).replace(/\n/g, '\\n')
      );
    }

    const ok = validateTaggedAgainstCanon(taggedText, canon, catalog, storyLanguage);
    taggedRuns.push({
      provider: name,
      markupModel: catalog.markupModel,
      taggedText,
      vendorStylePromptEn: vendorStylePromptEn?.trim() || undefined,
      usedLlm,
      ok,
    });
    if (!ok) {
      failed = true;
      const stripped = stripApprovedCatalogMarkup(taggedText, catalog);
      const normStripped = normalizeCanonLikeAudioDomain(stripped, storyLanguage);
      console.error('[FAIL] stripped tagged text does not match canon.');
      console.error(firstMismatchDetail(canon, normStripped));
    } else {
      console.log('[OK] strip(tags) vs canon — empty diff (normalized match).');
    }
  }

  if (ran === 0) {
    console.error('No providers ran (all skipped or empty --providers).');
    process.exit(1);
  }

  const outPath = parseTaggedOutPath();
  const lines: string[] = [
    'Deferred TTS prosody — generated samples',
    `Written: ${new Date().toISOString()}`,
    '',
    '=== CANON (plain narration, no vendor audio tags) ===',
    canon,
    '',
  ];
  for (const r of taggedRuns) {
    lines.push(
      `=== TAGGED: ${r.provider} (markupModel=${r.markupModel}, usedLlm=${r.usedLlm}, canonOk=${r.ok}) ===`,
      r.taggedText,
      ''
    );
    if (r.vendorStylePromptEn) {
      lines.push(`=== VENDOR_STYLE_PROMPT_EN: ${r.provider} ===`, r.vendorStylePromptEn, '');
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`\nTagged text sample written to: ${outPath}`);

  if (failed) process.exit(1);
  console.log('\nAll ran providers passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
