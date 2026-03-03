/**
 * Verify scenario_world_rules table and integration.
 * - Table exists and has data
 * - findActiveWorldRules returns correct data per scenario
 * - Random selection produces variety
 *
 * Usage: npx tsx src/scripts/verifyWorldRules.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import { db } from '../db';
import { scenarioWorldRules, scenarioCards } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { getDictionaryRepository } from '../repositories';

const EXPECTED_SCENARIOS = [
  'magic_wizards',
  'fantasy_creatures',
  'mysteries_detectives',
  'space_odyssey',
  'medieval_heroes',
  'sea_treasures',
  'super_powers',
  'enchanted_forest',
  'inventors',
  'jungle_adventures',
  'scary_stories',
];

const EXPECTED_RULES_PER_SCENARIO = 10;
const EXPECTED_TOTAL = EXPECTED_SCENARIOS.length * EXPECTED_RULES_PER_SCENARIO;

async function main() {
  console.log('=== World Rules Verification ===\n');

  // 1. Table exists and row count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scenarioWorldRules);
  const totalRows = countResult?.count ?? 0;

  if (totalRows !== EXPECTED_TOTAL) {
    console.error(`❌ Expected ${EXPECTED_TOTAL} rows, got ${totalRows}`);
    process.exit(1);
  }
  console.log(`✅ Table has ${totalRows} world rules\n`);

  // 2. Per-scenario counts
  const repo = getDictionaryRepository();
  let allOk = true;

  for (const scenarioId of EXPECTED_SCENARIOS) {
    const rules = await repo.findActiveWorldRules(scenarioId);
    if (rules.length !== EXPECTED_RULES_PER_SCENARIO) {
      console.error(`❌ ${scenarioId}: expected ${EXPECTED_RULES_PER_SCENARIO} rules, got ${rules.length}`);
      allOk = false;
    } else {
      console.log(`✅ ${scenarioId}: ${rules.length} rules`);
    }
  }

  if (!allOk) {
    process.exit(1);
  }
  console.log('');

  // 3. Verify scenario_card_id references exist in scenario_cards
  const scenarioIds = await db.select({ id: scenarioCards.id }).from(scenarioCards);
  const validIds = new Set(scenarioIds.map((r) => r.id));

  for (const scenarioId of EXPECTED_SCENARIOS) {
    if (!validIds.has(scenarioId)) {
      console.error(`❌ scenario_card_id "${scenarioId}" not found in scenario_cards`);
      allOk = false;
    }
  }
  if (allOk) {
    console.log('✅ All scenario_card_ids exist in scenario_cards\n');
  } else {
    process.exit(1);
  }

  // 4. Random selection variety (simulate buildStorySpec logic)
  const magicRules = await repo.findActiveWorldRules('magic_wizards');
  const pickedIds = new Set<string>();
  const iterations = 50;

  for (let i = 0; i < iterations; i++) {
    const picked = magicRules[Math.floor(Math.random() * magicRules.length)];
    pickedIds.add(picked.id);
  }

  const uniqueCount = pickedIds.size;
  if (uniqueCount < 5) {
    console.error(`❌ Random selection: only ${uniqueCount} unique rules in ${iterations} picks (expected variety)`);
    process.exit(1);
  }
  console.log(`✅ Random selection: ${uniqueCount} unique rules in ${iterations} picks (variety OK)\n`);

  // 5. Sample rule structure
  const sample = magicRules[0];
  if (!sample.id || !sample.name || !sample.description || !sample.scenarioCardId) {
    console.error('❌ Rule structure invalid: missing id, name, description, or scenarioCardId');
    process.exit(1);
  }
  console.log('Sample rule (magic_wizards):');
  console.log(`  id: ${sample.id}`);
  console.log(`  name: ${sample.name}`);
  console.log(`  description: ${sample.description.substring(0, 60)}...`);
  console.log('');

  console.log('=== All checks passed ===');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
