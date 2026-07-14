import './loadEnvForScripts';

import { eq } from 'drizzle-orm';
import { closeDatabaseConnection, db } from '../db';
import { characters } from '../db/schema';
import { generateTurnaroundSheetFromReference } from '../services/turnaroundSheetService';

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim() || null;

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1]?.trim() || null;
  return null;
}

async function main(): Promise<void> {
  const characterId = readArg('character-id');
  const force = process.argv.includes('--force');

  if (!characterId) {
    throw new Error('Usage: generateCharacterTurnaround.ts --character-id <uuid> [--force]');
  }

  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!character || !character.isActive) {
    throw new Error(`Active character not found: ${characterId}`);
  }

  const existingTurnaround = character.turnaroundSheet as { url?: string } | null;
  if (existingTurnaround?.url && !force) {
    console.log(
      JSON.stringify(
        {
          status: 'skipped',
          reason: 'turnaround_already_exists',
          characterId: character.id,
          characterName: character.name,
          turnaroundSheet: character.turnaroundSheet,
        },
        null,
        2
      )
    );
    return;
  }

  const referencePhotos = Array.isArray(character.referencePhotos)
    ? (character.referencePhotos as Array<{ url?: string }>)
    : [];
  const referencePhotoUrls = referencePhotos
    .map((photo) => photo?.url?.trim())
    .filter((url): url is string => Boolean(url));

  if (referencePhotoUrls.length === 0) {
    throw new Error(`Character has no reference photos: ${characterId}`);
  }

  const aiDescription =
    character.aiGeneratedDescription ||
    character.descriptionEn ||
    character.description ||
    undefined;

  const turnaroundSheet = await generateTurnaroundSheetFromReference({
    targetType: 'character',
    targetId: character.id,
    referencePhotoUrls,
    characterName: character.name,
    userId: character.userId,
    aiDescription,
  });

  console.log(
    JSON.stringify(
      {
        status: 'generated',
        characterId: character.id,
        characterName: character.name,
        turnaroundSheet,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
