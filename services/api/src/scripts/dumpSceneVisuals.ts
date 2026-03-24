/**
 * Dump sceneVisual for each scene of a story (from stories.scenes JSONB).
 *
 * Usage:
 *   npx tsx src/scripts/dumpSceneVisuals.ts <storyId>
 *   npx tsx src/scripts/dumpSceneVisuals.ts <storyId> --json   # machine-readable export
 *
 * Docker (from repo root):
 *   docker compose -f docker-compose.dev.yml exec api sh -c \
 *     'cd /app/services/api && npx tsx src/scripts/dumpSceneVisuals.ts <storyId> --json'
 */

import './loadEnvForScripts';
import { db } from '../db';
import { stories } from '../db/schema';
import { eq } from 'drizzle-orm';

const argv = process.argv.slice(2);
const jsonOut = argv.includes('--json');
const storyId = argv.find((a) => a !== '--json') || '8fd4906d-76c0-4123-8034-d317c28b752c';

type OutfitRow = { id?: string; description?: string };

/** Resolve outfit id → wardrobe prose from story.metadata.outfits */
function buildOutfitDescriptionById(metadata: unknown): Map<string, string> {
  const m = metadata as { outfits?: OutfitRow[] } | null | undefined;
  const map = new Map<string, string>();
  if (!Array.isArray(m?.outfits)) return map;
  for (const o of m.outfits) {
    const id = typeof o?.id === 'string' ? o.id.trim() : '';
    const desc = typeof o?.description === 'string' ? o.description.trim() : '';
    if (id) map.set(id, desc);
  }
  return map;
}

async function run() {
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) {
    console.log('Story not found:', storyId);
    process.exit(1);
  }

  const scenes = ((story.scenes as any[]) || []).sort((a: any, b: any) => a.sceneId - b.sceneId);
  const outfitById = buildOutfitDescriptionById(story.metadata);

  if (jsonOut) {
    const payload = {
      storyId: story.id,
      title: story.title,
      scenes: scenes.map((s: any) => ({
        sceneId: s.sceneId,
        environmentId: s.environmentId ?? null,
        characterOutfitIds: s.characterOutfitIds ?? null,
        sceneVisual: s.sceneVisual ?? null,
      })),
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }

  console.log('Story:', story.title);
  console.log('Scenes:', scenes.length);
  console.log('');

  scenes.forEach((s: any) => {
    const sv = s.sceneVisual || {};
    console.log('═'.repeat(60));
    console.log(`Scene ${s.sceneId} | environmentId: ${s.environmentId || '?'}`);
    console.log('═'.repeat(60));
    console.log('\nsetting:');
    console.log(sv.setting || '(empty)');
    const cam = sv.cameraComposition;
    if (cam) {
      console.log('\ncameraComposition:');
      if (typeof cam === 'object') {
        console.log('  shot:', cam.shot);
        (cam.characters || []).forEach((c: any) => {
          const oidRaw = c.outfitId != null ? String(c.outfitId).trim() : '';
          const idSuffix = oidRaw ? ` [outfitId: ${oidRaw}]` : '';
          console.log(`  - ${c.name}: ${c.description || ''}${idSuffix}`);
          if (oidRaw) {
            if (!outfitById.has(oidRaw)) {
              console.log('    outfit: (missing in metadata.outfits)');
            } else {
              const prose = outfitById.get(oidRaw)!.trim();
              console.log(prose ? `    outfit: ${prose}` : '    outfit: (empty description in metadata.outfits)');
            }
          }
        });
      } else {
        console.log(' ', cam);
      }
    }
    console.log('\nlighting:');
    console.log(sv.lighting || '(empty)');
    console.log('');
  });

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
