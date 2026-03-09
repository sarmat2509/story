#!/usr/bin/env npx tsx
/**
 * Concurrency Test for Gemini Image Generation
 * 
 * Sends N identical image generation requests simultaneously to test
 * whether IMAGE_OTHER errors are caused by API concurrency limits.
 * 
 * Uses the exact same prompt and reference images as Scene #8 of
 * story d2cf9860-bed7-4a6e-b1e2-4eb4c458f6ce.
 * 
 * Usage:
 *   npx tsx src/scripts/testConcurrency.ts [concurrency=8]
 */

import * as path from 'path';
import * as fs from 'fs';
import { GoogleGenAI, Modality } from '@google/genai';
import { Pool } from 'pg';

// ─── Configuration ───────────────────────────────────────────────────────────

const CONCURRENCY = parseInt(process.argv[2] || '8', 10);
const MODEL = process.env.NANO_BANANA_MODEL || 'gemini-3-pro-image-preview';
const USER_ID = '23a825d6-d750-4297-bf17-5e2452d112aa';
const UPLOADS_BASE = path.resolve(__dirname, '../../uploads/development');
const OUTPUT_DIR = path.resolve(__dirname, '../../test-output/concurrency-test');

const SYSTEM_INSTRUCTION = `You are a professional children's book illustrator.

ART STYLE: heavy-textured colored pencil drawing, visible wax strokes, cross-hatching technique, layered colors on grainy paper, soft sketchy outlines, handcrafted tactile feel, warm and nostalgic, Maurice Sendak inspired

FORMAT: Single full-bleed illustration filling the frame edge-to-edge. No text, no speech bubbles.

REFERENCES: Keep the exact proportions, silhouette, colors, and distinctive features from the provided character sheets. Re-draw them in the scene's art style (the sheets are for design reference only).

CLOTHING: Scene-appropriate outfit while keeping each character recognizable.

TONE: safe for children, friendly, positive, age-appropriate, friendly atmosphere, no scary or threatening elements.`;

const USER_PROMPT = `- Scene: The cozy secret room, still glowing with bioluminescent moss and twinkling lights. The air is filled with tiny, sparkling particles. The transparent sprite, glowing softly, is playfully darting around the characters. A comfortable, moss-covered bench is visible against one wall. The atmosphere is joyful and whimsical.
- Моховик (Image 1): match the character design from the sheet
- Бінбон (Image 2): match the character design from the sheet
- Емілія (Image 3): match the character design from the sheet
- Composition: Medium shot, showing the close interaction between the characters and the sprite.. Емілія (Image 3): Foreground center, smiling, looking at the sprite with a relieved and happy expression, her fear completely gone. She is relaxed and open.. Моховик (Image 1): To Emilia's left, gently floating, observing the sprite with a kind and understanding smile. The sprite is playfully circling him.. Бінбон (Image 2): To Emilia's right, waving his arms in excitement, his stalk eyes shining with delight as he looks at Emilia and the sprite..
- Lighting: Soft, magical glow from the room's natural elements and the sprite. The light is warm and inviting, with very gentle, dancing shadows. The room feels bright and happy.`;

// Characters in the order they appear in the imageIndexMap: Моховик=1, Бінбон=2, Емілія=3
const CHARACTER_ORDER = ['Моховик', 'Бінбон', 'Емілія'];

// ─── DB Query ─────────────────────────────────────────────────────────────────

interface TurnaroundInfo {
  name: string;
  turnaroundPath: string;
  source: 'character' | 'child';
}

async function getTurnaroundPaths(): Promise<TurnaroundInfo[]> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://kazka:devpass@localhost:5432/kazka_dev',
  });

  try {
    // Query characters (Моховик, Бінбон are imaginary_friend characters)
    const charResult = await pool.query(
      `SELECT name, turnaround_sheet FROM characters WHERE user_id = $1 AND is_active = true AND turnaround_sheet IS NOT NULL`,
      [USER_ID]
    );

    // Query child profiles (Емілія is a child)
    const childResult = await pool.query(
      `SELECT name, turnaround_sheet FROM child_profiles WHERE user_id = $1 AND is_active = true AND turnaround_sheet IS NOT NULL`,
      [USER_ID]
    );

    const results: TurnaroundInfo[] = [];

    for (const row of charResult.rows) {
      const sheet = typeof row.turnaround_sheet === 'string' ? JSON.parse(row.turnaround_sheet) : row.turnaround_sheet;
      if (sheet?.url) {
        results.push({ name: row.name, turnaroundPath: extractStoragePath(sheet.url), source: 'character' });
      }
    }

    for (const row of childResult.rows) {
      const sheet = typeof row.turnaround_sheet === 'string' ? JSON.parse(row.turnaround_sheet) : row.turnaround_sheet;
      if (sheet?.url) {
        results.push({ name: row.name, turnaroundPath: extractStoragePath(sheet.url), source: 'child' });
      }
    }

    return results;
  } finally {
    await pool.end();
  }
}

function extractStoragePath(url: string): string {
  const cleanUrl = url.split('?')[0];
  const marker = '/api/v1/assets/';
  const idx = cleanUrl.indexOf(marker);
  if (idx !== -1) return cleanUrl.substring(idx + marker.length);
  if (cleanUrl.startsWith('development/') || cleanUrl.startsWith('production/')) return cleanUrl;
  return cleanUrl;
}

// ─── Image Loading ────────────────────────────────────────────────────────────

function loadImage(storagePath: string): { base64: string; mimeType: string } {
  const filePath = path.join(UPLOADS_BASE, storagePath.replace(/^development\//, ''));
  if (!fs.existsSync(filePath)) {
    throw new Error(`Image not found: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : 'image/jpeg';

  return { base64: buffer.toString('base64'), mimeType };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GEMINI IMAGE GENERATION CONCURRENCY TEST             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`  Model:        ${MODEL}`);
  console.log(`  Concurrency:  ${CONCURRENCY} simultaneous requests`);
  console.log(`  Prompt:       Scene #8 from d2cf9860...`);
  console.log(`  References:   3 turnaround sheets (Моховик, Бінбон, Емілія)`);
  console.log();

  // 1. Get API key
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GOOGLE_API_KEY not set');
    process.exit(1);
  }
  console.log('✅ API key loaded');

  // 2. Get turnaround paths from DB
  console.log('📦 Loading turnaround paths from database...');
  const allTurnarounds = await getTurnaroundPaths();

  const turnaroundMap = new Map<string, TurnaroundInfo>();
  for (const t of allTurnarounds) {
    turnaroundMap.set(t.name, t);
  }

  // Verify all 3 characters are found
  const missingChars = CHARACTER_ORDER.filter(name => !turnaroundMap.has(name));
  if (missingChars.length > 0) {
    console.error(`❌ Missing turnarounds for: ${missingChars.join(', ')}`);
    console.log('   Available:', allTurnarounds.map(t => `${t.name} (${t.source})`).join(', '));
    process.exit(1);
  }

  // 3. Load reference images
  console.log('🖼️  Loading reference images...');
  const referenceImages: Array<{ name: string; base64: string; mimeType: string }> = [];

  for (const charName of CHARACTER_ORDER) {
    const info = turnaroundMap.get(charName)!;
    const image = loadImage(info.turnaroundPath);
    referenceImages.push({ name: charName, ...image });
    console.log(`   ✓ ${charName}: ${info.turnaroundPath} (${(image.base64.length * 0.75 / 1024).toFixed(0)} KB)`);
  }

  // 4. Initialize Gemini client and upload references to Google Files API
  const client = new GoogleGenAI({ apiKey });

  console.log('📤 Uploading references to Google Files API...');
  const uploadedFiles: Array<{ name: string; uri: string; mimeType: string; charName: string }> = [];
  for (const ref of referenceImages) {
    const blob = new Blob([Buffer.from(ref.base64, 'base64')], { type: ref.mimeType });
    const uploaded = await client.files.upload({
      file: blob,
      config: {
        mimeType: ref.mimeType,
        displayName: `turnaround-${ref.name}`,
      },
    });
    if (!uploaded.uri || !uploaded.name) {
      throw new Error(`Failed to upload ${ref.name} to Files API`);
    }
    uploadedFiles.push({ name: uploaded.name, uri: uploaded.uri, mimeType: uploaded.mimeType || ref.mimeType, charName: ref.name });
    console.log(`   ✓ ${ref.name} → ${uploaded.uri}`);
  }

  // Build content parts using fileData (not inlineData) — same as production
  const parts: any[] = [];
  for (const file of uploadedFiles) {
    parts.push({ text: `Character sheet for "${file.charName}".` });
    parts.push({
      fileData: {
        fileUri: file.uri,
        mimeType: file.mimeType,
      },
    });
  }
  parts.push({ text: USER_PROMPT });

  console.log(`   Total parts: ${parts.length} (${referenceImages.length} images via Files API + ${referenceImages.length} labels + 1 prompt)`);

  // 5. Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const runDir = path.join(OUTPUT_DIR, `run-${timestamp}`);
  fs.mkdirSync(runDir, { recursive: true });
  console.log(`   Output dir: ${runDir}`);

  console.log();

  // 6. Fire all requests simultaneously
  console.log(`🚀 Sending ${CONCURRENCY} requests simultaneously...`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log();

  const startAll = Date.now();

  const promises = Array.from({ length: CONCURRENCY }, (_, i) => {
    const reqStart = Date.now();
    const requestId = i + 1;

    return client.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        imageConfig: {
          aspectRatio: '16:9',
          imageSize: '1K',
        },
      },
    }).then(response => {
      const elapsed = Date.now() - reqStart;
      return { requestId, status: 'fulfilled' as const, response, elapsed };
    }).catch(error => {
      const elapsed = Date.now() - reqStart;
      return { requestId, status: 'rejected' as const, error, elapsed };
    });
  });

  const results = await Promise.all(promises);
  const totalElapsed = Date.now() - startAll;

  // 8. Process and save results
  console.log('─'.repeat(60));
  console.log();

  let successCount = 0;
  let failCount = 0;

  for (const result of results) {
    const { requestId, status, elapsed } = result;
    const prefix = `  Request #${requestId}`;

    if (status === 'fulfilled') {
      const response = result.response;
      const candidate = response.candidates?.[0];

      if (!candidate?.content?.parts) {
        failCount++;
        const reason = candidate?.finishReason || 'no_content';
        console.log(`${prefix}: ❌ NO IMAGE (${reason}) — ${elapsed}ms`);

        // Save error details
        fs.writeFileSync(
          path.join(runDir, `request-${requestId}-error.json`),
          JSON.stringify({
            requestId,
            elapsed,
            finishReason: candidate?.finishReason,
            finishMessage: candidate?.finishMessage,
            safetyRatings: candidate?.safetyRatings,
            promptFeedback: response.promptFeedback,
          }, null, 2)
        );
        continue;
      }

      const imagePart = candidate.content.parts.find((p: any) => p.inlineData);
      if (!imagePart?.inlineData) {
        failCount++;
        console.log(`${prefix}: ❌ NO IMAGE DATA in parts — ${elapsed}ms`);
        continue;
      }

      successCount++;
      const imageBuffer = Buffer.from(imagePart.inlineData.data!, 'base64');
      const ext = imagePart.inlineData.mimeType?.includes('png') ? 'png' : 'png';
      const outputFile = path.join(runDir, `request-${requestId}.${ext}`);
      fs.writeFileSync(outputFile, imageBuffer);

      const textParts = candidate.content.parts.filter((p: any) => p.text);
      const modelText = textParts.map((p: any) => p.text).join('\n').trim();

      console.log(`${prefix}: ✅ SUCCESS — ${elapsed}ms — ${(imageBuffer.length / 1024).toFixed(0)} KB`);
      if (modelText) {
        console.log(`            Model text: ${modelText.substring(0, 100)}...`);
      }
    } else {
      failCount++;
      const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
      console.log(`${prefix}: ❌ ERROR — ${elapsed}ms — ${errorMsg.substring(0, 120)}`);

      fs.writeFileSync(
        path.join(runDir, `request-${requestId}-error.json`),
        JSON.stringify({
          requestId,
          elapsed,
          error: errorMsg,
        }, null, 2)
      );
    }
  }

  // 9. Summary
  console.log();
  console.log('═'.repeat(60));
  console.log();
  console.log('  SUMMARY');
  console.log();
  console.log(`  Total requests:  ${CONCURRENCY}`);
  console.log(`  ✅ Succeeded:    ${successCount}`);
  console.log(`  ❌ Failed:       ${failCount}`);
  console.log(`  Total time:      ${(totalElapsed / 1000).toFixed(1)}s`);
  console.log(`  Avg per request: ${(totalElapsed / CONCURRENCY / 1000).toFixed(1)}s`);
  console.log();

  if (failCount > 0 && successCount > 0) {
    console.log('  🔍 CONCLUSION: Concurrency IS likely the issue.');
    console.log(`     ${failCount}/${CONCURRENCY} requests failed when sent simultaneously.`);
    console.log('     Recommendation: Limit concurrent image generation requests.');
  } else if (failCount === 0) {
    console.log('  🔍 CONCLUSION: Concurrency is NOT the issue.');
    console.log('     All requests succeeded simultaneously.');
    console.log('     The problem may be in specific prompts or reference images.');
  } else {
    console.log('  🔍 CONCLUSION: All requests failed.');
    console.log('     This may indicate a prompt/reference issue rather than concurrency.');
  }

  console.log();
  console.log(`  Output saved to: ${runDir}`);
  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
