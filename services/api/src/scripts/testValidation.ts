/**
 * Test script for batch validation — verifies that bad content is rejected.
 * Sends deliberately inappropriate content and checks failedScenes is not empty.
 *
 * Run: npx tsx src/scripts/testValidation.ts
 *
 * Requires: DATABASE_URL (for policy), GEMINI_API_KEY or AI provider config
 */

import { getStoryDomainService } from '../services/aiService';
import { buildPolicyProfile } from '../services/policyService';
import type { EpisodeText } from '../ai/types';

const BAD_SCENE = {
  sceneId: 1,
  text: `Хлопчик взяв ніж і почав битися з драконом. Кров бризкала на стіни. Дракон впав мертвий, а хлопчик сміявся з перемоги. Потім він пішов додому і ніколи більше не відчував провини.`,
  sceneVisual: {
    setting: 'A dark cave with blood on the walls',
    cameraComposition: {
      shot: 'Wide shot',
      characters: [{ name: 'Хлопчик', description: 'holding a knife, covered in blood' }],
    },
    lighting: 'Dark and grim',
  },
};

const BAD_LAST_SCENE = {
  sceneId: 2,
  text: `Історія закінчилась трагічно. Всі персонажі загинули. Ніхто не вижив. Темрява поглинула все.`,
  sceneVisual: {
    setting: 'Dark void',
    cameraComposition: { shot: 'Wide', characters: [] },
    lighting: 'Pitch black',
  },
};

const GOOD_SCENE = {
  sceneId: 3,
  text: `Емілія та її друг Котик гралися в саду. Сонце сіяло, квіти пахли. Вони були щасливі і посміхались один одному.`,
  sceneVisual: {
    setting: 'Sunny garden with flowers',
    cameraComposition: {
      shot: 'Medium shot',
      characters: [
        { name: 'Емілія', description: 'playing in the garden, smiling' },
        { name: 'Котик', description: 'sitting beside her' },
      ],
    },
    lighting: 'Warm sunlight',
  },
};

async function runTest() {
  console.log('=== Batch Validation Test ===\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const storyDomain = getStoryDomainService();
  const policy = await buildPolicyProfile('6-8', 'uk');

  // Test 1: Bad content (violence, negative ending) — should fail
  console.log('Test 1: Bad content (violence, blood, negative ending)');
  const badScenes: EpisodeText['scenes'] = [BAD_SCENE, BAD_LAST_SCENE];
  const result1 = await storyDomain.validateScenesBatch(badScenes, policy);

  if (result1.failedScenes.length === 0) {
    console.error('  ❌ FAIL: Expected failedScenes to be non-empty for bad content');
    console.error('  Result:', JSON.stringify(result1, null, 2));
    process.exit(1);
  }
  console.log('  ✅ PASS: failedScenes has', result1.failedScenes.length, 'entries');
  result1.failedScenes.forEach((f) => {
    console.log('    - sceneId:', f.sceneId, 'violations:', f.violations.map((v) => v.category).join(', '));
  });

  // Test 2: Good content — should pass
  console.log('\nTest 2: Good content (age-appropriate, positive)');
  const goodScenes: EpisodeText['scenes'] = [GOOD_SCENE];
  const result2 = await storyDomain.validateScenesBatch(goodScenes, policy);

  if (result2.failedScenes.length > 0) {
    console.error('  ❌ FAIL: Expected failedScenes to be empty for good content');
    console.error('  Result:', JSON.stringify(result2, null, 2));
    process.exit(1);
  }
  console.log('  ✅ PASS: failedScenes is empty');

  console.log('\n=== All validation tests passed ===');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
