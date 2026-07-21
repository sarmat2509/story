/**
 * Read `=== TAGGED: google|grok ===` and optional `=== VENDOR_STYLE_PROMPT_EN: google ===` from verify output
 * (legacy `=== GEMINI_STYLE_PROMPT_EN: ... ===` still parsed), then synthesize MP3 per provider.
 *
 * Requires provider credentials (Google Cloud TTS + Grok as needed). Uses bundled/system ffmpeg for concat.
 * Does not import aiService (avoids db + process signal handlers from repository graph).
 *
 * Env (optional):
 *   DEFER_TTS_GOOGLE_VOICE  — Gemini-TTS voice id from the app catalog (default: Charon).
 *   DEFER_TTS_GROK_VOICE    — xAI voice id (default: eve)
 *   DEFER_TTS_LANGUAGE      — app locale, default en
 *
 * Usage:
 *   pnpm --filter wondertales-api defer-tts:tagged-to-audio
 *   pnpm --filter wondertales-api exec tsx src/scripts/deferTaggedSamplesToTtsAudio.ts -- --from-file=defer-tts-tagged-output.txt --out=./defer-tts-audio-out
 *   pnpm --filter wondertales-api exec tsx src/scripts/deferTaggedSamplesToTtsAudio.ts -- --providers=google
 *   pnpm --filter wondertales-api exec tsx src/scripts/deferTaggedSamplesToTtsAudio.ts -- --omit-google-style-prompt
 *     (skip VENDOR_STYLE_PROMPT_EN for Google — sometimes avoids Vertex “usage guidelines” rejects on spooky kids’ text.)
 *
 * When both google and grok sections exist, they are synthesized in parallel (Promise.all).
 */

import './loadEnvForScripts';

import fs from 'fs';
import path from 'path';
import config from '../config';
import type { IAudioProvider } from '../providers/base/IAudioProvider';
import { GoogleTTSProvider } from '../providers/audio/google/GoogleTTSProvider';
import { GrokTTSProvider } from '../providers/audio/grok/GrokTTSProvider';
import { concatenateAudioBuffers } from '../domain/audio/audioConcatenator';
import { logger } from '../utils/logger';

const PROVIDERS_IN_ORDER = ['google', 'grok'] as const;
type DeferredTtsProvider = (typeof PROVIDERS_IN_ORDER)[number];

function parseFromFileArg(): string {
  const raw = process.argv.find((a) => a.startsWith('--from-file='));
  const apiPackageRoot = path.resolve(__dirname, '../..');
  const rel = raw ? raw.slice('--from-file='.length).trim() : 'defer-tts-tagged-output.txt';
  if (path.isAbsolute(rel)) return rel;
  const fromCwd = path.resolve(process.cwd(), rel);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.resolve(apiPackageRoot, rel);
}

function parseOutDir(): string {
  const raw = process.argv.find((a) => a.startsWith('--out='));
  const apiPackageRoot = path.resolve(__dirname, '../..');
  const rel = raw ? raw.slice('--out='.length).trim() : 'defer-tts-audio-out';
  return path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), rel);
}

function parseProvidersFilter(): Set<DeferredTtsProvider> | null {
  const raw = process.argv.find((a) => a.startsWith('--providers='));
  if (!raw) return null;
  const names = raw
    .slice('--providers='.length)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is DeferredTtsProvider =>
      (PROVIDERS_IN_ORDER as readonly string[]).includes(s)
    );
  return new Set(names);
}

function wantsOmitGoogleStylePrompt(): boolean {
  return process.argv.includes('--omit-google-style-prompt');
}

/**
 * Parse sections written by verifyDeferredTtsProsody.ts:
 *   === TAGGED: google (...) ===
 *   ...text...
 */
function parseTaggedSections(raw: string): Partial<Record<DeferredTtsProvider, string>> {
  const out: Partial<Record<DeferredTtsProvider, string>> = {};
  const lines = raw.split(/\r?\n/);
  let current: DeferredTtsProvider | null = null;
  const buf: string[] = [];

  const flush = () => {
    if (current) {
      const text = buf.join('\n').trim();
      if (text.length > 0) out[current] = text;
      current = null;
      buf.length = 0;
    }
  };

  for (const line of lines) {
    const tagged = line.match(/^===\s+TAGGED:\s*(\w+)\s/i);
    if (tagged) {
      const name = tagged[1]!.toLowerCase();
      if (name === 'google' || name === 'grok') {
        flush();
        current = name;
        continue;
      }
    }
    if (current && line.startsWith('=== ') && !/^===\s+TAGGED:/i.test(line)) {
      flush();
      continue;
    }
    if (current) buf.push(line);
  }
  flush();
  return out;
}

/** Optional English vendor style block from verifyDeferredTtsProsody output (Google only). */
function parseVendorStylePromptSections(raw: string): Partial<Record<DeferredTtsProvider, string>> {
  const out: Partial<Record<DeferredTtsProvider, string>> = {};
  const lines = raw.split(/\r?\n/);
  let current: DeferredTtsProvider | null = null;
  const buf: string[] = [];

  const flush = () => {
    if (current) {
      const text = buf.join('\n').trim();
      if (text.length > 0) out[current] = text;
      current = null;
      buf.length = 0;
    }
  };

  const headerRe = /^===\s+(?:VENDOR_STYLE_PROMPT_EN|GEMINI_STYLE_PROMPT_EN):\s*(\w+)\s*===\s*$/i;

  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      const name = m[1]!.toLowerCase();
      if (name === 'google' || name === 'grok') {
        flush();
        current = name;
        continue;
      }
    }
    if (current && line.startsWith('=== ') && !headerRe.test(line)) {
      flush();
      continue;
    }
    if (current) buf.push(line);
  }
  flush();
  return out;
}

function splitTextIntoChunks(text: string, maxLen: number): string[] {
  const t = text.trim();
  if (t.length <= maxLen) return [t];
  const chunks: string[] = [];
  let start = 0;
  while (start < t.length) {
    if (t.length - start <= maxLen) {
      chunks.push(t.slice(start).trim());
      break;
    }
    const window = t.slice(start, start + maxLen);
    let take = window.length;
    const minBreak = Math.floor(maxLen * 0.35);
    for (const sep of ['. ', '? ', '! '] as const) {
      const idx = window.lastIndexOf(sep);
      if (idx >= minBreak) {
        take = idx + sep.length;
        break;
      }
    }
    if (take === window.length) {
      const sp = window.lastIndexOf(' ');
      if (sp >= Math.floor(maxLen * 0.25)) take = sp + 1;
    }
    const advance = Math.max(1, take);
    const piece = t.slice(start, start + advance).trim();
    if (piece.length > 0) chunks.push(piece);
    start += advance;
  }
  return chunks.filter((c) => c.length > 0);
}

async function synthesizeLongText(
  provider: IAudioProvider,
  text: string,
  voiceId: string,
  language: string,
  synthesizeStylePromptEn?: string
): Promise<Buffer> {
  const maxLen = Math.max(500, provider.getMaxCharsPerChunk());
  const parts = splitTextIntoChunks(text, maxLen);
  logger.info(
    { provider: provider.constructor?.name, chunks: parts.length, maxLen, totalChars: text.length },
    'TTS chunking'
  );
  const buffers: Buffer[] = [];
  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i]!;
    logger.info({ chunkIndex: i + 1, total: parts.length, chars: chunk.length }, 'Synthesizing chunk');
    const result = await provider.synthesize({
      text: chunk,
      voiceId,
      language,
      outputFormat: 'mp3',
      synthesizeStylePromptEn,
    });
    buffers.push(result.audioData);
  }
  if (buffers.length === 1) return buffers[0]!;
  const { buffer } = await concatenateAudioBuffers(buffers);
  return buffer;
}

function safeStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function createTtsProvider(name: DeferredTtsProvider): IAudioProvider {
  if (name === 'google') {
    const g = config.audio?.google;
    if (!g?.projectId || !g?.credentials) {
      throw new Error('Google Cloud project ID and credentials are required (config.audio.google)');
    }
    if (!fs.existsSync(g.credentials)) {
      throw new Error(
        `Google TTS credentials file not found: ${g.credentials} — set GOOGLE_APPLICATION_CREDENTIALS to a readable JSON path`
      );
    }
    return new GoogleTTSProvider(g.projectId, g.credentials, g.model);
  }
  const key = config.audio?.grok?.apiKey?.trim();
  if (!key) {
    throw new Error('Grok/xAI API key is required (GROK_API_KEY or XAI_API_KEY)');
  }
  return new GrokTTSProvider(key);
}

async function runOneProvider(
  name: DeferredTtsProvider,
  text: string,
  outDir: string,
  language: string,
  vendorStylePromptEn?: string
): Promise<void> {
  const voiceId =
    name === 'google'
      ? (process.env.DEFER_TTS_GOOGLE_VOICE || 'Charon').trim()
      : (process.env.DEFER_TTS_GROK_VOICE || 'eve').trim();

  const provider = createTtsProvider(name);
  const styleEn = name === 'google' ? vendorStylePromptEn?.trim() : undefined;
  if (styleEn) {
    console.log(`Using VENDOR_STYLE_PROMPT_EN (${styleEn.length} chars) for Google chunks`);
  }
  const audio = await synthesizeLongText(provider, text, voiceId, language, styleEn);
  const fileName = `${name}-${voiceId}-${safeStamp()}.mp3`;
  const filePath = path.join(outDir, fileName);
  fs.writeFileSync(filePath, audio);
  logger.info({ name, filePath, bytes: audio.length }, 'Saved TTS sample');
  console.log(`Wrote ${filePath} (${audio.length} bytes)`);
}

async function main(): Promise<void> {
  const fromPath = parseFromFileArg();
  const outDir = parseOutDir();
  const filter = parseProvidersFilter();
  const language = (process.env.DEFER_TTS_LANGUAGE || 'en').trim() || 'en';

  if (!fs.existsSync(fromPath)) {
    console.error(`Input file not found: ${fromPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(fromPath, 'utf8');
  const sections = parseTaggedSections(raw);
  const styleSections = parseVendorStylePromptSections(raw);

  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Input: ${fromPath}`);
  console.log(`Output dir: ${outDir}`);
  console.log(`Language: ${language}`);
  console.log('Sections found:', Object.keys(sections).join(', ') || '(none)');
  console.log('Style prompt sections:', Object.keys(styleSections).join(', ') || '(none)');

  const toRun: DeferredTtsProvider[] = [];
  for (const name of PROVIDERS_IN_ORDER) {
    if (filter && !filter.has(name)) continue;
    const text = sections[name];
    if (!text) {
      console.log(`[skip] No === TAGGED: ${name} === block in file`);
      continue;
    }
    toRun.push(name);
  }

  if (toRun.length === 0) {
    console.error('Nothing to synthesize (missing sections or empty --providers filter).');
    process.exit(1);
  }

  const omitGoogleStyle = wantsOmitGoogleStylePrompt();
  if (omitGoogleStyle) {
    console.log('Omitting VENDOR_STYLE_PROMPT_EN for Google (--omit-google-style-prompt).');
  }

  const outcomes = await Promise.all(
    toRun.map((name) => {
      const styleEn =
        name === 'google' && omitGoogleStyle ? undefined : styleSections[name];
      return runOneProvider(name, sections[name]!, outDir, language, styleEn)
        .then(() => true)
        .catch((err: unknown) => {
          logger.error({ err, name }, 'TTS synthesis failed');
          console.error(`[fail] ${name}:`, err instanceof Error ? err.message : String(err));
          return false;
        });
    })
  );

  const ran = outcomes.filter(Boolean).length;
  if (ran === 0) {
    console.error('All synthesis attempts failed.');
    process.exit(1);
  }
}

main().catch((e) => {
  logger.error({ err: e }, 'deferTaggedSamplesToTtsAudio failed');
  console.error(e);
  process.exit(1);
});
