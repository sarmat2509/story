import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apiRoot = process.cwd();
const repoRoot = resolve(apiRoot, '../..');
const routeSource = readFileSync(resolve(apiRoot, 'src/routes/meArtifacts.ts'), 'utf8');
const repositorySource = readFileSync(
  resolve(apiRoot, 'src/repositories/CollectedStoryArtifactRepository.ts'),
  'utf8'
);
const clientSource = readFileSync(
  resolve(repoRoot, 'apps/universal-app/src/api/artifacts.ts'),
  'utf8'
);
const screenSource = readFileSync(
  resolve(repoRoot, 'apps/universal-app/src/screens/artifacts/ArtifactsScreen.tsx'),
  'utf8'
);

assert.match(
  routeSource,
  /req\.sessionMode === 'child' \|\| parsed\.data\.childProfileId\s*\?\s*await repository\.listForOwner\(ownerResult\.owner\)\s*:\s*await repository\.listForUser\(req\.user!\.id\)/s,
  'parent artifact view should aggregate the user collection while explicit child scopes remain isolated'
);
assert.match(
  repositorySource,
  /async listForUser\(userId: string\)[\s\S]*?\.where\(eq\(schema\.collectedStoryArtifacts\.userId, userId\)\)/,
  'family artifact query should stay constrained to the authenticated user'
);
assert.match(
  routeSource,
  /res\.setHeader\('Cache-Control', 'private, no-store'\)/,
  'authenticated artifact collections must not be cached by intermediaries'
);
assert.match(
  routeSource,
  /getChildProfileRepository\(\)\.findByUserId\(req\.user!\.id\)/,
  'parent artifact view should resolve child profile names for family artifacts'
);
assert.match(
  routeSource,
  /collectedByChild: collectedByChild \?\? null/,
  'artifact API should expose child attribution and keep parent-owned artifacts unattributed'
);
assert.match(
  clientSource,
  /searchParams\.set\('childProfileId', params\.childProfileId\)/,
  'artifact client should use the canonical API query parameter'
);
assert.match(
  clientSource,
  /collectedByChild:\s*\{[\s\S]*?id: string;[\s\S]*?name: string;[\s\S]*?\} \| null/,
  'artifact client contract should carry child attribution'
);
assert.match(
  screenSource,
  /selectedArtifact\.collectedByChild[\s\S]*?artifacts\.obtained_in_story_by_child/,
  'artifact details should identify the collecting child when attribution is present'
);

console.log('me artifacts scope tests passed');
