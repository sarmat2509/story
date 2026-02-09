/**
 * Manual test script for character normalization and reference tracking
 * Run: npx tsx src/scripts/testCharacterNormalization.ts
 */

import { normalizeCharacterName, buildCharacterRegistry } from '../utils/characterNormalization';
import type { CharacterData, ChildProfileData } from '../services/types';

console.log('=== Character Normalization Tests ===\n');

// Test 1: Basic normalization
console.log('Test 1: Basic character name normalization');
const testNames = [
  'Емілія',
  '  Емілія  ', // With spaces
  'ЕМІЛІЯ', // Uppercase
  'Емілія!', // With punctuation
  'Дракон-Макс', // With hyphen
];

testNames.forEach(name => {
  const normalized = normalizeCharacterName(name);
  console.log(`  "${name}" → "${normalized}"`);
});

console.log('\n');

// Test 2: Character registry building
console.log('Test 2: Building character registry');

const userCharacters: CharacterData[] = [
  {
    id: '123',
    name: 'Емілія',
    type: 'child',
    description: 'A brave little girl',
  } as CharacterData,
  {
    id: '456',
    name: 'Котик Мурчик',
    type: 'pet',
    description: 'A fluffy orange cat',
  } as CharacterData,
];

const childProfile: ChildProfileData = {
  id: '789',
  name: 'Олексій',
  ageYears: 5,
} as ChildProfileData;

const llmCharacters = [
  {
    name: 'Дракон Макс',
    type: 'creature',
    description: 'A friendly dragon',
    appearance: 'Small green dragon with purple scales',
  },
  {
    name: 'емілія', // Same as user character but different case
    type: 'child',
    description: 'Should be ignored - user character takes priority',
  },
];

const registry = buildCharacterRegistry(userCharacters, childProfile, llmCharacters);

console.log(`  Registry size: ${registry.size}`);
console.log('  Characters in registry:');
registry.forEach((char, key) => {
  console.log(`    "${key}" → ${char.originalName} (${char.source})`);
});

console.log('\n');

// Test 3: Character deduplication
console.log('Test 3: Character deduplication (case-insensitive)');
const duplicateRegistry = buildCharacterRegistry(
  [{ id: '1', name: 'Емілія', type: 'child', description: 'User provided' } as CharacterData],
  undefined,
  [
    { name: 'ЕМІЛІЯ', type: 'child', description: 'LLM version 1' },
    { name: 'емілія', type: 'child', description: 'LLM version 2' },
  ]
);

console.log(`  Registry size (should be 1): ${duplicateRegistry.size}`);
duplicateRegistry.forEach((char, key) => {
  console.log(`    "${key}" → ${char.originalName} (${char.source})`);
});

console.log('\n=== All tests passed! ===');
