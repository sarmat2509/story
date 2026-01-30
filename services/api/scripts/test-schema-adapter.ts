/**
 * Test script for GeminiSchemaAdapter
 * Tests nullable type handling
 */

import { GeminiSchemaAdapter } from '../src/providers/text/gemini/GeminiSchemaAdapter';

const adapter = new GeminiSchemaAdapter();

console.log('🧪 Testing GeminiSchemaAdapter with nullable types...\n');

// Test 1: Simple nullable string
console.log('Test 1: Simple nullable string');
const schema1 = {
  type: ['string', 'null'] as any,
  description: 'A nullable string'
};
try {
  const result1 = adapter.convert(schema1);
  console.log('✅ Success:', JSON.stringify(result1, null, 2));
} catch (error) {
  console.log('❌ Failed:', error instanceof Error ? error.message : error);
}

// Test 2: Nullable object
console.log('\nTest 2: Nullable object');
const schema2 = {
  type: ['object', 'null'] as any,
  properties: {
    name: { type: 'string' as any }
  }
};
try {
  const result2 = adapter.convert(schema2);
  console.log('✅ Success:', JSON.stringify(result2, null, 2));
} catch (error) {
  console.log('❌ Failed:', error instanceof Error ? error.message : error);
}

// Test 3: Enum with null
console.log('\nTest 3: Enum with null');
const schema3 = {
  type: ['string', 'null'] as any,
  enum: ['red', 'blue', 'green', null]
};
try {
  const result3 = adapter.convert(schema3);
  console.log('✅ Success:', JSON.stringify(result3, null, 2));
} catch (error) {
  console.log('❌ Failed:', error instanceof Error ? error.message : error);
}

// Test 4: Nullable array
console.log('\nTest 4: Nullable array');
const schema4 = {
  type: ['array', 'null'] as any,
  items: { type: 'string' as any }
};
try {
  const result4 = adapter.convert(schema4);
  console.log('✅ Success:', JSON.stringify(result4, null, 2));
} catch (error) {
  console.log('❌ Failed:', error instanceof Error ? error.message : error);
}

console.log('\n✨ All tests completed!');
