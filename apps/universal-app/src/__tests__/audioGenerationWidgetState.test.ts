import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/screens/story/StoryViewerScreen.tsx'),
  'utf8'
);

const generatingBranch = source.indexOf('{showGeneratingBlock ? (');
const limitBranch = source.indexOf(') : audioLimitExceeded && limitInfo ? (');

assert.ok(generatingBranch >= 0, 'audio widget must render an in-flight generation state');
assert.ok(limitBranch >= 0, 'audio widget must retain the account-level limit state');
assert.ok(
  generatingBranch < limitBranch,
  'an in-flight job must take priority over the account-level audio limit state'
);
assert.match(
  source,
  /A queued\/processing job already owns this story's audio quota/,
  'the state priority should document why an in-flight first audio story is not a limit error'
);

console.log('audio generation widget state tests passed');
