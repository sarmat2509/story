/**
 * Parse app.log for "LLM generated story environments" and "Built environment map"
 * to extract characterOutfits. Usage: npx tsx src/scripts/parseEnvFromLog.ts [storyId]
 *
 * If storyId provided, finds request that created that story and shows its envs.
 * Otherwise shows recent entries with environmentOutfits/characterOutfits.
 */

import fs from 'fs';
import path from 'path';

const logPath = path.resolve(process.cwd(), 'logs/app.log');
const altLogPath = path.resolve(process.cwd(), 'services/api/logs/app.log');

function main() {
  const storyId = process.argv[2];
  const file = fs.existsSync(logPath) ? logPath : fs.existsSync(altLogPath) ? altLogPath : null;
  if (!file) {
    console.log('app.log not found');
    process.exit(1);
  }

  const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
  const llmEnvEntries: Array<{ time: number; requestId?: string; storyId?: string; data: any }> = [];
  const builtMapEntries: Array<{ time: number; requestId?: string; storyId?: string; data: any }> = [];
  const storyToRequest = new Map<string, string>();

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const time = obj.time;
      const requestId = obj.requestId;
      const sid = obj.storyId;

      if (obj.msg === 'LLM generated story environments' && obj.environments) {
        llmEnvEntries.push({ time, requestId, storyId: sid, data: obj });
      }
      if (obj.msg === 'Built environment map from LLM output') {
        builtMapEntries.push({ time, requestId, storyId: sid, data: obj });
      }
      if ((obj.msg === 'Checkpoint 4 saved' || obj.checkpoint === 'story_saved') && sid && requestId) {
        storyToRequest.set(sid, requestId);
      }
      if (obj.msg === 'Story saved to database' && sid && requestId) {
        storyToRequest.set(sid, requestId);
      }
    } catch {
      // skip invalid JSON
    }
  }

  if (storyId) {
    const reqId = storyToRequest.get(storyId);
    if (!reqId) {
      console.log('Story', storyId, 'not found in log (no Checkpoint 4 saved with this storyId)');
      process.exit(1);
    }
    const llm = llmEnvEntries.filter((e) => e.requestId === reqId);
    const built = builtMapEntries.filter((e) => e.requestId === reqId);
    if (llm.length === 0 && built.length === 0) {
      console.log('No environment logs for request', reqId);
      const nearby = llmEnvEntries.filter((e) => Math.abs(e.time - saved.time) < 60000);
      if (nearby.length) {
        console.log('Nearby LLM env entries (within 1 min):', nearby.length);
        nearby.slice(-1).forEach((e) => {
          console.log('\n--- LLM generated story environments ---');
          e.data.environments?.forEach((env: any) => {
            console.log(env.id, '|', env.name);
            console.log('  characterOutfits:', env.characterOutfits ?? '(empty)');
          });
        });
      }
      process.exit(0);
    }
    console.log('Story', storyId, '| requestId', reqId);
    const src = llm.length ? llm[llm.length - 1] : built[built.length - 1];
    if (src.data.environments) {
      console.log('\n--- LLM generated story environments ---');
      src.data.environments.forEach((env: any) => {
        console.log(env.id, '|', env.name);
        console.log('  characterOutfits:', env.characterOutfits ?? '(empty)');
      });
    }
    if (src.data.environmentOutfits) {
      console.log('\n--- Built environment map (environmentOutfits) ---');
      src.data.environmentOutfits.forEach((e: any) => {
        console.log(e.id, '| hasCharacterOutfits:', e.hasCharacterOutfits, '| keys:', e.characterOutfitKeys?.join(', ') || '[]');
      });
    }
    process.exit(0);
  }

  // No storyId: show recent entries with emilias_room + enchanted_forest
  const targetEnvIds = ['emilias_room', 'enchanted_forest'];
  const matching = llmEnvEntries.filter((e) => {
    const ids = e.data.environments?.map((x: any) => x.id) || [];
    return targetEnvIds.every((t) => ids.includes(t));
  });

  console.log('Recent entries with emilias_room + enchanted_forest:', matching.length);
  matching.slice(-3).forEach((e, i) => {
    console.log('\n--- Entry', i + 1, '| requestId:', e.requestId, '| time:', new Date(e.time).toISOString(), '---');
    e.data.environments?.forEach((env: any) => {
      console.log(env.id, '|', env.name);
      console.log('  characterOutfits:', env.characterOutfits ?? '(empty)');
    });
  });

  if (matching.length === 0) {
    console.log('No matching entries. Showing last 2 LLM env entries:');
    llmEnvEntries.slice(-2).forEach((e, i) => {
      console.log('\n---', e.requestId, '---');
      e.data.environments?.slice(0, 2).forEach((env: any) => {
        console.log(env.id, '| characterOutfits:', env.characterOutfits ?? '(empty)');
      });
    });
  }
}

main();
