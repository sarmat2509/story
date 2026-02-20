#!/usr/bin/env npx tsx
/**
 * Image Generation Analyzer
 * 
 * Parses app.log and prints a detailed report for a given story ID:
 * - Scene selection (which scenes, how many images)
 * - Per-scene breakdown: attempts, validation results, timing
 * - Reference images used
 * - Scene visual descriptions (setting, camera, lighting)
 * - Edit vs regeneration decisions
 * - Overall timing summary
 * 
 * Usage:
 *   npx tsx src/scripts/analyzeImageGeneration.ts <storyId>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogEntry {
  level: number;
  time: number;
  storyId?: string;
  sceneId?: number;
  attempt?: number;
  maxAttempts?: number;
  msg: string;
  [key: string]: unknown;
}

interface SceneAttempt {
  attempt: number;
  timestamp: number;
  result: 'passed' | 'failed' | 'error';
  action?: 'edit' | 'regenerate' | 'none';
  actionReason?: string;
  characterCount?: number;
  expected?: number;
  hasUnexpectedCharacters?: boolean;
  hasTextOrLetters?: boolean;
  hasAnatomyErrors?: boolean;
  duplicatedCharacters?: string[];
  missingCharacters?: string[];
  anatomyIssues?: Array<{ name: string; issue: string }>;
  feedback?: string;
  editSucceeded?: boolean;
  score?: number;
}

interface SceneReport {
  sceneId: number;
  characters: string[];
  referenceCount: number;
  newCharacters: string[];
  startTime: number;
  endTime: number;
  duration: number;
  imageSizeBytes?: number;
  attempts: SceneAttempt[];
  finalOutcome: 'passed' | 'max_retries' | 'validation_error' | 'generation_failed';
  maxRetriesFeedback?: string;
  generationError?: string;
  sceneVisual?: {
    setting?: string;
    cameraComposition?: string | { shot: string; characters: Array<{ name: string; description: string }> };
    lighting?: string;
  };
  environment?: {
    id: string;
    name: string;
    resolved: boolean;
  };
  bestPick?: {
    selectedAttempt: number;
    selectedScore: number;
    selectedBestInsteadOfLast: boolean;
    allScores: Array<{ attempt: number; score: number }>;
  };
}

interface TurnaroundEvent {
  characterName: string;
  characterId?: string;
  sceneId?: number;
  timestamp: number;
  outcome: 'started' | 'complete' | 'failed';
  error?: string;
}

interface StoryReport {
  storyId: string;
  totalScenes: number;
  imagesPerStory: number;
  selectedIndices: number[];
  scenes: SceneReport[];
  turnarounds: TurnaroundEvent[];
  totalDuration: number;
  totalDurationFormatted: string;
  textPhaseDuration?: number;
  imagePhaseDuration?: number;
  totalValidations: number;
  totalRegenerations: number;
  totalEdits: number;
  successfulEdits: number;
  passedFirstAttempt: number;
  averageScore?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LEVEL_NAMES: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function wrapText(text: string, indent: number, maxWidth: number = 100): string {
  const prefix = ' '.repeat(indent);
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.map((line, i) => i === 0 ? line : `${prefix}${line}`).join('\n');
}

// ─── Colors (ANSI) ──────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

// ─── Log Parsing ─────────────────────────────────────────────────────────────

interface ParseResult {
  storyEntries: LogEntry[];
  sceneVisualEntries: LogEntry[]; // composedSceneVisual logs (may lack storyId in older logs)
  refApproachEntries: LogEntry[]; // "Generating scene with reference approach" (no storyId, has sceneId + referenceCount)
  turnaroundEntries: LogEntry[]; // turnaround generation (no storyId, match by time window)
}

const TURNAROUND_MSGS = [
  'Generating turnaround (first appearance in scene)',
  'Turnaround complete',
  'Failed to generate turnaround',
  'Starting text-only turnaround sheet generation for LLM character',
  'LLM character turnaround sheet generated and stored',
  'Generating turnaround sheet on demand',
  'Generating turnaround sheet for imaginary character',
  'Turnaround sheet generated and stored successfully',
  'Child turnaround sheet generated and stored successfully',
];

async function parseLogForStory(logPath: string, storyId: string): Promise<ParseResult> {
  const storyEntries: LogEntry[] = [];
  const sceneVisualEntries: LogEntry[] = [];
  const refApproachEntries: LogEntry[] = [];
  const turnaroundEntries: LogEntry[] = [];

  const fileStream = fs.createReadStream(logPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    // Fast pre-filter
    const hasTurnaround = TURNAROUND_MSGS.some(m => line.includes(m));
    if (!line.includes(storyId) && !line.includes('composedSceneVisual') && !line.includes('Generating scene with reference approach') && !hasTurnaround) continue;
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (entry.storyId === storyId) {
        storyEntries.push(entry);
      }
      // Collect composedSceneVisual entries (may have storyId or not, for old logs)
      if (entry.msg === 'Full composed sceneVisual' && (entry as any).composedSceneVisual) {
        sceneVisualEntries.push(entry);
      }
      // ImageDomainService logs referenceCount but not storyId; match by sceneId + time later
      if (entry.msg === 'Generating scene with reference approach' && entry.sceneId != null) {
        refApproachEntries.push(entry);
      }
      // Turnaround logs lack storyId; match by time window to story's image phase
      if (TURNAROUND_MSGS.includes(entry.msg)) {
        turnaroundEntries.push(entry);
      }
    } catch {
      // Skip malformed lines
    }
  }

  storyEntries.sort((a, b) => a.time - b.time);
  sceneVisualEntries.sort((a, b) => a.time - b.time);
  refApproachEntries.sort((a, b) => a.time - b.time);
  turnaroundEntries.sort((a, b) => a.time - b.time);
  return { storyEntries, sceneVisualEntries, refApproachEntries, turnaroundEntries };
}

// ─── Report Building ─────────────────────────────────────────────────────────

function buildReport(storyId: string, entries: LogEntry[], sceneVisualEntries: LogEntry[], refApproachEntries: LogEntry[], turnaroundEntries: LogEntry[]): StoryReport {
  const report: StoryReport = {
    storyId,
    totalScenes: 0,
    imagesPerStory: 0,
    selectedIndices: [],
    scenes: [],
    turnarounds: [],
    totalDuration: 0,
    totalDurationFormatted: '',
    totalValidations: 0,
    totalRegenerations: 0,
    totalEdits: 0,
    successfulEdits: 0,
    passedFirstAttempt: 0,
  };

  // Extract scene selection info
  const selectionEntry = entries.find(e => e.msg === 'Selected scenes for image generation (evenly distributed)');
  if (selectionEntry) {
    report.totalScenes = (selectionEntry.totalScenes as number) || 0;
    report.imagesPerStory = (selectionEntry.imagesPerStory as number) || 0;
    report.selectedIndices = (selectionEntry.selectedIndices as number[]) || [];
  }

  // Extract text phase duration
  const textPhaseEntry = entries.find(e => e.msg === 'Text+validation phase completed, handing off to image queue');
  if (textPhaseEntry) {
    report.textPhaseDuration = textPhaseEntry.duration as number;
  }

  // Extract total image duration
  const imageDoneEntry = entries.find(e => e.msg === 'Image generation completed');
  if (imageDoneEntry) {
    report.imagePhaseDuration = imageDoneEntry.duration as number;
  }

  // Group entries by sceneId
  const sceneMap = new Map<number, LogEntry[]>();
  for (const entry of entries) {
    if (entry.sceneId != null) {
      const list = sceneMap.get(entry.sceneId) || [];
      list.push(entry);
      sceneMap.set(entry.sceneId, list);
    }
  }

  // Build per-scene reports
  for (const [sceneId, sceneEntries] of sceneMap) {
    const sceneReport: SceneReport = {
      sceneId,
      characters: [],
      referenceCount: 0,
      newCharacters: [],
      startTime: 0,
      endTime: 0,
      duration: 0,
      attempts: [],
      finalOutcome: 'passed',
    };

    // Scene generation start (parallel pipeline, sequential pipeline, or legacy)
    const genStart = sceneEntries.find(e =>
      e.msg === 'Generating scene image with references' ||
      e.msg === 'Generating scene image (parallel pipeline, turnaround-only refs)' ||
      e.msg === 'Generating scene image (sequential)'
    );
    if (genStart) {
      sceneReport.characters = (genStart.normalizedCharacters as string[]) || [];
      sceneReport.referenceCount = (genStart.totalReferenceCount as number) || 0;
      sceneReport.newCharacters = (genStart.newCharacters as string[]) || [];
      sceneReport.startTime = genStart.time;
    }

    // Scene generation end
    const genEnd = sceneEntries.find(e => e.msg === 'Scene image generated with reference approach');
    if (genEnd) {
      sceneReport.endTime = genEnd.time;
      sceneReport.duration = (genEnd.duration as number) || 0;
      sceneReport.imageSizeBytes = genEnd.imageSizeBytes as number;
      // Sequential pipeline: referenceCount comes from genEnd (genStart lacks it)
      if (sceneReport.referenceCount === 0 && (genEnd.referenceCount as number) != null) {
        sceneReport.referenceCount = genEnd.referenceCount as number;
      }
    }

    // Reference count fallback: "Generating scene with reference approach" (ImageDomainService)
    // Used when genStart/genEnd don't have it (e.g. sequential pipeline, failed generations)
    // ImageDomainService logs lack storyId, so we match by sceneId + closest time to scene start
    if (sceneReport.referenceCount === 0) {
      const sceneAnchorTime = sceneReport.startTime || sceneEntries[0]?.time;
      if (sceneAnchorTime != null) {
        const candidates = refApproachEntries
          .filter(e => e.sceneId === sceneId && (e.referenceCount as number) != null)
          .map(e => ({ entry: e, delta: Math.abs(e.time - sceneAnchorTime) }))
          .sort((a, b) => a.delta - b.delta);
        if (candidates.length > 0 && candidates[0].delta < 60000) {
          sceneReport.referenceCount = candidates[0].entry.referenceCount as number;
        }
      }
    }

    // Validation attempts
    const validationPassed = sceneEntries.filter(e => e.msg === 'Image validation passed');
    const validationFailed = sceneEntries.filter(e => e.msg === 'Image validation failed');
    const validationMaxRetry = sceneEntries.find(e => e.msg === 'Image validation still failing after max retries, using last generated image');
    const validationError = sceneEntries.filter(e => e.msg?.includes('Image validation error'));

    // Collect action entries for this scene
    const editAttempts = sceneEntries.filter(e =>
      e.msg === 'Issues are editable, attempting image edit' ||
      e.msg === 'Attempting image edit'
    );
    const editSuccesses = sceneEntries.filter(e =>
      e.msg === 'Image edit succeeded, re-validating' ||
      e.msg === 'Image edit succeeded'
    );
    const editFailures = sceneEntries.filter(e =>
      e.msg?.includes('Image edit failed')
    );
    const fullRegens = sceneEntries.filter(e =>
      e.msg === 'Issues require full regeneration (missing or unrecognizable character)'
    );

    // Build attempt timeline
    const attemptEntries = [...validationPassed, ...validationFailed, ...validationError]
      .sort((a, b) => a.time - b.time);

    for (const entry of attemptEntries) {
      const attempt: SceneAttempt = {
        attempt: (entry.attempt as number) || 0,
        timestamp: entry.time,
        result: entry.msg === 'Image validation passed' ? 'passed' : 
                entry.msg?.includes('error') ? 'error' : 'failed',
        characterCount: entry.characterCount as number,
        expected: entry.expected as number,
        hasUnexpectedCharacters: entry.hasUnexpectedCharacters as boolean,
        hasTextOrLetters: entry.hasTextOrLetters as boolean,
        hasRenderingArtifacts: entry.hasRenderingArtifacts as boolean,
        hasAnatomyErrors: entry.hasAnatomyErrors as boolean,
        duplicatedCharacters: entry.duplicatedCharacters as string[],
        missingCharacters: entry.missingCharacters as string[],
        anatomyIssues: entry.anatomyIssues as Array<{ name: string; issue: string }>,
        feedback: (entry.feedback || entry.overallFeedback) as string,
      };

      // Find corresponding action for this attempt
      if (attempt.result === 'failed') {
        const attemptNum = attempt.attempt;
        const editForAttempt = editAttempts.find(e => (e.attempt as number) === attemptNum);
        const regenForAttempt = fullRegens.find(e => (e.attempt as number) === attemptNum);

        if (editForAttempt) {
          attempt.action = 'edit';
          attempt.actionReason = 'Issues are editable (cosmetic fixes)';
          const editSuccess = editSuccesses.find(e => (e.attempt as number) === attemptNum);
          const editFail = editFailures.find(e => (e.attempt as number) === attemptNum);
          attempt.editSucceeded = !!editSuccess;
          if (editFail) {
            attempt.actionReason += ' → edit failed, fell back to full regeneration';
          }
        } else if (regenForAttempt) {
          attempt.action = 'regenerate';
          const missing = (regenForAttempt.missingCharacters as string[]) || [];
          const unrec = (regenForAttempt.unrecognizable as string[]) || [];
          const reasons: string[] = [];
          if (missing.length > 0) reasons.push(`missing: ${missing.join(', ')}`);
          if (unrec.length > 0) reasons.push(`unrecognizable: ${unrec.join(', ')}`);
          attempt.actionReason = reasons.length > 0 ? reasons.join('; ') : 'character issues';
        }
      }

      sceneReport.attempts.push(attempt);
    }

    // Attach validation scores to attempts
    const scoreEntries = sceneEntries.filter(e =>
      e.msg?.startsWith('Validation score for attempt') && e.score != null
    );
    const passedScoreEntries = sceneEntries.filter(e =>
      e.msg === 'Image validation passed' && e.score != null
    );
    for (const att of sceneReport.attempts) {
      if (att.result === 'passed') {
        const passedEntry = passedScoreEntries.find(e => (e.attempt as number) === att.attempt);
        if (passedEntry) att.score = passedEntry.score as number;
      } else {
        const scoreEntry = scoreEntries.find(e => (e.attempt as number) === att.attempt);
        if (scoreEntry) att.score = scoreEntry.score as number;
      }
    }

    // Parse best-pick selection
    const bestPickEntry = sceneEntries.find(e =>
      e.msg?.startsWith('All ') && e.msg?.includes('attempts failed validation')
    );
    if (bestPickEntry) {
      const allScoresRaw = (bestPickEntry.allScores as Array<{ attempt: number; score: number }>) || [];
      sceneReport.bestPick = {
        selectedAttempt: (bestPickEntry.selectedAttempt as number) || 0,
        selectedScore: (bestPickEntry.selectedScore as number) || 0,
        selectedBestInsteadOfLast: (bestPickEntry.selectedBestInsteadOfLast as boolean) || false,
        allScores: allScoresRaw.map(s => ({ attempt: s.attempt, score: s.score })),
      };
    }

    // Detect generation-level failures (IMAGE_OTHER, etc.)
    const generationFailures = sceneEntries.filter(e =>
      e.msg === 'Failed to generate scene image' && e.level >= 50
    );

    // Fallback: detect IMAGE_OTHER retries (logged with storyId, even if final error wasn't)
    const imageOtherRetries = sceneEntries.filter(e =>
      e.msg === 'Generation failed (IMAGE_OTHER), retrying after delay'
    );

    // Determine final outcome
    if (validationMaxRetry) {
      sceneReport.finalOutcome = 'max_retries';
      sceneReport.maxRetriesFeedback = (validationMaxRetry.feedback || validationMaxRetry.overallFeedback) as string;
    } else if (validationError.length > 0 && validationPassed.length === 0) {
      sceneReport.finalOutcome = 'validation_error';
    } else if (generationFailures.length > 0 && validationPassed.length === 0 && !genEnd) {
      // Generation failed and no image was produced (no "Scene image generated" log)
      sceneReport.finalOutcome = 'generation_failed';
      const lastFailure = generationFailures[generationFailures.length - 1];
      const stackMsg = (lastFailure.stack as string) || '';
      const finishReasonMatch = stackMsg.match(/Finish reason: (\w+)/);
      sceneReport.generationError = finishReasonMatch
        ? `IMAGE_OTHER (${finishReasonMatch[1]}) — model refused to generate image`
        : 'Generation threw an error — no image produced';
    } else if (imageOtherRetries.length > 0 && validationPassed.length === 0 && !genEnd) {
      // IMAGE_OTHER retries present but no successful generation — generation failed silently
      sceneReport.finalOutcome = 'generation_failed';
      sceneReport.generationError = `IMAGE_OTHER — ${imageOtherRetries.length} retries exhausted, no image produced`;
    } else {
      sceneReport.finalOutcome = 'passed';
    }

    // Extract scene visual from 'Full composed sceneVisual' log
    // First try: entry has storyId (new logs)
    let sceneVisualEntry = sceneEntries.find(e =>
      e.msg === 'Full composed sceneVisual' && (e as any).composedSceneVisual
    );
    // Fallback: for old logs without storyId, match by sceneId + time window
    if (!sceneVisualEntry && sceneReport.startTime) {
      sceneVisualEntry = sceneVisualEntries.find(e =>
        e.sceneId === sceneId &&
        !e.storyId && // old entry without storyId
        Math.abs(e.time - sceneReport.startTime) < 5000 // within 5 seconds
      );
    }
    if (sceneVisualEntry) {
      const sv = (sceneVisualEntry as any).composedSceneVisual;
      if (sv) {
        sceneReport.sceneVisual = {
          setting: sv.setting,
          cameraComposition: sv.cameraComposition,
          lighting: sv.lighting,
        };
        // Sequential pipeline: extract character names from cameraComposition when genStart didn't provide them
        if (sceneReport.characters.length === 0 && sv.cameraComposition?.characters) {
          sceneReport.characters = sv.cameraComposition.characters.map((ch: { name: string }) => ch.name);
        }
      }
    }

    // Fallback: extract environment info from 'Composed sceneVisual — environment resolved'
    if (!sceneReport.sceneVisual) {
      const envEntry = sceneEntries.find(e =>
        e.msg === 'Composed sceneVisual — environment resolved'
      );
      if (envEntry) {
        sceneReport.environment = {
          id: (envEntry.environmentId as string) || '',
          name: (envEntry.environmentName as string) || '',
          resolved: (envEntry.environmentResolved as boolean) || false,
        };
      }
    }

    report.scenes.push(sceneReport);
  }

  // Sort scenes by startTime
  report.scenes.sort((a, b) => a.startTime - b.startTime);

  // Compute totals
  report.totalDuration = report.scenes.reduce((sum, s) => sum + s.duration, 0);
  report.totalDurationFormatted = formatDuration(report.totalDuration);
  report.totalValidations = report.scenes.reduce((sum, s) => sum + s.attempts.length, 0);
  report.totalRegenerations = report.scenes.reduce((sum, s) =>
    sum + s.attempts.filter(a => a.result === 'failed').length, 0);
  report.totalEdits = report.scenes.reduce((sum, s) =>
    sum + s.attempts.filter(a => a.action === 'edit').length, 0);
  report.successfulEdits = report.scenes.reduce((sum, s) =>
    sum + s.attempts.filter(a => a.action === 'edit' && a.editSucceeded).length, 0);
  report.passedFirstAttempt = report.scenes.filter(s =>
    s.attempts.length > 0 && s.attempts[0].result === 'passed').length;

  // Compute average validation score across all scored attempts
  const allScores = report.scenes.flatMap(s => s.attempts.filter(a => a.score != null).map(a => a.score!));
  if (allScores.length > 0) {
    report.averageScore = Math.round((allScores.reduce((sum, s) => sum + s, 0) / allScores.length) * 10) / 10;
  }

  // Extract turnarounds: match by time window (image phase)
  const imageBatchStart = entries.find(e => e.msg === 'Processing image batch')?.time;
  const imageBatchEnd = entries.find(e => e.msg === 'Image generation completed')?.time;
  const lastSceneTime = report.scenes.length > 0
    ? Math.max(...report.scenes.map(s => s.endTime || s.startTime || 0), 0)
    : 0;
  const imagePhaseEnd = imageBatchEnd ?? (lastSceneTime > 0 ? lastSceneTime + 120000 : undefined);
  if (imageBatchStart != null) {
    const windowStart = imageBatchStart - 5000; // 5s before
    const windowEnd = (imagePhaseEnd ?? imageBatchStart) + 300000; // +5 min after
    const inWindow = turnaroundEntries.filter(e => e.time >= windowStart && e.time <= windowEnd);
    const byChar = new Map<string, TurnaroundEvent>();
    for (const e of inWindow) {
      const name = (e.name as string) || (e.characterName as string) || 'unknown';
      const isStart = e.msg === 'Generating turnaround (first appearance in scene)' ||
        e.msg === 'Generating turnaround sheet on demand' ||
        e.msg === 'Generating turnaround sheet for imaginary character' ||
        e.msg === 'Starting text-only turnaround sheet generation for LLM character';
      const isComplete = e.msg === 'Turnaround complete' ||
        e.msg === 'LLM character turnaround sheet generated and stored' ||
        e.msg === 'Turnaround sheet generated and stored successfully' ||
        e.msg === 'Child turnaround sheet generated and stored successfully';
      const isFailed = e.msg === 'Failed to generate turnaround';

      if (isStart) {
        byChar.set(name, { characterName: name, characterId: e.characterId as string, sceneId: e.sceneId as number, timestamp: e.time, outcome: 'started' });
      } else if (isComplete) {
        const existing = byChar.get(name);
        if (existing) existing.outcome = 'complete';
        else byChar.set(name, { characterName: name, characterId: e.characterId as string, timestamp: e.time, outcome: 'complete' });
      } else if (isFailed) {
        const existing = byChar.get(name);
        const errMsg = (e as any).err?.message || (e as any).error;
        if (existing) { existing.outcome = 'failed'; existing.error = errMsg; }
        else byChar.set(name, { characterName: name, characterId: e.characterId as string, timestamp: e.time, outcome: 'failed', error: errMsg });
      }
    }
    report.turnarounds = Array.from(byChar.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  return report;
}

// ─── Pretty Printing ─────────────────────────────────────────────────────────

function printReport(report: StoryReport): void {
  const hr = '═'.repeat(80);
  const thinHr = '─'.repeat(80);

  console.log(`\n${c.bold}${c.cyan}${hr}${c.reset}`);
  console.log(`${c.bold}${c.cyan}  IMAGE GENERATION REPORT${c.reset}`);
  console.log(`${c.bold}${c.cyan}${hr}${c.reset}\n`);

  // Story overview
  console.log(`${c.bold}Story ID:${c.reset}  ${report.storyId}`);
  console.log(`${c.bold}Scenes:${c.reset}    ${report.totalScenes} total, ${report.imagesPerStory} images generated`);
  console.log(`${c.bold}Selected:${c.reset}  scenes ${report.selectedIndices.map(i => `#${i + 1}`).join(', ')} (indices: [${report.selectedIndices.join(', ')}])`);
  
  if (report.textPhaseDuration) {
    console.log(`${c.bold}Text phase:${c.reset} ${formatDuration(report.textPhaseDuration)}`);
  }
  if (report.imagePhaseDuration) {
    console.log(`${c.bold}Image phase:${c.reset} ${formatDuration(report.imagePhaseDuration)}`);
  }
  console.log(`${c.bold}Image time:${c.reset} ${report.totalDurationFormatted} (sum of per-scene durations)`);

  // Summary stats
  console.log(`\n${c.bold}${c.yellow}── Summary ──${c.reset}`);
  console.log(`  Validations:          ${report.totalValidations}`);
  console.log(`  Regenerations:        ${report.totalRegenerations}`);
  console.log(`  Edit attempts:        ${report.totalEdits} (${report.successfulEdits} succeeded)`);
  console.log(`  Passed 1st attempt:   ${report.passedFirstAttempt}/${report.scenes.length}`);
  if (report.averageScore != null) {
    const scoreColor = report.averageScore >= 80 ? c.green : report.averageScore >= 50 ? c.yellow : c.red;
    console.log(`  Avg validation score: ${scoreColor}${report.averageScore}/100${c.reset}`);
  }

  const passedScenes = report.scenes.filter(s => s.finalOutcome === 'passed').length;
  const failedScenes = report.scenes.filter(s => s.finalOutcome === 'max_retries').length;
  const errorScenes = report.scenes.filter(s => s.finalOutcome === 'validation_error').length;
  const genFailedScenes = report.scenes.filter(s => s.finalOutcome === 'generation_failed').length;

  console.log(`  Final: ${c.green}${passedScenes} passed${c.reset}, ${failedScenes > 0 ? c.red : c.dim}${failedScenes} max retries${c.reset}, ${errorScenes > 0 ? c.yellow : c.dim}${errorScenes} validation errors${c.reset}, ${genFailedScenes > 0 ? c.bgRed + c.white : c.dim}${genFailedScenes} generation failed${c.reset}`);

  // Turnarounds (if any)
  if (report.turnarounds.length > 0) {
    console.log(`\n${c.bold}${c.yellow}── Turnarounds ──${c.reset}`);
    for (const t of report.turnarounds) {
      const icon = t.outcome === 'complete' ? `${c.green}✓${c.reset}` : t.outcome === 'failed' ? `${c.red}✗${c.reset}` : `${c.cyan}…${c.reset}`;
      const sceneStr = t.sceneId != null ? ` (scene #${t.sceneId})` : '';
      const status = t.outcome === 'complete' ? 'complete' : t.outcome === 'failed' ? 'failed' : 'started';
      console.log(`  ${icon} ${c.bold}${t.characterName}${c.reset} — ${status} ${formatTime(t.timestamp)}${sceneStr}`);
      if (t.outcome === 'failed' && t.error) {
        console.log(`      ${c.red}${t.error}${c.reset}`);
      }
    }
  }

  // Per-scene details
  for (const scene of report.scenes) {
    console.log(`\n${c.bold}${c.blue}${thinHr}${c.reset}`);
    console.log(`${c.bold}${c.blue}  SCENE #${scene.sceneId}${c.reset}`);
    console.log(`${c.bold}${c.blue}${thinHr}${c.reset}`);

    console.log(`  ${c.bold}Characters:${c.reset}  ${scene.characters.join(', ')}`);
    console.log(`  ${c.bold}References:${c.reset}  ${scene.referenceCount} image(s)${scene.newCharacters.length > 0 ? ` (new: ${scene.newCharacters.join(', ')})` : ' (all from previous scenes)'}`);
    if (scene.startTime) {
      console.log(`  ${c.bold}Started:${c.reset}     ${formatTime(scene.startTime)}`);
    }
    console.log(`  ${c.bold}Duration:${c.reset}    ${formatDuration(scene.duration)}`);
    if (scene.imageSizeBytes) {
      console.log(`  ${c.bold}Image size:${c.reset}  ${formatBytes(scene.imageSizeBytes)}`);
    }

    // Scene visual
    if (scene.sceneVisual) {
      console.log(`\n  ${c.bold}${c.magenta}Scene Visual:${c.reset}`);
      if (scene.sceneVisual.setting) {
        console.log(`    ${c.dim}Setting:${c.reset} ${wrapText(scene.sceneVisual.setting, 13)}`);
      }
      if (scene.sceneVisual.cameraComposition) {
        const camText = typeof scene.sceneVisual.cameraComposition === 'string'
          ? scene.sceneVisual.cameraComposition
          : `${scene.sceneVisual.cameraComposition.shot}. ${scene.sceneVisual.cameraComposition.characters.map((ch: any) => `${ch.name}: ${ch.description}`).join('. ')}.`;
        console.log(`    ${c.dim}Camera:${c.reset}  ${wrapText(camText, 13)}`);
      }
      if (scene.sceneVisual.lighting) {
        console.log(`    ${c.dim}Light:${c.reset}   ${wrapText(scene.sceneVisual.lighting, 13)}`);
      }
    } else if (scene.environment) {
      console.log(`\n  ${c.bold}${c.magenta}Environment:${c.reset} ${scene.environment.name} (${scene.environment.id})${scene.environment.resolved ? '' : ` ${c.red}[NOT RESOLVED]${c.reset}`}`);
      console.log(`    ${c.dim}(Scene visual details logged at DEBUG level — set LOG_LEVEL=debug to capture full setting/camera/lighting)${c.reset}`);
    }

    // Final outcome badge
    const badge = scene.finalOutcome === 'passed'
      ? `${c.bgGreen}${c.white} PASSED ${c.reset}`
      : scene.finalOutcome === 'max_retries'
        ? `${c.bgYellow}${c.white} MAX RETRIES ${c.reset}`
        : scene.finalOutcome === 'generation_failed'
          ? `${c.bgRed}${c.white} GENERATION FAILED ${c.reset}`
          : `${c.bgRed}${c.white} ERROR ${c.reset}`;
    
    console.log(`\n  ${c.bold}Outcome:${c.reset} ${badge} after ${scene.attempts.length} attempt(s)`);
    if (scene.bestPick) {
      const bp = scene.bestPick;
      const noteStr = bp.selectedBestInsteadOfLast ? ` ${c.cyan}(not last — best of ${bp.allScores.length})${c.reset}` : '';
      console.log(`  ${c.bold}Selected:${c.reset} attempt ${bp.selectedAttempt} (score ${c.yellow}${bp.selectedScore}/100${c.reset})${noteStr}`);
      if (bp.allScores.length > 0) {
        const scoresStr = bp.allScores
          .map(s => {
            const marker = s.attempt === bp.selectedAttempt ? `${c.bold}${c.yellow}` : c.dim;
            return `${marker}#${s.attempt}: ${s.score}${c.reset}`;
          })
          .join('  |  ');
        console.log(`  ${c.bold}Scores:${c.reset}   ${scoresStr}`);
      }
    }
    if (scene.generationError) {
      console.log(`  ${c.red}Error: ${scene.generationError}${c.reset}`);
    }
    if (scene.maxRetriesFeedback) {
      console.log(`  ${c.dim}Last feedback: ${scene.maxRetriesFeedback}${c.reset}`);
    }

    // Attempt timeline
    if (scene.attempts.length > 0) {
      console.log(`\n  ${c.bold}Attempts:${c.reset}`);
      for (const att of scene.attempts) {
        const icon = att.result === 'passed' ? `${c.green}✓${c.reset}` :
                     att.result === 'error' ? `${c.yellow}⚠${c.reset}` :
                     `${c.red}✗${c.reset}`;
        
        const timeStr = formatTime(att.timestamp);
        
        const scoreStr = att.score != null ? `  ${c.dim}── Score: ${att.score}/100${c.reset}` : '';
        console.log(`    ${icon} Attempt ${att.attempt} [${timeStr}]${scoreStr}`);

        if (att.result === 'passed') {
          console.log(`      ${c.green}Validation passed${c.reset} (${att.characterCount} characters found)`);
        } else if (att.result === 'failed') {
          console.log(`      ${c.red}Validation failed${c.reset} — chars: ${att.characterCount}/${att.expected}`);
          
          // Failure details
          const flags: string[] = [];
          if (att.hasUnexpectedCharacters) flags.push('unexpected characters');
          if (att.hasTextOrLetters) flags.push('text/letters');
          if (att.hasAnatomyErrors) flags.push('anatomy errors');
          if (att.duplicatedCharacters && att.duplicatedCharacters.length > 0) {
            flags.push(`duplicates: ${att.duplicatedCharacters.join(', ')}`);
          }
          if (att.missingCharacters && att.missingCharacters.length > 0) {
            flags.push(`missing: ${att.missingCharacters.join(', ')}`);
          }
          if (flags.length > 0) {
            console.log(`      ${c.dim}Flags: ${flags.join(' | ')}${c.reset}`);
          }
          if (att.anatomyIssues && att.anatomyIssues.length > 0) {
            for (const ai of att.anatomyIssues) {
              console.log(`      ${c.dim}Anatomy [${ai.name}]: ${ai.issue}${c.reset}`);
            }
          }
          if (att.feedback) {
            console.log(`      ${c.dim}Feedback: ${att.feedback}${c.reset}`);
          }

          // Action taken
          if (att.action === 'edit') {
            const editIcon = att.editSucceeded ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
            console.log(`      ${c.yellow}→ Action: IMAGE EDIT${c.reset} ${editIcon} ${att.actionReason || ''}`);
          } else if (att.action === 'regenerate') {
            console.log(`      ${c.yellow}→ Action: FULL REGENERATION${c.reset} (${att.actionReason || 'character issues'})`);
          }
        }
      }
    }
  }

  console.log(`\n${c.bold}${c.cyan}${hr}${c.reset}\n`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const storyId = process.argv[2];
  if (!storyId) {
    console.error(`${c.red}Usage: npx tsx src/scripts/analyzeImageGeneration.ts <storyId>${c.reset}`);
    process.exit(1);
  }

  // Find log file
  const logPath = path.resolve(__dirname, '../../logs/app.log');
  if (!fs.existsSync(logPath)) {
    console.error(`${c.red}Log file not found: ${logPath}${c.reset}`);
    process.exit(1);
  }

  console.log(`${c.dim}Parsing logs for story ${storyId}...${c.reset}`);

  const { storyEntries, sceneVisualEntries, refApproachEntries, turnaroundEntries } = await parseLogForStory(logPath, storyId);
  if (storyEntries.length === 0) {
    console.error(`${c.red}No log entries found for story ${storyId}${c.reset}`);
    process.exit(1);
  }

  console.log(`${c.dim}Found ${storyEntries.length} log entries (+ ${sceneVisualEntries.length} scene visual, ${refApproachEntries.length} ref approach, ${turnaroundEntries.length} turnaround)${c.reset}`);

  const report = buildReport(storyId, storyEntries, sceneVisualEntries, refApproachEntries, turnaroundEntries);
  printReport(report);
}

main().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
