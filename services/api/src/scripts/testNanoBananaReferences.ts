/**
 * Test script for Nano Banana Pro reference image consistency
 * 
 * Runs 3 experiments with the same reference images but different prompt complexity
 * to diagnose whether character inconsistency is a prompt engineering issue or model limitation.
 * 
 * Run: npx tsx src/scripts/testNanoBananaReferences.ts
 * Options:
 *   --story-id <uuid>       Load reference data from a specific story (not yet implemented)
 *   --experiments 1,2,3     Run specific experiments (default: all)
 *   --model <model-name>    Override model (e.g. gemini-3-pro-image-preview)
 */

import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─── Configuration ───────────────────────────────────────────────────────────

const USER_ID = '23a825d6-d750-4297-bf17-5e2452d112aa';
const UPLOADS_BASE = path.resolve(__dirname, '../../uploads/development');
const OUTPUT_BASE = path.resolve(__dirname, '../../test-output/reference-test');

// Resolved at runtime after CLI args are parsed
let OUTPUT_DIR = OUTPUT_BASE;
let MODEL_OVERRIDE: string | undefined;

// Reference images (from the story afb87c59-b15d-4db6-82d3-d9a608ecae7f)
const CHARACTERS = [
  { name: 'Стрекориб', file: '1770212034070.jpg' },
  { name: 'Гіглі', file: '1770221424716.jpg' },
  { name: 'Украйіспа', file: '1770408731616.jpg' },
  { name: 'Бінбон', file: '1770507457171.jpg' },
];

// Scene prompt (simple, used in Experiments 1 & 2)
const SIMPLE_SCENE_PROMPT =
  "Children's book illustration, comic art style: all four imaginary friends sitting around a table in a cozy room playing a board game. Keep each character's appearance EXACTLY as shown in their reference drawings. 16:9 aspect ratio.";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadReferenceImage(filename: string): { base64: string; mimeType: string } {
  const filePath = path.join(UPLOADS_BASE, USER_ID, 'photos', 'character', filename);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Reference image not found: ${filePath}`);
  }
  
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : 'image/jpeg';
  
  return {
    base64: buffer.toString('base64'),
    mimeType,
  };
}

function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    logger.info({ dir: OUTPUT_DIR }, 'Created output directory');
  }
}

function saveImage(data: Buffer, name: string): string {
  const filePath = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(filePath, data);
  logger.info({ path: filePath, sizeKB: Math.round(data.length / 1024) }, `Saved: ${name}`);
  return filePath;
}

function saveRequestDump(parts: any[], name: string): string {
  // Strip base64 data from dump, keep text parts and image metadata
  const sanitized = parts.map((p, idx) => {
    if (p.inlineData) {
      return {
        index: idx,
        type: 'image',
        mimeType: p.inlineData.mimeType,
        dataLengthChars: p.inlineData.data.length,
        dataSizeKB: Math.round(Buffer.from(p.inlineData.data, 'base64').length / 1024),
      };
    }
    return {
      index: idx,
      type: 'text',
      textLength: p.text?.length || 0,
      text: p.text,
    };
  });
  
  const filePath = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(filePath, JSON.stringify(sanitized, null, 2));
  logger.info({ path: filePath }, `Saved request dump: ${name}`);
  return filePath;
}

// ─── Gemini API call (shared across experiments) ─────────────────────────────

async function callGeminiImageAPI(parts: any[], label: string): Promise<Buffer> {
  const apiKey = config.google.apiKey;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY / GEMINI_API_KEY is not set in environment');
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const modelName = MODEL_OVERRIDE || config.image.simpleModel || 'gemini-3.1-flash-lite-image';
  
  logger.info({
    label,
    model: modelName,
    partsCount: parts.length,
    partsStructure: parts.map((p, idx) => {
      if (p.inlineData) {
        return { index: idx, type: 'image', mimeType: p.inlineData.mimeType, sizeKB: Math.round(Buffer.from(p.inlineData.data, 'base64').length / 1024) };
      }
      return { index: idx, type: 'text', length: p.text?.length || 0, preview: p.text?.substring(0, 80) };
    }),
  }, `Calling Gemini API: ${label}`);
  
  // Count tokens
  try {
    const tokenCount = await ai.models.countTokens({
      model: modelName,
      contents: [{ role: 'user', parts }],
    });
    logger.info({
      label,
      totalTokens: tokenCount.totalTokens,
      utilization: `${(((tokenCount.totalTokens || 0) / 32768) * 100).toFixed(1)}%`,
    }, 'Token count');
  } catch (err) {
    logger.debug({ err }, 'Token count failed (non-critical)');
  }
  
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts }],
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '16:9' },
    },
  });
  
  if (response.promptFeedback?.blockReason) {
    throw new Error(`Prompt blocked: ${response.promptFeedback.blockReason}`);
  }
  
  if (!response.candidates || response.candidates.length === 0) {
    throw new Error('No candidates in response');
  }
  
  const candidate = response.candidates[0];
  if (!candidate.content?.parts) {
    throw new Error(`No content in candidate. Finish reason: ${candidate.finishReason || 'unknown'}`);
  }
  
  const imagePart = candidate.content.parts.find((p: any) => p.inlineData);
  if (!imagePart?.inlineData) {
    throw new Error('No image data in response');
  }
  
  return Buffer.from(imagePart.inlineData.data!, 'base64');
}

// ─── Experiment 1: Minimal prompt (Gemini UI style) ──────────────────────────

async function runExperiment1(refs: Array<{ name: string; base64: string; mimeType: string }>): Promise<void> {
  logger.info('═══ Experiment 1: Minimal prompt (Gemini UI style) ═══');
  
  const parts: any[] = [];
  
  for (const ref of refs) {
    parts.push({ text: `Image: ${ref.name}` });
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } });
  }
  
  parts.push({ text: SIMPLE_SCENE_PROMPT });
  
  saveRequestDump(parts, 'exp1-request.json');
  
  const imageData = await callGeminiImageAPI(parts, 'Experiment 1: Minimal');
  saveImage(imageData, 'exp1-minimal.png');
  
  logger.info('Experiment 1 completed successfully');
}

// ─── Experiment 2: Interleaved with real instructionText ─────────────────────

function buildInstructionText(charName: string, imageNumber: number): string {
  // Mirrors the production buildReferenceInstructionText for source='imaginary_friend'
  return `- Image ${imageNumber}: Child's drawing of imaginary friend "${charName}".
Reproduce this character EXACTLY as drawn: same shape, colors, proportions, and distinctive features. This drawing defines what "${charName}" looks like.
CRITICAL: Do NOT add, invent, or fill in any body parts or facial features that are NOT present in the original drawing. If the drawing has no eyes on the face — do NOT draw eyes on the face. If the drawing has eyes only on stalks — draw eyes ONLY on stalks. Reproduce ONLY what exists in the drawing, nothing more.`;
}

async function runExperiment2(refs: Array<{ name: string; base64: string; mimeType: string }>): Promise<void> {
  logger.info('═══ Experiment 2: Interleaved with real instructionText ═══');
  
  const parts: any[] = [];
  
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    parts.push({ text: buildInstructionText(ref.name, i + 1) });
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } });
  }
  
  // Simple scene prompt (not the full buildSceneImagePrompt output)
  const scenePrompt = "Children's book illustration, comic art style: the four imaginary friends " +
    "and a girl with brown hair in a yellow dress are playing in a magical forest clearing " +
    "with glowing flowers. 16:9 aspect ratio.";
  
  parts.push({ text: scenePrompt });
  
  saveRequestDump(parts, 'exp2-request.json');
  
  const imageData = await callGeminiImageAPI(parts, 'Experiment 2: Interleaved instructionText');
  saveImage(imageData, 'exp2-interleaved.png');
  
  logger.info('Experiment 2 completed successfully');
}

// ─── Experiment 3: Full production pipeline ──────────────────────────────────

async function runExperiment3(refs: Array<{ name: string; base64: string; mimeType: string }>): Promise<void> {
  logger.info('═══ Experiment 3: Full production pipeline ═══');
  
  // Import the actual production modules
  const { ImageDomainService } = await import('../domain/image/ImageDomainService');
  const { NanoBananaProProvider } = await import('../providers/image/nanobananapro/NanoBananaProProvider');
  
  // Override model in config if --model was provided so the provider uses it
  const originalModel = config.image.simpleModel;
  if (MODEL_OVERRIDE) {
    (config.image as any).simpleModel = MODEL_OVERRIDE;
  }
  
  // Wrap provider to intercept and dump the actual request
  const realProvider = new NanoBananaProProvider();
  const originalGenerateImage = realProvider.generateImage.bind(realProvider);
  
  let capturedRequest: any = null;
  realProvider.generateImage = async (request: any) => {
    capturedRequest = request;
    return originalGenerateImage(request);
  };
  
  const domainService = new ImageDomainService(realProvider);
  
  // Build the exact same request the production code would
  const referenceImages = refs.map((ref, i) => ({
    base64Data: ref.base64,
    mimeType: ref.mimeType,
    instructionText: buildInstructionText(ref.name, i + 1),
  }));
  
  // Character descriptions (mimicking what production would have after Gemini Vision analysis)
  const characterDescriptions = [
    {
      name: 'Стрекориб',
      detailedDescription: 'A whimsical imaginary creature with fish-like body and dragonfly wings, colorful childish drawing style',
    },
    {
      name: 'Гіглі',
      detailedDescription: 'A small round creature with big eyes and a friendly smile, drawn in a child\'s crayon style',
    },
    {
      name: 'Украйіспа',
      detailedDescription: 'A fantasy creature with decorative patterns and bright colors, hand-drawn by a child',
    },
    {
      name: 'Бінбон',
      detailedDescription: 'A tall quirky creature with long limbs and playful expression, childish sketch style',
    },
  ];
  
  // Use the production generateSceneWithReference method
  const result = await domainService.generateSceneWithReference({
    visualPrompt: 'All four imaginary friends are sitting around a wooden table in a cozy room playing a board game. The room has warm lighting, bookshelves, and colorful decorations.',
    sceneId: 99, // Test scene ID
    sceneText: 'Стрекориб, Гіглі, Украйіспа та Бінбон сиділи за круглим столом і грали у настільну гру.',
    ageGroup: '4-5',
    style: 'comic_line',
    characterDescriptions,
    referenceImages,
    sceneGoal: 'The four friends play a board game together',
    sceneBeats: ['They gather around the table', 'They laugh while playing'],
    sceneEmotion: 'happy',
  });
  
  // Dump the captured request (what ImageDomainService passed to the provider)
  if (capturedRequest) {
    const requestDump = {
      promptLength: capturedRequest.prompt.length,
      prompt: capturedRequest.prompt,
      aspectRatio: capturedRequest.aspectRatio,
      referenceCount: capturedRequest.referenceImages?.length || 0,
      references: capturedRequest.referenceImages?.map((r: any, i: number) => ({
        index: i,
        hasBase64: !!r.base64Data,
        base64Length: r.base64Data?.length || 0,
        mimeType: r.mimeType,
        instructionText: r.instructionText,
        instructionLength: r.instructionText?.length || 0,
      })),
    };
    const dumpPath = path.join(OUTPUT_DIR, 'exp3-request.json');
    fs.writeFileSync(dumpPath, JSON.stringify(requestDump, null, 2));
    logger.info({ path: dumpPath }, 'Saved Experiment 3 request dump');
  }
  
  // Domain-level summary
  const domainDump = {
    characterDescriptions,
    referenceCount: referenceImages.length,
    referenceInstructionLengths: referenceImages.map((r, i) => ({
      index: i,
      instructionLength: r.instructionText.length,
      instructionPreview: r.instructionText.substring(0, 100),
    })),
  };
  
  const domainDumpPath = path.join(OUTPUT_DIR, 'exp3-domain-dump.json');
  fs.writeFileSync(domainDumpPath, JSON.stringify(domainDump, null, 2));
  
  saveImage(result.imageData, 'exp3-production.png');
  
  // Restore original model in config
  if (originalModel !== undefined) {
    (config.image as any).simpleModel = originalModel;
  }
  
  logger.info('Experiment 3 completed successfully');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Nano Banana Pro — Reference Image Consistency Test     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const expArg = args.find((_, i) => args[i - 1] === '--experiments');
  const experimentsToRun = expArg
    ? expArg.split(',').map(Number)
    : [1, 2, 3];
  
  const modelArg = args.find((_, i) => args[i - 1] === '--model');
  if (modelArg) {
    MODEL_OVERRIDE = modelArg;
  }
  
  const activeModel = MODEL_OVERRIDE || config.image.simpleModel || 'gemini-3.1-flash-lite-image';
  
  // Create model-specific output directory so different runs don't overwrite
  const modelSlug = activeModel.replace(/[^a-zA-Z0-9.-]/g, '_');
  OUTPUT_DIR = path.join(OUTPUT_BASE, modelSlug);
  
  console.log(`  Model: ${activeModel}`);
  console.log('');
  
  logger.info({ experiments: experimentsToRun, model: activeModel }, 'Starting reference image tests');
  
  // Verify API key
  const apiKey = config.google.apiKey;
  if (!apiKey) {
    console.error('ERROR: GOOGLE_API_KEY or GEMINI_API_KEY must be set in environment');
    process.exit(1);
  }
  logger.info('API key found');
  
  // Load reference images
  logger.info('Loading reference images...');
  const refs = CHARACTERS.map(char => {
    const img = loadReferenceImage(char.file);
    logger.info({
      name: char.name,
      file: char.file,
      sizeKB: Math.round(Buffer.from(img.base64, 'base64').length / 1024),
      mimeType: img.mimeType,
    }, `Loaded: ${char.name}`);
    return { name: char.name, ...img };
  });
  
  ensureOutputDir();
  
  const results: Array<{ experiment: number; status: 'success' | 'error'; error?: string; durationMs?: number }> = [];
  
  // Run experiments
  for (const expNum of experimentsToRun) {
    const startTime = Date.now();
    try {
      switch (expNum) {
        case 1:
          await runExperiment1(refs);
          break;
        case 2:
          await runExperiment2(refs);
          break;
        case 3:
          await runExperiment3(refs);
          break;
        default:
          logger.warn({ experiment: expNum }, 'Unknown experiment number, skipping');
          continue;
      }
      const durationMs = Date.now() - startTime;
      results.push({ experiment: expNum, status: 'success', durationMs });
      logger.info({ experiment: expNum, durationMs }, `Experiment ${expNum} completed`);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      results.push({ experiment: expNum, status: 'error', error: err.message, durationMs });
      logger.error({ experiment: expNum, error: err.message, stack: err.stack, durationMs }, `Experiment ${expNum} FAILED`);
    }
    
    // Brief pause between experiments to avoid rate limiting
    if (expNum !== experimentsToRun[experimentsToRun.length - 1]) {
      logger.info('Waiting 3 seconds before next experiment...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // Summary
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Results Summary                                        ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Model: ${activeModel}`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  for (const r of results) {
    const statusIcon = r.status === 'success' ? '✅' : '❌';
    const duration = r.durationMs ? ` (${(r.durationMs / 1000).toFixed(1)}s)` : '';
    const errorMsg = r.error ? ` — ${r.error.substring(0, 60)}` : '';
    console.log(`║  ${statusIcon} Experiment ${r.experiment}${duration}${errorMsg}`);
  }
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Output: ${OUTPUT_DIR}`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  How to interpret:                                      ║');
  console.log('║  Exp1 good, Exp3 bad → prompt engineering problem       ║');
  console.log('║  Exp1 bad too → model limitation with these refs        ║');
  console.log('║  Exp2 good, Exp3 bad → buildSceneImagePrompt too noisy  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  
  // Save summary
  const summaryPath = path.join(OUTPUT_DIR, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    model: activeModel,
    characters: CHARACTERS.map(c => c.name),
    results,
  }, null, 2));
  
  process.exit(results.every(r => r.status === 'success') ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
