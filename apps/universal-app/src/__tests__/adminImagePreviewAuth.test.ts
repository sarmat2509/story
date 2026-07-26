import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const previewScreens = [
  'admin/screens/AdminImageGenerationDetailScreen.tsx',
  'admin/screens/AdminValidationDetailScreen.tsx',
  'admin/screens/AdminScenesScreen.tsx',
];

for (const screen of previewScreens) {
  const source = readFileSync(resolve(process.cwd(), 'src', screen), 'utf8');

  assert.match(
    source,
    /import \{ authenticatedFetch \} from '@\/utils\/authenticatedFetch';/,
    `${screen} must use the shared authenticated image loader`
  );
  assert.match(
    source,
    /authenticatedFetch\(url, \{[\s\S]{0,160}?credentials: 'include'/,
    `${screen} must attach the active session token when loading a protected image`
  );
  assert.doesNotMatch(
    source,
    /const token = await storage\.getAuthToken\(\);[\s\S]{0,200}?fetch\(/,
    `${screen} must not bypass the active auth-store token in its image preview`
  );
}

const validationDetail = readFileSync(
  resolve(process.cwd(), 'src/admin/screens/AdminValidationDetailScreen.tsx'),
  'utf8'
);
assert.match(
  validationDetail,
  /authenticatedFetch\(imageUrl, \{[\s\S]{0,120}?credentials: 'include'/,
  'the validation BBox modal must load its image with the active auth-store token'
);

const helper = readFileSync(resolve(process.cwd(), 'src/utils/authenticatedFetch.ts'), 'utf8');
assert.match(
  helper,
  /useAuthStore\.getState\(\)\.token \?\? \(await storage\.getAuthToken\(\)\)/,
  'protected asset loading must prefer the current auth-store token and retain persisted-token fallback'
);

console.log('admin image preview auth contract passed');
