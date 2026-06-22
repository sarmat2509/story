/**
 * Dry-run Writer generation for an existing story/request and report how the
 * selected catalog artifact is integrated into the generated manuscript.
 *
 * This does not write the generated story to the database.
 *
 * Usage from repo root:
 *   pnpm --dir services/api debug:story-artifact -- --story <storyId>
 *   pnpm --dir services/api debug:story-artifact -- --request <storyRequestId>
 *   pnpm --dir services/api debug:story-artifact -- --story <storyId> --prompt-only
 */
import './loadEnvForScripts';

import fs from 'fs/promises';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db, closeDatabaseConnection } from '../db';
import { stories, storyRequests, type Story, type StoryRequest } from '../db/schema';
import { getTextProvider, getStoryDomainService } from '../services/aiService';
import { buildStorySpec } from '../services/storyOrchestrationService';
import {
  buildDirectTextPromptPlain,
  buildDirectTextPromptPlainCachedPrefix,
  WRITER_PLAIN_CACHE_KEY,
} from '../prompts/text';
import { parsePlainTextToScenes } from '../domain/story/parsePlainText';
import { countNarrationWords } from '../utils/audioTags';
import type { StoryRequestData } from '../services/types';
import type { UsageMetadata } from '../providers/base/UsageMetadata';

const PLAIN_WRITER_MAX_OUTPUT_TOKENS = 16384;

type Args = {
  storyId?: string;
  requestId?: string;
  outDir: string;
  promptOnly: boolean;
  printPrompt: boolean;
};

type LoadedTarget = {
  story?: Story;
  request: StoryRequest;
  replayPlotExampleId?: string;
  replayWorldRuleId?: string;
};

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let storyId: string | undefined;
  let requestId: string | undefined;
  let outDir = path.resolve(process.cwd(), 'tmp/story-artifact-integration-runs');
  let promptOnly = false;
  let printPrompt = false;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--story' && argv[i + 1]) {
      storyId = argv[++i];
    } else if (arg.startsWith('--story=')) {
      storyId = arg.slice('--story='.length);
    } else if (arg === '--request' && argv[i + 1]) {
      requestId = argv[++i];
    } else if (arg.startsWith('--request=')) {
      requestId = arg.slice('--request='.length);
    } else if (arg === '--out' && argv[i + 1]) {
      outDir = path.resolve(process.cwd(), argv[++i]);
    } else if (arg.startsWith('--out=')) {
      outDir = path.resolve(process.cwd(), arg.slice('--out='.length));
    } else if (arg === '--prompt-only') {
      promptOnly = true;
      printPrompt = true;
    } else if (arg === '--print-prompt') {
      printPrompt = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (!storyId && !requestId && positional[0]) {
    storyId = positional[0];
  }

  if (storyId && requestId) {
    throw new Error('Use either --story or --request, not both.');
  }

  if (!storyId && !requestId) {
    throw new Error(
      'Usage: pnpm --dir services/api debug:story-artifact -- --story <storyId> [--prompt-only] [--out dir]',
    );
  }

  return { storyId, requestId, outDir, promptOnly, printPrompt };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function toStoryRequestData(row: StoryRequest): StoryRequestData {
  return {
    ...row,
    selectedCharacters: normalizeStringArray(row.selectedCharacters),
    selectedChildren: normalizeStringArray(row.selectedChildren),
  };
}

async function loadStoryAndRequest(storyId: string): Promise<LoadedTarget> {
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId)).limit(1);
  if (!story) {
    throw new Error(`Story not found: ${storyId}`);
  }

  const [byStoryFk] = story.storyRequestId
    ? await db.select().from(storyRequests).where(eq(storyRequests.id, story.storyRequestId)).limit(1)
    : [];

  const [byRequestStoryId] = byStoryFk
    ? []
    : await db.select().from(storyRequests).where(eq(storyRequests.storyId, storyId)).limit(1);

  const request = byStoryFk || byRequestStoryId;
  if (!request) {
    throw new Error(`Story request not found for story: ${storyId}`);
  }

  const storyMetadata = (story.metadata || {}) as Record<string, unknown>;
  const replayPlotExampleId =
    typeof storyMetadata.plotExampleId === 'string' ? storyMetadata.plotExampleId : undefined;
  const replayWorldRuleId =
    typeof storyMetadata.worldRuleId === 'string' ? storyMetadata.worldRuleId : undefined;

  return { story, request, replayPlotExampleId, replayWorldRuleId };
}

async function loadRequest(requestId: string): Promise<LoadedTarget> {
  const [request] = await db.select().from(storyRequests).where(eq(storyRequests.id, requestId)).limit(1);
  if (!request) {
    throw new Error(`Story request not found: ${requestId}`);
  }
  return { request };
}

function buildWriterPrompt(spec: Awaited<ReturnType<typeof buildStorySpec>>['spec']): {
  prompt: string;
  sceneCount: number;
  vocabLevel: string;
} {
  const storyDomain = getStoryDomainService() as any;
  const sceneCount = storyDomain.getSceneCount(spec.ageGroup);
  const vocabLevel = storyDomain.getVocabularyLevel(spec.ageGroup);

  return {
    prompt: buildDirectTextPromptPlain({ spec, sceneCount, vocabLevel }),
    sceneCount,
    vocabLevel,
  };
}

function extractCurlyBraceLabels(text: string): string[] {
  const labels = new Set<string>();
  for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
    const label = match[1]?.trim();
    if (label) labels.add(label);
  }
  return [...labels];
}

function findMarkerScene(
  scenes: Array<{ sceneId: number; text: string }>,
): { sceneId: number; text: string; label: string } | undefined {
  for (const scene of scenes) {
    const match = scene.text.match(/\{([^{}]+)\}/);
    if (match?.[1]) {
      return { sceneId: scene.sceneId, text: scene.text, label: match[1].trim() };
    }
  }
  return undefined;
}

function buildEndingExcerpt(fullText: string, label?: string): string {
  if (!label) {
    return fullText.slice(Math.max(0, fullText.length - 900));
  }

  const marker = `{${label}}`;
  const index = fullText.indexOf(marker);
  if (index < 0) {
    return fullText.slice(Math.max(0, fullText.length - 900));
  }

  const start = Math.max(0, index - 450);
  const end = Math.min(fullText.length, index + marker.length + 450);
  return fullText.slice(start, end);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const loaded = args.storyId
    ? await loadStoryAndRequest(args.storyId)
    : await loadRequest(args.requestId!);

  const request = toStoryRequestData(loaded.request);
  const specData = await buildStorySpec(request, {
    plotExampleId: loaded.replayPlotExampleId,
    worldRuleId: loaded.replayWorldRuleId,
  });
  const { spec, selectedCharacters, chosenPlotExampleId, chosenWorldRuleId } = specData;
  const { prompt, sceneCount, vocabLevel } = buildWriterPrompt(spec);
  const closingArtifact = spec.closingArtifact;

  const targetId = args.storyId || args.requestId!;
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(args.outDir, `${targetId}-${runStamp}`);
  await fs.mkdir(runDir, { recursive: true });

  const promptPath = path.join(runDir, 'writer-prompt.txt');
  const specPath = path.join(runDir, 'story-spec.json');
  const reportPath = path.join(runDir, 'artifact-report.json');
  await fs.writeFile(promptPath, prompt, 'utf-8');
  await writeJson(specPath, {
    storyId: args.storyId,
    requestId: request.id,
    sourceStory: loaded.story
      ? {
          id: loaded.story.id,
          title: loaded.story.title,
          language: loaded.story.language,
          ageGroup: loaded.story.ageGroup,
        }
      : undefined,
    sceneCount,
    vocabLevel,
    replayPlotExampleId: loaded.replayPlotExampleId,
    replayWorldRuleId: loaded.replayWorldRuleId,
    chosenPlotExampleId,
    chosenWorldRuleId,
    selectedCharacters: selectedCharacters.map((character) => ({
      id: character.id,
      name: character.name,
      canonicalName: (character as any).canonicalName,
      type: character.type,
      role: character.role,
    })),
    closingArtifact,
    spec,
  });

  console.log('[debugStoryArtifactIntegration] storyId:', args.storyId || '(none)');
  console.log('[debugStoryArtifactIntegration] requestId:', request.id);
  console.log('[debugStoryArtifactIntegration] language:', spec.language);
  console.log('[debugStoryArtifactIntegration] ageGroup:', spec.ageGroup);
  console.log('[debugStoryArtifactIntegration] scenario:', spec.scenarioCard?.id || '(none)');
  console.log('[debugStoryArtifactIntegration] goal:', spec.goal || '(none)');
  console.log('[debugStoryArtifactIntegration] chosenArtifact:', closingArtifact
    ? `${closingArtifact.artifactCode} ${closingArtifact.title} (${closingArtifact.imagePath})`
    : '(none)');
  if ((closingArtifact as any)?.selection) {
    console.log('[debugStoryArtifactIntegration] selection:', JSON.stringify((closingArtifact as any).selection));
  }
  console.log('[debugStoryArtifactIntegration] prompt:', promptPath);
  console.log('[debugStoryArtifactIntegration] spec:', specPath);

  if (args.printPrompt) {
    console.log('\n===== WRITER PROMPT =====\n');
    console.log(prompt);
    console.log('\n===== END WRITER PROMPT =====\n');
  }

  if (args.promptOnly) {
    await writeJson(reportPath, {
      promptOnly: true,
      closingArtifact,
      promptContainsArtifactTitle: closingArtifact ? prompt.includes(closingArtifact.title) : false,
      promptContainsArtifactDescription: closingArtifact ? prompt.includes(closingArtifact.description) : false,
    });
    console.log('[debugStoryArtifactIntegration] prompt-only mode: no LLM call.');
    console.log('[debugStoryArtifactIntegration] report:', reportPath);
    return;
  }

  const usageEvents: UsageMetadata[] = [];
  const rawText = await getTextProvider().generateText({
    prompt,
    cachedPrefix: {
      key: WRITER_PLAIN_CACHE_KEY,
      content: buildDirectTextPromptPlainCachedPrefix(),
      displayName: WRITER_PLAIN_CACHE_KEY,
    },
    maxTokens: PLAIN_WRITER_MAX_OUTPUT_TOKENS,
    temperature: 0.9,
    onUsage: (usage) => usageEvents.push(usage),
    operation: 'debug_story_artifact_integration',
  });

  const parsed = parsePlainTextToScenes(rawText);
  const result = {
    ...parsed,
    wordCount: countNarrationWords(parsed.fullText),
  };
  const artifactTitle = closingArtifact?.title;
  const braceLabels = extractCurlyBraceLabels(result.fullText);
  const markerScene = findMarkerScene(result.scenes);
  const exactTitleMatch = Boolean(artifactTitle && braceLabels.includes(artifactTitle));
  const hasExactlyOneMarker = braceLabels.length === 1;
  const endingExcerpt = buildEndingExcerpt(result.fullText, markerScene?.label);

  const rawPath = path.join(runDir, 'writer-raw.txt');
  const resultPath = path.join(runDir, 'writer-result.json');
  const usagePath = path.join(runDir, 'usage.json');
  await fs.writeFile(rawPath, rawText, 'utf-8');
  await writeJson(resultPath, result);
  await writeJson(usagePath, usageEvents);

  const report = {
    promptOnly: false,
    storyId: args.storyId,
    requestId: request.id,
    language: spec.language,
    ageGroup: spec.ageGroup,
    scenarioCardId: spec.scenarioCard?.id,
    goal: spec.goal,
    closingArtifact,
    promptContainsArtifactTitle: closingArtifact ? prompt.includes(closingArtifact.title) : false,
    promptContainsArtifactDescription: closingArtifact ? prompt.includes(closingArtifact.description) : false,
    generatedTitle: result.title,
    generatedDescription: result.description,
    sceneCount: result.scenes.length,
    wordCount: result.wordCount,
    braceLabels,
    hasExactlyOneMarker,
    exactTitleMatch,
    markerScene: markerScene
      ? {
          sceneId: markerScene.sceneId,
          label: markerScene.label,
        }
      : null,
    endingExcerpt,
    paths: {
      prompt: promptPath,
      spec: specPath,
      raw: rawPath,
      result: resultPath,
      usage: usagePath,
      report: reportPath,
    },
  };

  await writeJson(reportPath, report);

  console.log('[debugStoryArtifactIntegration] raw:', rawPath);
  console.log('[debugStoryArtifactIntegration] result:', resultPath);
  console.log('[debugStoryArtifactIntegration] usage:', usagePath);
  console.log('[debugStoryArtifactIntegration] report:', reportPath);
  console.log('\n===== ARTIFACT INTEGRATION SUMMARY =====');
  console.log('Generated title:', result.title);
  console.log('Artifact:', closingArtifact
    ? `${closingArtifact.artifactCode} ${closingArtifact.title}`
    : '(none)');
  console.log('Brace labels:', braceLabels.length > 0 ? braceLabels.map((label) => `{${label}}`).join(', ') : '(none)');
  console.log('Exactly one marker:', hasExactlyOneMarker ? 'yes' : 'no');
  console.log('Exact title match:', exactTitleMatch ? 'yes' : 'no');
  console.log('Marker scene:', markerScene?.sceneId ?? '(none)');
  console.log('\n===== ENDING / MARKER EXCERPT =====\n');
  console.log(endingExcerpt);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
