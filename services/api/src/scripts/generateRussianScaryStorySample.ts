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
 *   pnpm --filter wondertales-api generate:ru-scary-story -- --validate --out=./my-story.txt
 *   pnpm --filter wondertales-api generate:ru-scary-story -- --validate --from-file=./my-story.txt --out=./revalidated.txt
 */

import './loadEnvForScripts';

import fs from 'fs';
import path from 'path';
import type { PolicyProfile, StorySpec } from '../ai/types';
import type { StoryDomainService } from '../domain/story/StoryDomainService';
import { countNarrationWords, countStoryKeepsakeMarkers } from '../utils/audioTags';
import { logger } from '../utils/logger';

type Args = {
  outPath: string;
  fromFilePath?: string;
  validate: boolean;
  maxRetries: number;
};

function parseArgs(): Args {
  const rawOut = process.argv.find((arg) => arg.startsWith('--out='));
  const rawFromFile = process.argv.find((arg) => arg.startsWith('--from-file='));
  const rawMaxRetries = process.argv.find((arg) => arg.startsWith('--max-retries='));
  const fromFileRel = rawFromFile?.slice('--from-file='.length).trim();
  const fromFilePath = fromFileRel
    ? path.isAbsolute(fromFileRel)
      ? fromFileRel
      : path.resolve(process.cwd(), fromFileRel)
    : undefined;
  const defaultOut = fromFilePath
    ? `${fromFilePath.slice(0, -path.extname(fromFilePath).length)}.revalidated${path.extname(fromFilePath) || '.txt'}`
    : 'story-ru-scary-sample.txt';
  const rel = rawOut ? rawOut.slice('--out='.length).trim() : defaultOut;
  const parsedRetries = rawMaxRetries
    ? Number.parseInt(rawMaxRetries.slice('--max-retries='.length), 10)
    : 2;

  return {
    outPath: path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), rel),
    fromFilePath,
    validate: process.argv.includes('--validate'),
    maxRetries: Number.isFinite(parsedRetries) ? Math.max(0, Math.min(parsedRetries, 5)) : 2,
  };
}

type GeneratedStory = Awaited<ReturnType<StoryDomainService['generateTextPlain']>>;
type BatchValidation = Awaited<ReturnType<StoryDomainService['validateScenesBatch']>>;

function readGeneratedStoryArtifact(filePath: string): GeneratedStory {
  const body = fs.readFileSync(filePath, 'utf8');
  const title = body.match(/^title:\s*(.+)$/m)?.[1]?.trim();
  const description = body.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  const scenesStart = body.indexOf('--- scenes ---');
  const fullTextStart = body.indexOf('--- fullText ---');
  if (!title || !description || scenesStart < 0 || fullTextStart <= scenesStart) {
    throw new Error(`Invalid generated story artifact: ${filePath}`);
  }

  const scenesBlock = body.slice(scenesStart + '--- scenes ---'.length, fullTextStart);
  const scenes: Array<{ sceneId: number; text: string }> = [];
  const scenePattern = /### scene (\d+)\s*\n+([\s\S]*?)(?=\n### scene \d+|\s*$)/g;
  let match: RegExpExecArray | null;
  while ((match = scenePattern.exec(scenesBlock)) !== null) {
    scenes.push({ sceneId: Number.parseInt(match[1], 10), text: match[2].trim() });
  }
  if (scenes.length === 0) throw new Error(`No scenes found in generated story artifact: ${filePath}`);

  const fullText = body.slice(fullTextStart + '--- fullText ---'.length).trim();
  return {
    title,
    description,
    scenes,
    fullText: fullText || scenes.map((scene) => scene.text).join('\n\n'),
    wordCount: countNarrationWords(fullText || scenes.map((scene) => scene.text).join('\n\n')),
  } as GeneratedStory;
}

function validationFeedback(validation: BatchValidation['failedScenes'][number]): string {
  return validation.violations
    .map((violation) => {
      const parts = [`[${violation.category}] ${violation.message}`];
      if (violation.relatedSceneIds?.length) {
        parts.push(`Related scenes: ${violation.relatedSceneIds.join(', ')}`);
      }
      if (violation.evidence) parts.push(`Evidence: ${violation.evidence}`);
      if (violation.suggestion) parts.push(`Required repair: ${violation.suggestion}`);
      return parts.join('. ');
    })
    .join('\n');
}

function applyRepairs(
  story: GeneratedStory,
  repairs: Array<{ sceneId: number; text: string }>
): void {
  const textBySceneId = new Map(repairs.map((repair) => [repair.sceneId, repair.text]));
  story.scenes.forEach((scene) => {
    const repaired = textBySceneId.get(scene.sceneId);
    if (!repaired?.trim()) return;
    if (countStoryKeepsakeMarkers(repaired) !== countStoryKeepsakeMarkers(scene.text)) {
      logger.warn(
        {
          sceneId: scene.sceneId,
          originalMarkerCount: countStoryKeepsakeMarkers(scene.text),
          repairedMarkerCount: countStoryKeepsakeMarkers(repaired),
        },
        'Rejecting sample-story repair that changed the keepsake marker count'
      );
      return;
    }
    scene.text = repaired.trim();
  });
  story.fullText = story.scenes.map((scene) => scene.text).join('\n\n');
  story.wordCount = countNarrationWords(story.fullText);
}

async function validateAndRepairStory(
  domain: StoryDomainService,
  story: GeneratedStory,
  maxRetries: number
): Promise<{
  runs: BatchValidation[];
  repairedSceneIds: number[];
  finalFailures: BatchValidation['failedScenes'];
}> {
  const runs: BatchValidation[] = [];
  const repairedSceneIds = new Set<number>();

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const validation = await domain.validateScenesBatch(
      story.scenes,
      policyProfile,
      spec.scenarioCard?.id,
      {
        reservedCharacters: spec.characters,
        operation: 'writer_text_validation',
      }
    );
    runs.push(validation);

    if (validation.failedScenes.length === 0 || attempt === maxRetries) {
      return {
        runs,
        repairedSceneIds: Array.from(repairedSceneIds),
        finalFailures: validation.failedScenes,
      };
    }

    const failedScenes = validation.failedScenes.map((failed) => {
      const scene = story.scenes.find((candidate) => candidate.sceneId === failed.sceneId);
      if (!scene) throw new Error(`Validator selected unknown repair scene ${failed.sceneId}`);
      repairedSceneIds.add(failed.sceneId);
      return {
        sceneId: failed.sceneId,
        originalText: scene.text,
        feedback: validationFeedback(failed),
      };
    });
    const repairs = await domain.regenerateScenesBatch(spec, story.scenes.length, failedScenes, {
      storyScenes: story.scenes.map((scene) => ({ sceneId: scene.sceneId, text: scene.text })),
    });
    applyRepairs(story, repairs);
  }

  return { runs, repairedSceneIds: Array.from(repairedSceneIds), finalFailures: [] };
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
  const args = parseArgs();
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!key) {
    console.error('GEMINI_API_KEY or GOOGLE_API_KEY is required.');
    process.exit(1);
  }

  const { getStoryDomainService } = await import('../services/aiService');
  const domain = getStoryDomainService();
  let result: GeneratedStory;
  if (args.fromFilePath) {
    logger.info({ fromFilePath: args.fromFilePath }, 'Loading Russian story sample for validation');
    result = readGeneratedStoryArtifact(args.fromFilePath);
  } else {
    logger.info(
      { language: spec.language, theme: spec.scenarioCard?.name },
      'Generating Russian spooky story sample'
    );
    result = await domain.generateTextPlain(spec);
  }
  const originalBody = result.fullText;
  const validation = args.validate
    ? await validateAndRepairStory(domain, result, args.maxRetries)
    : null;
  const outPath = args.outPath;

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
  if (validation) {
    const ext = path.extname(outPath);
    const base = ext ? outPath.slice(0, -ext.length) : outPath;
    const validationPath = `${base}.validation.json`;
    fs.writeFileSync(validationPath, JSON.stringify(validation, null, 2), 'utf8');
    if (validation.repairedSceneIds.length > 0) {
      fs.writeFileSync(`${base}.original.txt`, originalBody, 'utf8');
    }
    console.log(
      `Validation: ${validation.runs.length} run(s), repaired scenes: ${validation.repairedSceneIds.join(', ') || 'none'}, final failures: ${validation.finalFailures.length}`
    );
    console.log(`Validation details: ${validationPath}`);
    if (validation.finalFailures.length > 0) process.exitCode = 2;
  }
  console.log(`Wrote ${outPath} (${result.wordCount} words, ${result.scenes.length} scenes)`);
}

main().catch((e) => {
  logger.error({ err: e }, 'generateRussianScaryStorySample failed');
  console.error(e);
  process.exit(1);
});
