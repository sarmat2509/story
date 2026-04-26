/**
 * One-off: generate a Russian children's "mild spooky" tale via StoryDomainService (plain writer flow).
 *
 * Same manuscript shape as the English LLM sample (title, scenes, fullText). Writer prose is **plain**
 * (no bracket audio tags) — deferred prosody at TTS is the app default.
 *
 * Requires GEMINI_API_KEY (or GOOGLE_API_KEY) and WT_SKIP_PROCESS_SIGNAL_HANDLERS=1 in npm script (see package.json).
 *
 * Usage:
 *   pnpm --filter wondertales-api generate:ru-scary-story
 *   pnpm --filter wondertales-api exec tsx src/scripts/generateRussianScaryStorySample.ts -- --out=./my-story.txt
 */

import './loadEnvForScripts';

import fs from 'fs';
import path from 'path';
import type { PolicyProfile, StorySpec } from '../ai/types';
import { logger } from '../utils/logger';

function parseOutPath(): string {
  const raw = process.argv.find((a) => a.startsWith('--out='));
  const apiRoot = path.resolve(__dirname, '../..');
  const rel = raw ? raw.slice('--out='.length).trim() : 'story-ru-scary-sample.txt';
  return path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), rel);
}

const policyProfile: PolicyProfile = {
  ageGroup: '6-8',
  language: 'ru',
  allowedConflicts: [],
  constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
  readability: {
    maxSentenceLen: 22,
    targetWordsRange: [450, 700],
    dialogRatio: 0.45,
  },
  promptGuidelines: '',
};

const spec: StorySpec = {
  language: 'ru',
  ageGroup: '6-8',
  characters: [],
  policyProfile,
  childName: 'Саша',
  scenarioCard: {
    id: 'mild_spooky_ru',
    name: 'Лёгкая страшилка',
    description:
      'Детская «страшилка» в мягком ключе: загадка, полумрак, неожиданные звуки — без крови, насилия и настоящего ужаса. Обязательный спокойный и светлый финал.',
    promptGuidance:
      'История на русском: чердак, старый дом, шорох за дверью, «призрак» из простыни или ветер — классика лёгкой мистики. Допустимы смех и дружба. Не использовать травмирующие образы.',
  },
  userNotes:
    'Тон: как у «страшилки» перед сном для 6–8 лет — можно слегка понервничать, но всё должно разрешиться безопасно и тепло.',
  worldRule: {
    name: 'Никакого настоящего зла',
    description:
      'Пугало всегда оказывается недоразумением, ветром, животным или шуткой; никто не желает реального зла ребёнку.',
  },
};

async function main(): Promise<void> {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!key) {
    console.error('GEMINI_API_KEY or GOOGLE_API_KEY is required.');
    process.exit(1);
  }

  const { getStoryDomainService } = await import('../services/aiService');
  const domain = getStoryDomainService();
  logger.info({ language: spec.language, theme: spec.scenarioCard?.name }, 'Generating Russian spooky story sample');

  const result = await domain.generateTextPlain(spec);
  const outPath = parseOutPath();

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

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, 'utf8');
  console.log(`Wrote ${outPath} (${result.wordCount} words, ${result.scenes.length} scenes)`);
}

main().catch((e) => {
  logger.error({ err: e }, 'generateRussianScaryStorySample failed');
  console.error(e);
  process.exit(1);
});
