/**
 * Test script for Gemini text-embedding-004 cosine similarity
 * 
 * Validates the embedding threshold (0.85) with sample character descriptions
 * covering match/no-match/edge cases.
 * 
 * Run: npx tsx src/scripts/testEmbeddingSimilarity.ts
 */

import 'dotenv/config';
import { generateEmbedding, cosineSimilarity } from '../services/embeddingService';

interface TestPair {
  label: string;
  descA: string;
  descB: string;
  expectedMatch: boolean | 'edge';
}

const THRESHOLD = 0.85;

const testPairs: TestPair[] = [
  // --- Should match (expected > 0.85) ---
  {
    label: 'Pirate cat variants',
    descA: 'A brave orange tabby cat wearing a pirate captain hat, red coat, eyepatch over left eye, holding a small cutlass',
    descB: 'A fearless ginger cat in a captain\'s uniform, tricorn hat, dark red overcoat, black eyepatch, carrying a sword',
    expectedMatch: true,
  },
  {
    label: 'Wizard variants',
    descA: 'A tall elderly wizard with long white beard, purple robe with star patterns, pointed hat, carrying a wooden staff',
    descB: 'An old sorcerer with flowing silver beard, dark violet cloak decorated with moons, tall pointed hat, gnarled staff in hand',
    expectedMatch: true,
  },
  {
    label: 'Baby dragon variants',
    descA: 'A small green dragon with tiny wings, round belly, friendly smile, wearing a red scarf',
    descB: 'A little emerald-colored dragon, stubby wings, chubby body, cheerful expression, wrapped in a crimson scarf',
    expectedMatch: true,
  },

  // --- Should NOT match (expected < 0.85) ---
  {
    label: 'Pirate cat vs bunny',
    descA: 'A brave orange tabby cat wearing a pirate captain hat, red coat',
    descB: 'A fluffy white rabbit with long ears, wearing a blue vest and spectacles',
    expectedMatch: false,
  },
  {
    label: 'Wizard vs dragon',
    descA: 'A tall elderly wizard with long white beard, purple robe',
    descB: 'A small green dragon with tiny wings, round belly',
    expectedMatch: false,
  },
  {
    label: 'Pirate parrot vs princess',
    descA: 'A pirate parrot with a wooden leg, colorful feathers, tricorn hat',
    descB: 'A medieval princess with golden crown, long pink dress, silver tiara',
    expectedMatch: false,
  },

  // --- Edge cases ---
  {
    label: 'Cross-language (EN vs UK)',
    descA: 'A brave orange tabby cat wearing a pirate captain hat, red coat, eyepatch over left eye',
    descB: 'Хоробрий рудий смугастий кіт у піратській капітанській шапці, червоному пальті, пов\'язка на лівому оці',
    expectedMatch: 'edge',
  },
  {
    label: 'Same species, different role: pirate cat vs chef cat',
    descA: 'A brave orange tabby cat wearing a pirate captain hat, red coat, eyepatch, cutlass',
    descB: 'A cheerful orange tabby cat wearing a chef hat, white apron, holding a wooden spoon',
    expectedMatch: 'edge',
  },
  {
    label: 'Same role, different species: pirate cat vs pirate fox',
    descA: 'A brave orange tabby cat wearing a pirate captain hat, red coat, eyepatch',
    descB: 'A cunning red fox wearing a pirate captain hat, dark coat, eyepatch, carrying a cutlass',
    expectedMatch: 'edge',
  },
];

async function main() {
  console.log('='.repeat(100));
  console.log('Gemini text-embedding-004 Cosine Similarity Test');
  console.log(`Threshold: ${THRESHOLD}`);
  console.log('='.repeat(100));
  console.log();

  const embeddings = new Map<string, number[]>();

  // Generate all unique embeddings
  const uniqueTexts = new Set<string>();
  for (const pair of testPairs) {
    uniqueTexts.add(pair.descA);
    uniqueTexts.add(pair.descB);
  }

  console.log(`Generating ${uniqueTexts.size} embeddings...`);
  let count = 0;
  for (const text of uniqueTexts) {
    count++;
    const shortText = text.length > 60 ? text.substring(0, 60) + '...' : text;
    process.stdout.write(`  [${count}/${uniqueTexts.size}] ${shortText}\r`);
    const embedding = await generateEmbedding(text);
    embeddings.set(text, embedding);
  }
  console.log(`\n\nAll embeddings generated (dimension: ${embeddings.values().next().value?.length || '?'})\n`);

  // Compare pairs
  console.log('-'.repeat(100));
  console.log(
    'Category'.padEnd(12) +
    'Label'.padEnd(45) +
    'Score'.padEnd(10) +
    'Match?'.padEnd(10) +
    'Expected'.padEnd(12) +
    'OK?'
  );
  console.log('-'.repeat(100));

  let passed = 0;
  let total = 0;

  for (const pair of testPairs) {
    const embA = embeddings.get(pair.descA)!;
    const embB = embeddings.get(pair.descB)!;
    const score = cosineSimilarity(embA, embB);
    const wouldMatch = score > THRESHOLD;
    const category = pair.expectedMatch === true ? 'SHOULD-MATCH' :
                     pair.expectedMatch === false ? 'SHOULD-NOT' : 'EDGE-CASE';
    
    let ok: string;
    if (pair.expectedMatch === 'edge') {
      ok = '(info)';
    } else {
      const correct = wouldMatch === pair.expectedMatch;
      ok = correct ? 'YES' : '** NO **';
      total++;
      if (correct) passed++;
    }

    console.log(
      category.padEnd(12) +
      pair.label.padEnd(45) +
      score.toFixed(4).padEnd(10) +
      (wouldMatch ? 'YES' : 'no').padEnd(10) +
      (pair.expectedMatch === 'edge' ? 'observe' : pair.expectedMatch ? 'match' : 'no-match').padEnd(12) +
      ok
    );
  }

  console.log('-'.repeat(100));
  console.log(`\nResult: ${passed}/${total} non-edge tests passed at threshold ${THRESHOLD}`);
  
  if (passed < total) {
    console.log('\nWARNING: Some pairs did not match expectations. Consider adjusting the threshold.');
  } else {
    console.log('\nAll non-edge tests passed. Threshold looks good.');
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
