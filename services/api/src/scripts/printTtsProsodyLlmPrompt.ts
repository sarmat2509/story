/**
 * Print the exact free-text prompt sent to Gemini for deferred prosody (`tts_prosody_tags`).
 *
 * Usage:
 *   pnpm --filter wondertales-api exec tsx src/scripts/printTtsProsodyLlmPrompt.ts -- --from-file=defer-tts-ru-scary-tagged-output.txt --vendor=google --language=ru
 *   pnpm --filter wondertales-api exec tsx src/scripts/printTtsProsodyLlmPrompt.ts -- --from-file=... --vendor=grok --language=ru --no-style
 *   ... --out=./tts-prosody-llm-prompt.txt
 */

import './loadEnvForScripts';

import fs from 'fs';
import path from 'path';
import { composeDeferredProsodyLlmPrompt } from '../services/ttsProsodyTaggingService';
import { buildGoogleGeminiTtsSpeechTagCatalog, buildGrokSpeechTagCatalog } from '../providers/audio/ttsSpeechTagCatalogs';
import { normalizeCanonLikeAudioDomain } from '../utils/ttsProsodyTaggedText';

function parseArg(prefix: string): string | null {
  const raw = process.argv.find((a) => a.startsWith(prefix));
  if (!raw) return null;
  return raw.slice(prefix.length).trim() || null;
}

function resolvePath(rel: string): string {
  if (path.isAbsolute(rel)) return rel;
  const fromCwd = path.resolve(process.cwd(), rel);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.resolve(path.resolve(__dirname, '../..'), rel);
}

/** Prefer `--- fullText ---` (story sample), else `=== CANON ... ===` (verify output), else whole file. */
function canonFromSampleFile(raw: string): string {
  const fullTextMatch = raw.match(/---\s*fullText\s*---\s*([\s\S]*?)(?:\n---|\s*$)/i);
  if (fullTextMatch && fullTextMatch[1]?.trim()) {
    return fullTextMatch[1].trim().replace(/\s{2,}/g, ' ').trim();
  }
  const canonMatch = raw.match(
    /===\s*CANON[^=\n]*===\s*\n([\s\S]*?)(?=\n===\s*(?:TAGGED:|GEMINI_STYLE|VENDOR_STYLE|\s*$))/i
  );
  if (canonMatch && canonMatch[1]?.trim()) {
    return canonMatch[1].trim().replace(/\s{2,}/g, ' ').trim();
  }
  return raw.trim().replace(/\s{2,}/g, ' ').trim();
}

async function main(): Promise<void> {
  const fromRel = parseArg('--from-file=') || 'defer-tts-ru-scary-tagged-output.txt';
  const vendor = (parseArg('--vendor=') || 'google').toLowerCase();
  const language = (parseArg('--language=') || 'en').trim() || 'en';
  const noStyle = process.argv.includes('--no-style');
  const outPath = parseArg('--out=');

  const fromPath = resolvePath(fromRel);
  if (!fs.existsSync(fromPath)) {
    console.error(`File not found: ${fromPath}`);
    process.exit(1);
  }

  const catalog =
    vendor === 'grok' ? buildGrokSpeechTagCatalog() : buildGoogleGeminiTtsSpeechTagCatalog();
  const raw = fs.readFileSync(fromPath, 'utf8');
  let canonFull = canonFromSampleFile(raw);
  if (!canonFull) {
    console.error('Empty canon after parse.');
    process.exit(1);
  }
  canonFull = normalizeCanonLikeAudioDomain(canonFull, language);
  const canonText = canonFull.trim();

  const includeVendorStylePromptEn = !noStyle && vendor === 'google';
  const prompt = composeDeferredProsodyLlmPrompt({
    canonText,
    catalog,
    language,
    includeVendorStylePromptEn,
  });

  const header = [
    `# Deferred prosody LLM prompt dump (same assembly as enrichDeferredProsodyForTtsChunk → generateStructured)`,
    `# from: ${fromPath}`,
    `# vendor: ${vendor} (markupModel=${catalog.markupModel})`,
    `# language: ${language}`,
    `# includeVendorStylePromptEn: ${includeVendorStylePromptEn}`,
    `# canon chars: ${canonText.length}  prompt chars: ${prompt.length}`,
    '',
  ].join('\n');

  const full = header + prompt;
  if (outPath) {
    const out = path.isAbsolute(outPath) ? outPath : path.resolve(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, full, 'utf8');
    console.log(`Wrote ${out} (${full.length} bytes)`);
  } else {
    process.stdout.write(full);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
