/**
 * Re-run the Writer for an existing story request without writing the generated story to the database.
 *
 * Usage from repo root:
 *   pnpm --filter wondertales-api writer:story -- --story 196ab7e3-89f6-44e3-92fc-393a3b88b858
 *   pnpm --filter wondertales-api writer:story -- --story 196ab7e3-89f6-44e3-92fc-393a3b88b858 --prompt-only
 *
 * Outputs are saved under services/api/tmp/writer-runs by default.
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
  storyId: string;
  outDir: string;
  promptOnly: boolean;
  printPrompt: boolean;
};

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let storyId = '';
  let outDir = path.resolve(process.cwd(), 'tmp/writer-runs');
  let promptOnly = false;
  let printPrompt = false;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--story' && argv[i + 1]) {
      storyId = argv[++i];
    } else if (arg === '--out' && argv[i + 1]) {
      outDir = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === '--prompt-only') {
      promptOnly = true;
      printPrompt = true;
    } else if (arg === '--print-prompt') {
      printPrompt = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  storyId ||= positional[0] || '';

  if (!storyId) {
    console.error(
      'Usage: pnpm --filter wondertales-api writer:story -- --story <storyId> [--out dir] [--prompt-only] [--print-prompt]',
    );
    process.exit(1);
  }

  return { storyId, outDir, promptOnly, printPrompt };
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

async function loadStoryAndRequest(storyId: string): Promise<{ story: Story; request: StoryRequest }> {
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId)).limit(1);
  if (!story) {
    throw new Error(`Story not found: ${storyId}`);
  }

  if (story.seriesId && story.partNumber && story.partNumber > 1) {
    console.warn(
      `[rerunWriterForStory] Story ${storyId} looks like a continuation (part ${story.partNumber}). ` +
        'This script currently replays the base story request without reconstructing continuation context.',
    );
  }

  const [byStoryFk] = story.storyRequestId
    ? await db.select().from(storyRequests).where(eq(storyRequests.id, story.storyRequestId)).limit(1)
    : [];
  if (byStoryFk) return { story, request: byStoryFk };

  const [byRequestStoryId] = await db
    .select()
    .from(storyRequests)
    .where(eq(storyRequests.storyId, storyId))
    .limit(1);
  if (byRequestStoryId) return { story, request: byRequestStoryId };

  throw new Error(`Story request not found for story: ${storyId}`);
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const { story, request: storyRequestRow } = await loadStoryAndRequest(args.storyId);
  const request = toStoryRequestData(storyRequestRow);
  const storyMetadata = (story.metadata || {}) as Record<string, unknown>;
  const replayPlotExampleId = typeof storyMetadata.plotExampleId === 'string'
    ? storyMetadata.plotExampleId
    : undefined;
  const replayWorldRuleId = typeof storyMetadata.worldRuleId === 'string'
    ? storyMetadata.worldRuleId
    : undefined;
  const specData = await buildStorySpec(request, {
    plotExampleId: replayPlotExampleId,
    worldRuleId: replayWorldRuleId,
  });
  const { spec, selectedCharacters, chosenPlotExampleId, chosenWorldRuleId } = specData;
  const { prompt, sceneCount, vocabLevel } = buildWriterPrompt(spec);

  const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(args.outDir, `${args.storyId}-${runStamp}`);
  await fs.mkdir(runDir, { recursive: true });

  const promptPath = path.join(runDir, 'writer-prompt.txt');
  const specPath = path.join(runDir, 'story-spec.json');
  await fs.writeFile(promptPath, prompt, 'utf-8');
  await fs.writeFile(
    specPath,
    JSON.stringify(
      {
        storyId: args.storyId,
        storyRequestId: request.id,
        sceneCount,
        vocabLevel,
        replayPlotExampleId,
        replayWorldRuleId,
        selectedCharacters: selectedCharacters.map((character) => ({
          id: character.id,
          name: character.name,
          canonicalName: (character as any).canonicalName,
          type: character.type,
          role: character.role,
        })),
        chosenPlotExampleId,
        chosenWorldRuleId,
        spec,
      },
      null,
      2,
    ),
    'utf-8',
  );

  console.log('[rerunWriterForStory] storyId:', args.storyId);
  console.log('[rerunWriterForStory] storyRequestId:', request.id);
  console.log('[rerunWriterForStory] language:', spec.language);
  console.log('[rerunWriterForStory] ageGroup:', spec.ageGroup);
  console.log('[rerunWriterForStory] sceneCount:', sceneCount);
  console.log('[rerunWriterForStory] replayPlotExampleId:', replayPlotExampleId || '(none)');
  console.log('[rerunWriterForStory] replayWorldRuleId:', replayWorldRuleId || '(none)');
  console.log('[rerunWriterForStory] chosenPlotExampleId:', chosenPlotExampleId || '(none)');
  console.log('[rerunWriterForStory] chosenWorldRuleId:', chosenWorldRuleId || '(none)');
  console.log('[rerunWriterForStory] selectedCharacters:', selectedCharacters.map((c) => c.name).join(', ') || '(none)');
  console.log('[rerunWriterForStory] prompt:', promptPath);
  console.log('[rerunWriterForStory] spec:', specPath);

  if (args.printPrompt) {
    console.log('\n===== WRITER PROMPT =====\n');
    console.log(prompt);
    console.log('\n===== END WRITER PROMPT =====\n');
  }

  if (args.promptOnly) {
    console.log('[rerunWriterForStory] prompt-only mode: no LLM call.');
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
    operation: 'text_plain',
  });

  const parsed = parsePlainTextToScenes(rawText);
  const result = {
    ...parsed,
    wordCount: countNarrationWords(parsed.fullText),
  };

  const rawPath = path.join(runDir, 'writer-raw.txt');
  const resultPath = path.join(runDir, 'writer-result.json');
  const usagePath = path.join(runDir, 'usage.json');

  await fs.writeFile(rawPath, rawText, 'utf-8');
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2), 'utf-8');
  await fs.writeFile(usagePath, JSON.stringify(usageEvents, null, 2), 'utf-8');

  console.log('[rerunWriterForStory] raw:', rawPath);
  console.log('[rerunWriterForStory] result:', resultPath);
  console.log('[rerunWriterForStory] usage:', usagePath);
  console.log('\n===== WRITER RESULT SUMMARY =====');
  console.log('Title:', result.title);
  console.log('Description:', result.description);
  console.log('Scenes:', result.scenes.length);
  console.log('Word count:', result.wordCount);
  console.log('\n===== WRITER RAW OUTPUT =====\n');
  console.log(rawText);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
