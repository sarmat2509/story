/**
 * Show sceneVisual and the image prompt that would be sent to the image model.
 * Usage: npx tsx src/scripts/showSceneImagePrompt.ts <storyId> <sceneId>
 *        npx tsx src/scripts/showSceneImagePrompt.ts --json path/to/llm_response.json <sceneId>
 *
 * With --json: reads from a JSON file (LLM response format) instead of database.
 */

import path from 'path';
import fs from 'fs';
import { buildSceneImagePrompt } from '../prompts/image/ImagePrompts';
import { buildImageSystemInstruction } from '../prompts/image/ImagePrompts';
import type { SceneVisual } from '../services/types';
import type { StoryEnvironment } from '../ai/types';

function buildEnvironmentMap(text: { environments?: StoryEnvironment[]; scenes?: Array<{ environmentId?: string }> }): Map<string, StoryEnvironment> {
  const map = new Map<string, StoryEnvironment>();
  const envs = text.environments || [];
  for (const e of envs) {
    map.set(e.id, e);
  }
  return map;
}

function buildComposedSceneVisual(
  scene: { sceneId: number; environmentId?: string; sceneVisual?: SceneVisual },
  environmentMap: Map<string, StoryEnvironment>,
  hasEnvironmentImageRef = false
): SceneVisual {
  const sceneVisual = scene.sceneVisual || { setting: '', cameraComposition: { shot: '', characters: [] }, lighting: '' };
  const environmentId = scene.environmentId;
  const environment = environmentId ? environmentMap.get(environmentId) : undefined;

  let composedSetting = sceneVisual.setting || '';

  if (hasEnvironmentImageRef) {
    composedSetting = composedSetting.trim() || 'Same location as reference.';
  } else if (environment?.description) {
    const basePart = environment.description.trim();
    const deltaPart = composedSetting.trim();
    composedSetting = deltaPart ? `${basePart} ${deltaPart}` : basePart;
  }

  return {
    setting: composedSetting,
    cameraComposition: sceneVisual.cameraComposition,
    lighting: sceneVisual.lighting,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const useJson = args[0] === '--json';
  const storyIdOrPath = useJson ? args[1] : args[0];
  const sceneId = parseInt(useJson ? args[2] : args[1] || '9', 10);

  let text: { environments?: StoryEnvironment[]; scenes?: any[] };
  let storyId = '';

  if (useJson && storyIdOrPath) {
    const jsonPath = path.isAbsolute(storyIdOrPath) ? storyIdOrPath : path.resolve(process.cwd(), storyIdOrPath);
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    text = JSON.parse(raw);
    storyId = '(from JSON file)';
  } else {
    const { db } = await import('../db');
    const { stories, storyRequests } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');

    const [story] = await db.select().from(stories).where(eq(stories.id, storyIdOrPath));
    if (!story) {
      console.error('Story not found:', storyIdOrPath);
      process.exit(1);
    }
    storyId = story.id;

    const [req] = await db.select().from(storyRequests).where(eq(storyRequests.storyId, storyId));
    const data = (req?.intermediateData as any) || {};
    text = data.validatedText || data.text || { scenes: story.scenes as any[] };
    if (!text.scenes && story.scenes) {
      text = { ...text, scenes: story.scenes as any[], environments: (data.validatedText || data.text)?.environments };
    }
  }

  const scenes = text.scenes || [];
  const scene = scenes.find((s: any) => s.sceneId === sceneId);
  if (!scene) {
    console.error('Scene', sceneId, 'not found. Available:', scenes.map((s: any) => s.sceneId).join(', '));
    process.exit(1);
  }

  const environmentMap = buildEnvironmentMap(text);
  const hasEnvImageRef = false; // Set true to see delta-only mode
  const composedSceneVisual = buildComposedSceneVisual(scene, environmentMap, hasEnvImageRef);

  const ageGroup = '4-5';
  const style = 'soft_watercolor';

  const prompt = buildSceneImagePrompt({
    sceneVisual: composedSceneVisual,
    ageGroup,
    style,
    hasReferences: false,
    hasEnvironmentImageRef: hasEnvImageRef,
  });

  const systemInstruction = buildImageSystemInstruction({
    style,
    ageGroup,
    hasReferences: false,
    scenarioCardId: undefined,
  });

  console.log('═'.repeat(80));
  console.log(`Scene ${sceneId} | Story: ${storyId}`);
  console.log('═'.repeat(80));
  console.log('\n--- Raw sceneVisual (from LLM) ---');
  console.log(JSON.stringify(scene.sceneVisual, null, 2));
  console.log('\n--- Composed sceneVisual (base env + delta) ---');
  console.log(JSON.stringify(composedSceneVisual, null, 2));
  console.log('\n--- USER PROMPT (sent to image model) ---');
  console.log(prompt);
  console.log('\n--- SYSTEM INSTRUCTION ---');
  console.log(systemInstruction);
  console.log('\n' + '═'.repeat(80));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
