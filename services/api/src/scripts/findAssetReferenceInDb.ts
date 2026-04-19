/**
 * Find rows whose JSON columns mention a given asset path fragment.
 *
 * Usage (from services/api, DATABASE_URL in .env):
 *   pnpm exec tsx src/scripts/findAssetReferenceInDb.ts "character_front/1776082425614.png"
 */
import './loadEnvForScripts';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { characters, childProfiles } from '../db/schema';

const fragment = process.argv[2] ?? '';
if (!fragment) {
  console.error('Usage: pnpm exec tsx src/scripts/findAssetReferenceInDb.ts <path-fragment>');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const like = `%${fragment.replace(/%/g, '\\%')}%`;

async function main() {
  const charRows = await db
    .select({
      id: characters.id,
      name: characters.name,
      userId: characters.userId,
      turnaroundSheet: characters.turnaroundSheet,
    })
    .from(characters)
    .where(sql`${characters.turnaroundSheet}::text ILIKE ${like}`);

  const charRef = await db
    .select({
      id: characters.id,
      name: characters.name,
      userId: characters.userId,
      referencePhotos: characters.referencePhotos,
    })
    .from(characters)
    .where(sql`${characters.referencePhotos}::text ILIKE ${like}`);

  const childRows = await db
    .select({
      id: childProfiles.id,
      name: childProfiles.name,
      userId: childProfiles.userId,
      turnaroundSheet: childProfiles.turnaroundSheet,
    })
    .from(childProfiles)
    .where(sql`${childProfiles.turnaroundSheet}::text ILIKE ${like}`);

  const childRef = await db
    .select({
      id: childProfiles.id,
      name: childProfiles.name,
      userId: childProfiles.userId,
      referencePhotos: childProfiles.referencePhotos,
    })
    .from(childProfiles)
    .where(sql`${childProfiles.referencePhotos}::text ILIKE ${like}`);

  console.log(JSON.stringify({ fragment, characters_turnaround: charRows, characters_referencePhotos: charRef, childProfiles_turnaround: childRows, childProfiles_referencePhotos: childRef }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
