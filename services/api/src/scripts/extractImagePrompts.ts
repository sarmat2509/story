#!/usr/bin/env npx tsx
/**
 * Image Prompt Extractor
 * 
 * Parses app.log and extracts system + user prompts for each image
 * generation / regeneration request for a given story ID.
 *
 * Usage:
 *   npx tsx src/scripts/extractImagePrompts.ts <storyId> [sceneId]
 *
 * Examples:
 *   npx tsx src/scripts/extractImagePrompts.ts e5fb277e-64cd-4cf7-b34c-f4bdb2611bdc
 *   npx tsx src/scripts/extractImagePrompts.ts e5fb277e-64cd-4cf7-b34c-f4bdb2611bdc 5
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface LogEntry {
  level: number;
  time: number;
  msg: string;
  storyId?: string;
  sceneId?: number;
  fullPrompt?: string;
  systemInstruction?: string;
  style?: string;
  ageGroup?: string;
  promptLength?: number;
  imageIndexMap?: Record<string, number>;
  referenceLabels?: string[];
  referenceCount?: number;
  realWorldCount?: number;
  imaginaryCount?: number;
  editInstructionsPreview?: string;
  hasSystemInstruction?: boolean;
  [key: string]: any;
}

interface PromptEntry {
  time: number;
  sceneId: number;
  style: string;
  ageGroup: string;
  systemInstruction: string;
  userPrompt: string;
  promptLength: number;
  imageIndexMap?: Record<string, number>;
  referenceLabels?: string[];
  context: string;
}

const LOG_DIR = path.resolve(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

async function main() {
  const storyId = process.argv[2];
  const filterSceneId = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;

  if (!storyId) {
    console.error('Usage: npx tsx src/scripts/extractImagePrompts.ts <storyId> [sceneId]');
    process.exit(1);
  }

  if (!fs.existsSync(LOG_FILE)) {
    console.error(`Log file not found: ${LOG_FILE}`);
    process.exit(1);
  }

  console.log(`\n🔍 Extracting image prompts for story: ${storyId}`);
  if (filterSceneId !== undefined) {
    console.log(`   Filtering to scene #${filterSceneId}`);
  }
  console.log(`   Log file: ${LOG_FILE}\n`);

  // Pass 1: Find time range for the story
  const { startTime, endTime } = await findStoryTimeRange(storyId);
  if (!startTime) {
    console.error(`Story ${storyId} not found in logs.`);
    process.exit(1);
  }

  console.log(`   Time range: ${new Date(startTime).toISOString()} → ${new Date(endTime).toISOString()}`);
  console.log(`   Duration: ${((endTime - startTime) / 1000).toFixed(1)}s\n`);

  // Pass 2: Collect prompt entries and context within time range
  const prompts = await collectPrompts(startTime, endTime, filterSceneId);

  if (prompts.length === 0) {
    console.log('No image prompts found for this story/scene.');
    return;
  }

  // Print results
  console.log(`${'═'.repeat(80)}`);
  console.log(`  IMAGE PROMPTS — ${prompts.length} request(s) found`);
  console.log(`${'═'.repeat(80)}\n`);

  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    const ts = new Date(p.time).toISOString().replace('T', ' ').replace('Z', '');

    console.log(`${'─'.repeat(80)}`);
    console.log(`  [${i + 1}/${prompts.length}] Scene #${p.sceneId} | ${ts}`);
    console.log(`  Context: ${p.context}`);
    console.log(`  Style: ${p.style} | Age: ${p.ageGroup} | Prompt length: ${p.promptLength}`);

    if (p.imageIndexMap && Object.keys(p.imageIndexMap).length > 0) {
      console.log(`  Image index map: ${JSON.stringify(p.imageIndexMap)}`);
    }
    if (p.referenceLabels && p.referenceLabels.length > 0) {
      console.log(`  Reference labels:`);
      for (const label of p.referenceLabels) {
        console.log(`    • ${label}`);
      }
    }

    console.log(`${'─'.repeat(80)}`);
    console.log(`\n📋 SYSTEM INSTRUCTION:\n`);
    console.log(p.systemInstruction || '(none)');
    console.log(`\n📝 USER PROMPT:\n`);
    console.log(p.userPrompt || '(none)');
    console.log('');
  }
}

async function findStoryTimeRange(storyId: string): Promise<{ startTime: number; endTime: number }> {
  const rl = readline.createInterface({
    input: fs.createReadStream(LOG_FILE),
    crlfDelay: Infinity,
  });

  let startTime = 0;
  let endTime = 0;

  for await (const line of rl) {
    if (!line.includes(storyId)) continue;
    try {
      const entry: LogEntry = JSON.parse(line);
      if (entry.storyId !== storyId) continue;
      if (!startTime || entry.time < startTime) startTime = entry.time;
      if (entry.time > endTime) endTime = entry.time;
    } catch {
      // skip malformed lines
    }
  }

  // Add buffer to capture prompt logs that don't carry storyId
  if (startTime) {
    startTime -= 1000;
    endTime += 5000;
  }

  return { startTime, endTime };
}

async function collectPrompts(
  startTime: number,
  endTime: number,
  filterSceneId?: number
): Promise<PromptEntry[]> {
  const rl = readline.createInterface({
    input: fs.createReadStream(LOG_FILE),
    crlfDelay: Infinity,
  });

  const prompts: PromptEntry[] = [];

  // Track context: "Generating scene with reference approach" entries by sceneId+time
  const contextLog: Array<{ time: number; sceneId: number; msg: string; refs: number; real: number; imaginary: number }> = [];

  for await (const line of rl) {
    let entry: LogEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.time < startTime || entry.time > endTime) continue;

    // Track context messages
    if (entry.msg === 'Generating scene with reference approach' || 
        entry.msg === 'Generating scene illustration') {
      contextLog.push({
        time: entry.time,
        sceneId: entry.sceneId ?? -1,
        msg: entry.msg,
        refs: entry.referenceCount ?? 0,
        real: entry.realWorldCount ?? 0,
        imaginary: entry.imaginaryCount ?? 0,
      });
    }

    // Capture prompt entries
    if (entry.msg === 'Built scene prompt with Asset Graph pattern' && entry.fullPrompt) {
      const sceneId = entry.sceneId ?? -1;
      if (filterSceneId !== undefined && sceneId !== filterSceneId) continue;

      // Find nearest context entry for this scene (same sceneId, closest time before)
      const ctx = contextLog
        .filter(c => c.sceneId === sceneId && c.time <= entry.time)
        .pop();

      const contextStr = ctx
        ? `${ctx.msg} (refs: ${ctx.refs}, real: ${ctx.real}, imaginary: ${ctx.imaginary})`
        : 'initial generation';

      prompts.push({
        time: entry.time,
        sceneId,
        style: entry.style || 'unknown',
        ageGroup: entry.ageGroup || 'unknown',
        systemInstruction: entry.systemInstruction || '',
        userPrompt: entry.fullPrompt || '',
        promptLength: entry.promptLength || 0,
        imageIndexMap: entry.imageIndexMap,
        referenceLabels: entry.referenceLabels,
        context: contextStr,
      });
    }

    // Also capture edit prompts
    if (entry.msg === 'Editing scene image based on validation feedback') {
      const sceneId = entry.sceneId ?? -1;
      if (filterSceneId !== undefined && sceneId !== filterSceneId) continue;

      prompts.push({
        time: entry.time,
        sceneId,
        style: entry.style || 'unknown',
        ageGroup: entry.ageGroup || 'unknown',
        systemInstruction: entry.systemInstruction || '',
        userPrompt: entry.editInstructionsPreview || '(edit instructions — see editInstructionsPreview)',
        promptLength: entry.editInstructionsPreview?.length || 0,
        context: `Image edit (refs: ${entry.referenceCount ?? 0})`,
      });
    }
  }

  return prompts;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
