/**
 * Backfill localized story artifact titles into translations.
 *
 * Run:
 *   pnpm --filter wondertales-api backfill:story-artifact-title-translations
 *   pnpm --filter wondertales-api backfill:story-artifact-title-translations -- --missing-only
 */
import './loadEnvForScripts';
import { getLanguageFullDisplay, LOCALE_IDS, type Locale } from '@wondertales/shared';
import { closeDatabaseConnection } from '../db';
import { getDictionaryRepository, getStoryArtifactRepository } from '../repositories';
import { getTextProvider } from '../services/aiService';
import {
  STORY_ARTIFACT_TITLE_FIELD,
  STORY_ARTIFACT_TRANSLATION_ENTITY,
} from '../services/translationService';
import type { StoryArtifact } from '../db/schema';

type ArtifactTitleBatch = Record<string, Partial<Record<Locale, string>>>;

function getNumberArg(name: string, fallback: number): number {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  const raw = inline?.split('=')[1];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}

function normalizeTitle(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed || fallback;
}

function buildBatchPrompt(artifacts: StoryArtifact[]): string {
  const locales = LOCALE_IDS
    .map((locale) => `- ${locale}: ${getLanguageFullDisplay(locale)}`)
    .join('\n');
  const items = artifacts
    .map(
      (artifact) =>
        `- ${artifact.artifactCode}: title="${artifact.title}"; visual_identity="${artifact.description}"`
    )
    .join('\n');

  return `You localize short catalog artifact titles for children's stories.

Return ONLY a compact JSON object. Top-level keys MUST be artifact codes. Each artifact code value MUST be an object with exactly these locale keys:
${locales}

Source title language: Russian (ru).

Rules:
- Preserve the same physical artifact identity across all languages.
- Translate the meaning naturally for each target language; do not transliterate Russian words unless the item is a proper cultural name.
- Keep titles short, concrete, and suitable as collectible item labels.
- Use nominative/base form for catalog labels. Story prose may inflect these later.
- Capitalize naturally for the target language.
- No explanations, no brackets, no IDs, no metadata.
- If a title is ambiguous, use the visual identity to choose the most concrete translation.

Artifacts:
${items}`;
}

async function translateBatch(artifacts: StoryArtifact[]): Promise<ArtifactTitleBatch> {
  const raw = await getTextProvider().generateText({
    prompt: buildBatchPrompt(artifacts),
    temperature: 0.1,
    maxTokens: 20000,
    operation: 'translation',
  });
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    throw new Error(`Batch localization returned non-JSON: ${raw.slice(0, 300)}`);
  }

  const result: ArtifactTitleBatch = {};
  for (const artifact of artifacts) {
    const entry = parsed[artifact.artifactCode];
    const objectEntry =
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
    result[artifact.artifactCode] = LOCALE_IDS.reduce((acc, locale) => {
      acc[locale] = normalizeTitle(objectEntry[locale], artifact.title);
      return acc;
    }, {} as Record<Locale, string>);
  }

  return result;
}

async function saveBatch(batch: ArtifactTitleBatch): Promise<void> {
  const repo = getDictionaryRepository();
  const values = Object.entries(batch).flatMap(([artifactCode, localizations]) =>
    LOCALE_IDS.map((locale) => ({
      entityType: STORY_ARTIFACT_TRANSLATION_ENTITY,
      entityId: artifactCode,
      locale,
      fieldName: STORY_ARTIFACT_TITLE_FIELD,
      value: localizations[locale] || artifactCode,
    }))
  );

  for (const value of values) {
    await repo.upsertTranslation(value);
  }
}

async function hasCompleteTitleTranslations(artifactCode: string): Promise<boolean> {
  const checks = await Promise.all(
    LOCALE_IDS.map((locale) =>
      getDictionaryRepository().findTranslations(
        STORY_ARTIFACT_TRANSLATION_ENTITY,
        [artifactCode],
        locale
      )
    )
  );

  return checks.every((rows) =>
    rows.some(
      (row) => row.fieldName === STORY_ARTIFACT_TITLE_FIELD && row.value.trim().length > 0
    )
  );
}

async function main(): Promise<void> {
  const missingOnly = process.argv.includes('--missing-only');
  const batchSize = getNumberArg('batch-size', 8);
  const artifacts = (await getStoryArtifactRepository().findAllActive()).filter((artifact) =>
    artifact.title?.trim()
  );

  const queue: StoryArtifact[] = [];
  let localized = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Found ${artifacts.length} active story artifacts.`);
  console.log(missingOnly ? 'Mode: missing translations only.' : 'Mode: upsert all title translations.');
  console.log(`Batch size: ${batchSize}.`);

  for (const [index, artifact] of artifacts.entries()) {
    const label = `${index + 1}/${artifacts.length} ${artifact.artifactCode} ${artifact.title}`;

    try {
      if (missingOnly && (await hasCompleteTitleTranslations(artifact.artifactCode))) {
        skipped += 1;
        console.log(`SKIP ${label}`);
        continue;
      }

      queue.push(artifact);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${label}:`, error);
    }
  }

  for (let start = 0; start < queue.length; start += batchSize) {
    const batch = queue.slice(start, start + batchSize);
    const range = `${start + 1}-${start + batch.length}/${queue.length}`;
    try {
      const translations = await translateBatch(batch);
      await saveBatch(translations);
      localized += batch.length;
      console.log(
        `OK   batch ${range}: ${batch.map((artifact) => artifact.artifactCode).join(', ')}`
      );
    } catch (error) {
      failed += batch.length;
      console.error(`FAIL batch ${range}:`, error);
    }
  }

  console.log(`Done. Localized: ${localized}. Skipped: ${skipped}. Failed: ${failed}.`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
