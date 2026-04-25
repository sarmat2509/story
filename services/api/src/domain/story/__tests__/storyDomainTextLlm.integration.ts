/**
 * Real LLM: StoryDomainService.generateTextPlain → writes services/api/story-llm-generated-sample.txt
 *
 * Skips unless RUN_STORY_TEXT_LLM=1 and GEMINI_API_KEY or GOOGLE_API_KEY is set (no LLM in CI by default).
 *
 * Run from services/api:
 *   RUN_STORY_TEXT_LLM=1 pnpm test:story-domain-text-llm
 *
 * Optional:
 *   STORY_TEXT_LLM_OUT=/abs/or/rel/path.txt
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import '../../../scripts/loadEnvForScripts';
import type { StorySpec } from '../../../ai/types';
import { logger } from '../../../utils/logger';

const STATIC_POLICY = {
  ageGroup: '6-8' as const,
  language: 'en' as const,
  allowedConflicts: [] as string[],
  constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
  readability: { maxSentenceLen: 18, targetWordsRange: [500, 800] as [number, number], dialogRatio: 0.5 },
  promptGuidelines: '',
};

const STATIC_STORY_SPEC: StorySpec = {
  language: 'en',
  ageGroup: '6-8',
  characters: [],
  policyProfile: STATIC_POLICY,
  goalName: 'Kindness',
  goalGuidance: 'Show small acts of kindness between friends.',
  worldRule: { name: 'Gentle magic', description: 'Magic only appears as soft light when someone shares.' },
};

function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim());
}

async function runLlmIntegration(): Promise<void> {
  if (process.env.RUN_STORY_TEXT_LLM !== '1') {
    logger.info('Skipping story LLM integration (set RUN_STORY_TEXT_LLM=1 to run).');
    return;
  }

  if (!hasGeminiKey()) {
    logger.error('RUN_STORY_TEXT_LLM=1 but GEMINI_API_KEY / GOOGLE_API_KEY missing.');
    process.exit(1);
  }

  const { getStoryDomainService } = await import('../../../services/aiService');
  const domain = getStoryDomainService();
  const result = await domain.generateTextPlain(STATIC_STORY_SPEC);

  assert.ok(result.title?.trim(), 'expected non-empty title from LLM');
  assert.ok(result.description?.trim(), 'expected non-empty description');
  assert.ok(result.scenes.length >= 1, 'expected at least one scene');
  assert.ok(result.fullText?.trim(), 'expected non-empty fullText');

  const outPath = path.resolve(
    process.cwd(),
    process.env.STORY_TEXT_LLM_OUT?.trim() || 'story-llm-generated-sample.txt',
  );

  const body = [
    `title: ${result.title}`,
    '',
    `description: ${result.description}`,
    '',
    `wordCount: ${result.wordCount}`,
    '',
    '--- scenes ---',
    '',
    ...result.scenes.map((s) => `### scene ${s.sceneId}\n\n${s.text}\n`),
    '',
    '--- fullText ---',
    '',
    result.fullText,
    '',
  ].join('\n');

  fs.writeFileSync(outPath, body, 'utf8');
  logger.info({ outPath, sceneCount: result.scenes.length, wordCount: result.wordCount }, 'Wrote LLM story sample');
}

void (async () => {
  await runLlmIntegration();
  if (process.env.RUN_STORY_TEXT_LLM === '1') {
    // eslint-disable-next-line no-console
    console.log('storyDomainTextLlm.integration OK');
  }
})().catch((err) => {
  logger.error({ err }, 'storyDomainTextLlm.integration failed');
  process.exit(1);
});
