import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dashboardSource = readFileSync(
  resolve(process.cwd(), 'src/screens/dashboard/DashboardScreen.tsx'),
  'utf8'
);

assert.match(
  dashboardSource,
  /label=\{[\s\S]*dashboard\.actions\.add_child[\s\S]*variant="secondary"[\s\S]*size="md"[\s\S]*style=\{\[styles\.heroAction, styles\.inlineProfilesAction\]\}/,
  'the child-profile action must use the standard medium secondary button'
);
assert.match(
  dashboardSource,
  /label=\{t\('dashboard\.actions\.create_story'\)\}[\s\S]*style=\{\[styles\.heroAction, styles\.primaryHeroAction\]\}[\s\S]*size="md"/,
  'the create-story action must share the same hero button sizing style'
);
assert.match(
  dashboardSource,
  /heroAction:\s*\{[\s\S]*width:\s*272,[\s\S]*maxWidth:\s*'100%'/,
  'both dashboard hero actions must have the same responsive width'
);
assert.match(
  dashboardSource,
  /primaryHeroAction:\s*\{\s*marginTop:\s*theme\.spacing\[3\]/,
  'the two hero actions should keep a compact vertical gap'
);

console.log('dashboard hero action sizing contract passed');
