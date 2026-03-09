/**
 * IMAGE_OTHER Diagnostic Test Script
 *
 * Isolates the root cause of elevated IMAGE_OTHER failure rates by varying
 * one parameter at a time against a known-good baseline.
 *
 * Run:  npx tsx src/scripts/testImageOtherDiagnostic.ts --test 1
 *       npx tsx src/scripts/testImageOtherDiagnostic.ts --test 2 --variant A
 *       npx tsx src/scripts/testImageOtherDiagnostic.ts --test 4 --variant D --iterations 3
 *
 * Options:
 *   --test N           Test number (1-7, required)
 *   --variant X        Variant letter (A/B/C/D, default: all for that test)
 *   --iterations N     Iterations per variant (default: 5)
 *   --cooldown N       Seconds between requests (default: 15)
 */

import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '23a825d6-d750-4297-bf17-5e2452d112aa';
const UPLOADS_BASE = path.resolve(__dirname, '../../uploads/development', USER_ID, 'photos');
const OUTPUT_BASE = path.resolve(__dirname, '../../test-output/image-other-diagnostic');

const MODEL = config.nanoBanana?.model || 'gemini-2.5-flash-image';
const ASPECT_RATIO = '16:9';

// Latest turnaround sheets (from Feb 16 generation)
const TURNAROUNDS = {
  strekoryb: { name: 'Стрекориб', file: 'character_turnaround/1771238652215.jpg' },
  binbon: { name: 'Бінбон', file: 'character_turnaround/1771242302524.jpg' },
  emilia: { name: 'Емілія', file: 'child_turnaround/1771191639812.jpg' },
};

// Original character drawings (for reference)
const ORIGINALS = {
  strekoryb: { name: 'Стрекориб', file: 'character/1770212034070.jpg' },
  binbon: { name: 'Бінбон', file: 'character/1770507457171.jpg' },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttemptResult {
  iteration: number;
  success: boolean;
  finishReason: string;
  durationMs: number;
  promptTokens?: number;
  imageTokens?: number;
  error?: string;
}

interface VariantResult {
  variant: string;
  description: string;
  attempts: AttemptResult[];
  successRate: string;
  successCount: number;
  totalCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadImage(relativePath: string): { buffer: Buffer; base64: string; mimeType: string } {
  const filePath = path.join(UPLOADS_BASE, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Image not found: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : 'image/jpeg';
  return { buffer, base64: buffer.toString('base64'), mimeType };
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg: string): void {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`  [${ts}] ${msg}`);
}

// ─── Gemini API Call ──────────────────────────────────────────────────────────

let aiClient: GoogleGenAI | null = null;
let fileManager: { upload: (buf: Buffer, mime: string, name: string) => Promise<string> } | null = null;

function getClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = config.google.apiKey;
    if (!apiKey) throw new Error('GOOGLE_API_KEY / GEMINI_API_KEY not set');
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

async function uploadToFilesApi(buffer: Buffer, mimeType: string, displayName: string): Promise<string> {
  const client = getClient();
  const blob = new Blob([buffer], { type: mimeType });
  const uploaded = await client.files.upload({
    file: blob,
    config: { mimeType, displayName },
  });
  if (!uploaded.uri) throw new Error('Files API upload returned no URI');
  return uploaded.uri;
}

async function callGemini(
  parts: any[],
  systemInstruction?: string,
): Promise<{ success: boolean; finishReason: string; promptTokens?: number; imageTokens?: number }> {
  const client = getClient();

  const requestConfig: any = {
    responseModalities: ['IMAGE'],
    imageConfig: { aspectRatio: ASPECT_RATIO },
  };
  if (systemInstruction) {
    requestConfig.systemInstruction = systemInstruction;
  }

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: requestConfig,
  });

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason || 'UNKNOWN';
  const usage = (response as any).usageMetadata;
  const promptTokens = usage?.promptTokenCount;
  const imageTokens = usage?.promptTokensDetails?.find((d: any) => d.modality === 'IMAGE')?.tokenCount;

  const hasImage = candidate?.content?.parts?.some((p: any) => p.inlineData) ?? false;

  return {
    success: hasImage && finishReason === 'STOP',
    finishReason,
    promptTokens,
    imageTokens,
  };
}

// ─── Run variant iterations ───────────────────────────────────────────────────

async function runVariant(
  variantLabel: string,
  description: string,
  buildRequest: () => Promise<{ parts: any[]; systemInstruction?: string }>,
  iterations: number,
  cooldownSec: number,
): Promise<VariantResult> {
  log(`── Variant ${variantLabel}: ${description}`);

  const attempts: AttemptResult[] = [];

  for (let i = 1; i <= iterations; i++) {
    const start = Date.now();
    try {
      const { parts, systemInstruction } = await buildRequest();
      const result = await callGemini(parts, systemInstruction);
      const durationMs = Date.now() - start;
      const icon = result.success ? '✓' : '✗';
      log(`  ${icon} Iteration ${i}/${iterations}: ${result.finishReason} (${(durationMs / 1000).toFixed(1)}s, prompt=${result.promptTokens || '?'}, img=${result.imageTokens || '?'})`);
      attempts.push({
        iteration: i,
        success: result.success,
        finishReason: result.finishReason,
        durationMs,
        promptTokens: result.promptTokens,
        imageTokens: result.imageTokens,
      });
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const reason = err.message?.includes('IMAGE_OTHER') ? 'IMAGE_OTHER'
        : err.message?.includes('SAFETY') ? 'SAFETY'
        : 'ERROR';
      log(`  ✗ Iteration ${i}/${iterations}: ${reason} (${(durationMs / 1000).toFixed(1)}s) — ${err.message?.substring(0, 80)}`);
      attempts.push({
        iteration: i,
        success: false,
        finishReason: reason,
        durationMs,
        error: err.message?.substring(0, 200),
      });
    }

    if (i < iterations) {
      log(`  ⏳ Cooldown ${cooldownSec}s...`);
      await sleep(cooldownSec * 1000);
    }
  }

  const successCount = attempts.filter(a => a.success).length;
  const successRate = `${successCount}/${iterations} (${((successCount / iterations) * 100).toFixed(0)}%)`;

  log(`  Result: ${successRate}`);
  log('');

  return {
    variant: variantLabel,
    description,
    attempts,
    successRate,
    successCount,
    totalCount: iterations,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Test 1: Bare Minimum Baseline ────────────────────────────────────────────

async function test1(iterations: number, cooldown: number): Promise<VariantResult[]> {
  const img = loadImage(TURNAROUNDS.strekoryb.file);
  const fileUri = await uploadToFilesApi(img.buffer, img.mimeType, 'test_strekoryb');

  return [await runVariant('A', '1 turnaround, no sysInstruction, fileUri', async () => ({
    parts: [
      { text: `Reference image of character "${TURNAROUNDS.strekoryb.name}".` },
      { fileData: { mimeType: img.mimeType, fileUri } },
      { text: "Children's book illustration: Стрекориб sitting on a rock in a sunny forest clearing. Keep character appearance exactly as shown in the reference. No text or letters." },
    ],
  }), iterations, cooldown)];
}

// ─── Test 2: System Instruction Length ────────────────────────────────────────

const SHORT_SYSTEM_INSTRUCTION =
  "You are a children's book illustrator.\n\n" +
  "ART STYLE: colorful cartoon style with bold outlines, bright saturated colors.\n\n" +
  "FORMAT: Single scene, children's book illustration. No speech bubbles, no text, no letters.\n\n" +
  "QUALITY: Safe for children, friendly expressions, no scary elements.";

function buildCurrentSystemInstruction(): string {
  return (
    "You are a professional children's book illustrator.\n\n" +
    "ART STYLE (must match exactly in every scene): colorful cartoon style with bold outlines, bright saturated colors, soft gradients, friendly and appealing character designs\n\n" +
    "FORMAT RULES:\n" +
    "- Single scene, children's book illustration\n" +
    "- No speech bubbles, no captions, no text, no letters, no words anywhere in the image\n" +
    "- Pure visual storytelling only\n\n" +
    "CHARACTER ROSTER (keep consistent across ALL scenes):\n" +
    "1. Стрекориб: imaginary character — match the design from the attached character sheet, rendered in the scene's art style\n" +
    "2. Бінбон: imaginary character — match the design from the attached character sheet, rendered in the scene's art style\n" +
    "3. Емілія: A young girl, approximately 4-5 years old, with light brown wavy hair, big blue eyes, and a cheerful smile\n\n" +
    "WORLD DESIGN (keep visually consistent when scenes share a location):\n" +
    '- "Спальня Емілії": A cozy child\'s bedroom with warm lighting, colorful bedding, toys on shelves, and drawings on the walls\n' +
    '- "Тропічний пляж": A pristine sandy beach with turquoise water, palm trees, and a friendly pirate ship anchored nearby\n' +
    '- "Джунглі острова": Dense tropical jungle with towering trees, colorful exotic flowers, and dappled sunlight\n' +
    '- "Печера зі скарбами": A small hidden cave with sandy floor, old wooden chest, and warm golden light from sunset\n' +
    '- "Палуба піратського корабля": Wooden ship deck with barrels, ropes, a helm, and a jolly roger flag\n\n' +
    "CONSISTENCY RULES:\n" +
    "- Character sheets define each character's DESIGN: shape, proportions, colors, distinctive features, outfit\n" +
    "- ALWAYS render every character in the scene's ART STYLE — do NOT copy the drawing style from the character sheet\n" +
    "- Keep the character's design identical across all scenes (same proportions, colors, patterns, details)\n" +
    "- Change ONLY: character poses, positions, expressions, and actions as described in the scene prompt\n" +
    "- When the scene shares a location with a previous scene image, keep the background layout consistent\n\n" +
    "QUALITY: Safe for children ages 4-5, friendly expressions, bright colors, no scary elements, no text or letters in the image."
  );
}

async function test2(iterations: number, cooldown: number, variant?: string): Promise<VariantResult[]> {
  const imgs = [
    { ...loadImage(TURNAROUNDS.strekoryb.file), name: TURNAROUNDS.strekoryb.name },
    { ...loadImage(TURNAROUNDS.binbon.file), name: TURNAROUNDS.binbon.name },
    { ...loadImage(TURNAROUNDS.emilia.file), name: TURNAROUNDS.emilia.name },
  ];
  const fileUris = await Promise.all(
    imgs.map(async (img, i) => uploadToFilesApi(img.buffer, img.mimeType, `turnaround_${i}`))
  );

  const buildParts = () => {
    const parts: any[] = [];
    imgs.forEach((img, i) => {
      parts.push({ text: `Image ${i + 1}: Character sheet for "${img.name}".` });
      parts.push({ fileData: { mimeType: img.mimeType, fileUri: fileUris[i] } });
    });
    parts.push({
      text:
        '- Image 1: Стрекориб\n- Image 2: Бінбон\n- Image 3: Емілія\n' +
        "- Scene: A cozy child's bedroom with warm lighting. All three characters are gathered around a treasure map on the floor.\n" +
        '- Camera: Medium shot from slightly above, showing all characters clearly.\n' +
        '- Lighting: Warm, soft daylight from a window.\n' +
        'No text or letters in the image.',
    });
    return parts;
  };

  const SLIM_SYSTEM_INSTRUCTION =
    "You are a professional children's book illustrator.\n\n" +
    "ART STYLE: colorful cartoon style with bold outlines, bright saturated colors, soft gradients, friendly and appealing character designs\n\n" +
    "FORMAT: Single scene, children's book illustration. No speech bubbles, no text, no letters. Pure visual storytelling.\n\n" +
    "REFERENCES: Character sheets define DESIGN (shape, proportions, colors, features). " +
    "Render every character in the scene's art style — do NOT copy the drawing style from the sheet.\n\n" +
    "QUALITY: Safe for children ages 4-5, friendly expressions, bright colors, no scary elements, no text or letters.";

  const variants: Array<{ key: string; desc: string; sysInstruction?: string }> = [
    { key: 'A', desc: 'No system instruction', sysInstruction: undefined },
    { key: 'B', desc: 'Short system instruction (~300 chars)', sysInstruction: SHORT_SYSTEM_INSTRUCTION },
    { key: 'C', desc: 'Full OLD system instruction (~2000 chars)', sysInstruction: buildCurrentSystemInstruction() },
    { key: 'D', desc: 'NEW slim system instruction (~650 chars)', sysInstruction: SLIM_SYSTEM_INSTRUCTION },
  ];

  const selected = variant ? variants.filter(v => v.key === variant.toUpperCase()) : variants;
  const results: VariantResult[] = [];

  for (const v of selected) {
    results.push(await runVariant(v.key, v.desc, async () => ({
      parts: buildParts(),
      systemInstruction: v.sysInstruction,
    }), iterations, cooldown));
  }

  return results;
}

// ─── Test 3: Prompt Format (Old vs New) ───────────────────────────────────────

async function test3(iterations: number, cooldown: number, variant?: string): Promise<VariantResult[]> {
  const imgs = [
    { ...loadImage(TURNAROUNDS.strekoryb.file), name: TURNAROUNDS.strekoryb.name },
    { ...loadImage(TURNAROUNDS.binbon.file), name: TURNAROUNDS.binbon.name },
    { ...loadImage(TURNAROUNDS.emilia.file), name: TURNAROUNDS.emilia.name },
  ];
  const fileUris = await Promise.all(
    imgs.map(async (img, i) => uploadToFilesApi(img.buffer, img.mimeType, `format_test_${i}`))
  );

  const sceneText =
    "Scene: A cozy child's bedroom with warm lighting. All three characters are gathered around a treasure map on the floor. " +
    'Camera: Medium shot, all characters clearly visible. Lighting: Warm daylight from a window. No text or letters.';

  const variants: Array<{ key: string; desc: string; buildParts: () => any[] }> = [
    {
      key: 'A',
      desc: 'Old format (inline descriptions per image)',
      buildParts: () => {
        const parts: any[] = [];
        parts.push({
          text: `IMPORTANT: Use the attached turnaround image of "${TURNAROUNDS.strekoryb.name}" and keep the same appearance: ` +
            'A whimsical imaginary creature with a fish-like body and dragonfly wings, colorful childish drawing style.',
        });
        parts.push({ fileData: { mimeType: imgs[0].mimeType, fileUri: fileUris[0] } });
        parts.push({
          text: `IMPORTANT: Use the attached turnaround image of "${TURNAROUNDS.binbon.name}" and keep the same appearance: ` +
            'A tall quirky creature with long limbs, blue nose, and sharp white teeth, childish sketch style.',
        });
        parts.push({ fileData: { mimeType: imgs[1].mimeType, fileUri: fileUris[1] } });
        parts.push({
          text: `IMPORTANT: Use the attached turnaround image of "${TURNAROUNDS.emilia.name}" and keep the same appearance: ` +
            'A young girl with light brown wavy hair, big blue eyes, and a cheerful smile.',
        });
        parts.push({ fileData: { mimeType: imgs[2].mimeType, fileUri: fileUris[2] } });
        parts.push({ text: sceneText });
        return parts;
      },
    },
    {
      key: 'B',
      desc: 'New format (labeled Image N references)',
      buildParts: () => {
        const parts: any[] = [];
        imgs.forEach((img, i) => {
          parts.push({ text: `Image ${i + 1}: Character sheet for "${img.name}".` });
          parts.push({ fileData: { mimeType: img.mimeType, fileUri: fileUris[i] } });
        });
        parts.push({
          text: `- Image 1: ${TURNAROUNDS.strekoryb.name}\n- Image 2: ${TURNAROUNDS.binbon.name}\n- Image 3: ${TURNAROUNDS.emilia.name}\n- ${sceneText}`,
        });
        return parts;
      },
    },
  ];

  const selected = variant ? variants.filter(v => v.key === variant.toUpperCase()) : variants;
  const results: VariantResult[] = [];

  for (const v of selected) {
    results.push(await runVariant(v.key, v.desc, async () => ({
      parts: v.buildParts(),
      systemInstruction: SHORT_SYSTEM_INSTRUCTION,
    }), iterations, cooldown));
  }

  return results;
}

// ─── Test 4: Number of Reference Images ───────────────────────────────────────

async function test4(iterations: number, cooldown: number, variant?: string): Promise<VariantResult[]> {
  const allImgs = [
    { ...loadImage(TURNAROUNDS.strekoryb.file), name: TURNAROUNDS.strekoryb.name },
    { ...loadImage(TURNAROUNDS.binbon.file), name: TURNAROUNDS.binbon.name },
    { ...loadImage(TURNAROUNDS.emilia.file), name: TURNAROUNDS.emilia.name },
  ];
  const allUris = await Promise.all(
    allImgs.map(async (img, i) => uploadToFilesApi(img.buffer, img.mimeType, `ref_count_${i}`))
  );

  const variants: Array<{ key: string; desc: string; count: number }> = [
    { key: 'A', desc: '0 references (text only)', count: 0 },
    { key: 'B', desc: '1 reference (Стрекориб)', count: 1 },
    { key: 'C', desc: '2 references (Стрекориб + Бінбон)', count: 2 },
    { key: 'D', desc: '3 references (Стрекориб + Бінбон + Емілія)', count: 3 },
  ];

  const selected = variant ? variants.filter(v => v.key === variant.toUpperCase()) : variants;
  const results: VariantResult[] = [];

  for (const v of selected) {
    results.push(await runVariant(v.key, v.desc, async () => {
      const parts: any[] = [];
      for (let i = 0; i < v.count; i++) {
        parts.push({ text: `Image ${i + 1}: Character sheet for "${allImgs[i].name}".` });
        parts.push({ fileData: { mimeType: allImgs[i].mimeType, fileUri: allUris[i] } });
      }
      const charNames = allImgs.slice(0, v.count).map((img, i) => `Image ${i + 1}: ${img.name}`);
      const charList = charNames.length > 0 ? charNames.join('\n- ') + '\n' : '';
      parts.push({
        text:
          (charList ? `- ${charList}` : '') +
          "- Scene: A cozy child's bedroom with warm lighting. Characters are gathered around a treasure map.\n" +
          '- Camera: Medium shot from slightly above.\n' +
          '- Lighting: Warm, soft daylight.\n' +
          'No text or letters in the image.',
      });
      return { parts, systemInstruction: SHORT_SYSTEM_INSTRUCTION };
    }, iterations, cooldown));
  }

  return results;
}

// ─── Test 5: Delivery Method ──────────────────────────────────────────────────

async function test5(iterations: number, cooldown: number, variant?: string): Promise<VariantResult[]> {
  const imgs = [
    { ...loadImage(TURNAROUNDS.strekoryb.file), name: TURNAROUNDS.strekoryb.name },
    { ...loadImage(TURNAROUNDS.binbon.file), name: TURNAROUNDS.binbon.name },
    { ...loadImage(TURNAROUNDS.emilia.file), name: TURNAROUNDS.emilia.name },
  ];
  const fileUris = await Promise.all(
    imgs.map(async (img, i) => uploadToFilesApi(img.buffer, img.mimeType, `delivery_${i}`))
  );

  const scenePrompt =
    `- Image 1: ${TURNAROUNDS.strekoryb.name}\n- Image 2: ${TURNAROUNDS.binbon.name}\n- Image 3: ${TURNAROUNDS.emilia.name}\n` +
    "- Scene: A cozy child's bedroom with warm lighting. Characters are gathered around a treasure map.\n" +
    '- Camera: Medium shot from slightly above.\n- Lighting: Warm daylight.\nNo text or letters.';

  const variants: Array<{ key: string; desc: string; buildParts: () => any[] }> = [
    {
      key: 'A',
      desc: 'fileUri (Google Files API)',
      buildParts: () => {
        const parts: any[] = [];
        imgs.forEach((img, i) => {
          parts.push({ text: `Image ${i + 1}: Character sheet for "${img.name}".` });
          parts.push({ fileData: { mimeType: img.mimeType, fileUri: fileUris[i] } });
        });
        parts.push({ text: scenePrompt });
        return parts;
      },
    },
    {
      key: 'B',
      desc: 'inlineData (base64 JPEG as-is)',
      buildParts: () => {
        const parts: any[] = [];
        imgs.forEach((img, i) => {
          parts.push({ text: `Image ${i + 1}: Character sheet for "${img.name}".` });
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        });
        parts.push({ text: scenePrompt });
        return parts;
      },
    },
  ];

  const selected = variant ? variants.filter(v => v.key === variant.toUpperCase()) : variants;
  const results: VariantResult[] = [];

  for (const v of selected) {
    results.push(await runVariant(v.key, v.desc, async () => ({
      parts: v.buildParts(),
      systemInstruction: SHORT_SYSTEM_INSTRUCTION,
    }), iterations, cooldown));
  }

  return results;
}

// ─── Test 6: Cooldown Between Requests ────────────────────────────────────────

async function test6(iterations: number, _cooldown: number, variant?: string): Promise<VariantResult[]> {
  const img = loadImage(TURNAROUNDS.strekoryb.file);
  const fileUri = await uploadToFilesApi(img.buffer, img.mimeType, 'cooldown_test');

  const variants: Array<{ key: string; desc: string; cooldownSec: number }> = [
    { key: 'A', desc: '5-second cooldown', cooldownSec: 5 },
    { key: 'B', desc: '15-second cooldown', cooldownSec: 15 },
    { key: 'C', desc: '30-second cooldown', cooldownSec: 30 },
    { key: 'D', desc: '60-second cooldown', cooldownSec: 60 },
  ];

  const selected = variant ? variants.filter(v => v.key === variant.toUpperCase()) : variants;
  const results: VariantResult[] = [];

  for (const v of selected) {
    results.push(await runVariant(v.key, v.desc, async () => ({
      parts: [
        { text: `Reference image of character "${TURNAROUNDS.strekoryb.name}".` },
        { fileData: { mimeType: img.mimeType, fileUri } },
        { text: "Children's book illustration: Стрекориб sitting on a rock in a sunny forest. Keep character appearance as shown. No text." },
      ],
    }), iterations, v.cooldownSec));
  }

  return results;
}

// ─── Test 7: Image Size / Format ──────────────────────────────────────────────

async function test7(iterations: number, cooldown: number, variant?: string): Promise<VariantResult[]> {
  // Variant A: Current turnaround (JPEG ~440-580KB)
  const fullImg = loadImage(TURNAROUNDS.strekoryb.file);
  const fullUri = await uploadToFilesApi(fullImg.buffer, fullImg.mimeType, 'size_full');

  // Variant B: Original small character drawing (~66KB)
  const smallImg = loadImage(ORIGINALS.strekoryb.file);
  const smallUri = await uploadToFilesApi(smallImg.buffer, smallImg.mimeType, 'size_small');

  const scenePrompt = "Children's book illustration: Стрекориб sitting on a rock in a sunny forest clearing. Keep character appearance as shown. No text.";

  const variants: Array<{ key: string; desc: string; uri: string; mime: string; sizeKB: number }> = [
    { key: 'A', desc: `Turnaround sheet (${Math.round(fullImg.buffer.length / 1024)}KB)`, uri: fullUri, mime: fullImg.mimeType, sizeKB: Math.round(fullImg.buffer.length / 1024) },
    { key: 'B', desc: `Original drawing (${Math.round(smallImg.buffer.length / 1024)}KB)`, uri: smallUri, mime: smallImg.mimeType, sizeKB: Math.round(smallImg.buffer.length / 1024) },
  ];

  const selected = variant ? variants.filter(v => v.key === variant.toUpperCase()) : variants;
  const results: VariantResult[] = [];

  for (const v of selected) {
    results.push(await runVariant(v.key, v.desc, async () => ({
      parts: [
        { text: `Reference image of character "${TURNAROUNDS.strekoryb.name}".` },
        { fileData: { mimeType: v.mime, fileUri: v.uri } },
        { text: scenePrompt },
      ],
    }), iterations, cooldown));
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2);
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const testNum = parseInt(getArg('--test') || '0', 10);
  const variantArg = getArg('--variant');
  const iterations = parseInt(getArg('--iterations') || '5', 10);
  const cooldown = parseInt(getArg('--cooldown') || '15', 10);

  if (testNum < 1 || testNum > 7) {
    console.log('Usage: npx tsx src/scripts/testImageOtherDiagnostic.ts --test N [--variant X] [--iterations N] [--cooldown N]');
    console.log('  Tests: 1=baseline, 2=sysInstruction, 3=promptFormat, 4=refCount, 5=delivery, 6=cooldown, 7=imageSize');
    process.exit(1);
  }

  const testNames: Record<number, string> = {
    1: 'Bare Minimum Baseline',
    2: 'System Instruction Length',
    3: 'Prompt Format (Old vs New)',
    4: 'Number of Reference Images',
    5: 'Delivery Method (fileUri vs inline)',
    6: 'Cooldown Between Requests',
    7: 'Image Size / Format',
  };

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  IMAGE_OTHER Diagnostic — Test ${testNum}: ${testNames[testNum]}`);
  console.log(`║  Model: ${MODEL}`);
  console.log(`║  Iterations: ${iterations}, Cooldown: ${cooldown}s`);
  if (variantArg) console.log(`║  Variant: ${variantArg.toUpperCase()}`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const testFunctions: Record<number, (iter: number, cd: number, v?: string) => Promise<VariantResult[]>> = {
    1: test1,
    2: test2,
    3: test3,
    4: test4,
    5: test5,
    6: test6,
    7: test7,
  };

  const startTime = Date.now();
  const results = await testFunctions[testNum](iterations, cooldown, variantArg);
  const totalDuration = Date.now() - startTime;

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS — Test ${testNum}: ${testNames[testNum]}`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  for (const r of results) {
    const bar = r.attempts.map(a => a.success ? '■' : '□').join('');
    console.log(`║  Variant ${r.variant}: ${r.successRate}  ${bar}  ${r.description}`);
  }
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total duration: ${(totalDuration / 1000).toFixed(0)}s`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // ─── Save results ─────────────────────────────────────────────────────────
  const outputDir = path.join(OUTPUT_BASE, `test${testNum}`);
  ensureDir(outputDir);

  const outputFile = path.join(outputDir, `results_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({
    test: testNum,
    testName: testNames[testNum],
    model: MODEL,
    iterations,
    cooldown,
    variant: variantArg || 'all',
    timestamp: new Date().toISOString(),
    totalDurationMs: totalDuration,
    results: results.map(r => ({
      variant: r.variant,
      description: r.description,
      successRate: r.successRate,
      successCount: r.successCount,
      totalCount: r.totalCount,
      attempts: r.attempts,
    })),
  }, null, 2));

  console.log(`\nResults saved: ${outputFile}`);

  const allPassed = results.every(r => r.successCount === r.totalCount);
  const allFailed = results.every(r => r.successCount === 0);
  if (allFailed) {
    console.log('\n⚠ All variants failed — this suggests an API-level issue, not payload-related.');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
