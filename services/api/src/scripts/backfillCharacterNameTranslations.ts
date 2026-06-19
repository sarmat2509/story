/**
 * Backfill localized character names into translations.
 *
 * Run:
 *   pnpm --filter wondertales-api backfill:character-name-translations
 *   pnpm --filter wondertales-api backfill:character-name-translations -- --missing-only
 */
import './loadEnvForScripts';
import { LOCALE_IDS } from '@wondertales/shared';
import { closeDatabaseConnection } from '../db';
import { getCharacterRepository, getDictionaryRepository } from '../repositories';
import { localizeCharacterNames } from '../services/translationService';

async function hasCompleteNameTranslations(characterId: string): Promise<boolean> {
  const checks = await Promise.all(
    LOCALE_IDS.map((locale) =>
      getDictionaryRepository().findTranslations('character', [characterId], locale)
    )
  );

  return checks.every((rows) =>
    rows.some((row) => row.fieldName === 'name' && row.value.trim().length > 0)
  );
}

async function main(): Promise<void> {
  const missingOnly = process.argv.includes('--missing-only');
  const characters = (await getCharacterRepository().findAll()).filter((character) => character.name?.trim());

  let localized = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Found ${characters.length} active characters.`);
  console.log(missingOnly ? 'Mode: missing translations only.' : 'Mode: upsert all name translations.');

  for (const [index, character] of characters.entries()) {
    const label = `${index + 1}/${characters.length} ${character.name} (${character.id})`;

    try {
      if (missingOnly && await hasCompleteNameTranslations(character.id)) {
        skipped += 1;
        console.log(`SKIP ${label}`);
        continue;
      }

      const localizations = await localizeCharacterNames(character);
      localized += 1;
      console.log(`OK   ${label}: ${JSON.stringify(localizations)}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${label}:`, error);
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
