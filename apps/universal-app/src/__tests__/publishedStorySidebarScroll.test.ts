import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/screens/published/PublishedStoryScreen.tsx'),
  'utf8'
);

assert.match(
  source,
  /<View style=\{styles\.rightColumnWrapper\}>\s*<ScrollView\s+style=\{styles\.rightColumn\}\s+contentContainerStyle=\{styles\.rightColumnContent\}\s+showsVerticalScrollIndicator=\{true\}/,
  'published story desktop sidebar should use its own visible ScrollView'
);
assert.match(
  source,
  /rightColumnWrapper:\s*\{[\s\S]*?width:\s*theme\.layout\.sidebar\.widthFixed,[\s\S]*?flexShrink:\s*0/,
  'published story sidebar wrapper should keep a fixed desktop column width'
);
assert.match(
  source,
  /rightColumn:\s*\{\s*flex:\s*1,\s*\}/,
  'published story sidebar ScrollView should fill the available screen height'
);
assert.doesNotMatch(
  source,
  /sidebar:\s*\{[^}]*position:\s*'sticky'/,
  'published story sidebar content should not remain sticky inside its scroll column'
);

console.log('published story sidebar scroll regression guards passed');
