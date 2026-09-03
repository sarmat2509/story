import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/screens/wizard/WizardScreen.tsx'), 'utf8');

assert.match(source, /selectedCharacters\.includes\(character\.id\)/);
assert.match(source, /Boolean\(selectedChildCharacterWithoutTurnaround\)/);
assert.match(source, /testID="wizard-turnaround-required"/);
assert.match(source, /testID="wizard-edit-child-profile"/);
assert.match(
  source,
  /navigation\.navigate\('ChildDetail', \{ childId: firstMissingTurnaroundChild\.id \}\)/
);

console.log('wizard turnaround guard tests passed');
