import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const srcRoot = resolve(process.cwd(), 'src');

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
}

const mainNavigatorSource = readSource('navigation/MainNavigator.tsx');
const charactersScreenSource = readSource('screens/characters/CharactersScreen.tsx');

assert.match(
  mainNavigatorSource,
  /<Tab\.Screen\s+name="Children"[\s\S]*?tabBarButton:\s*!isAuthenticated\s*\|\|\s*isChildSession/s,
  'instant-mode parent sessions should still register the Children tab route'
);
assert.match(
  mainNavigatorSource,
  /<Drawer\.Screen\s+name="Children"[\s\S]*?drawerItemStyle:\s*!isAuthenticated\s*\|\|\s*isChildSession/s,
  'instant-mode parent sessions should still register the Children drawer route'
);
assert.doesNotMatch(
  mainNavigatorSource,
  /!\s*isInstantMode\s*&&\s*!\s*isChildSession\s*&&\s*\(\s*<(Tab|Drawer)\.Screen\s+name="Children"/s,
  'Children routes must not be hidden only because the user is in instant mode'
);
assert.match(
  mainNavigatorSource,
  /<Tab\.Screen\s+name="Characters"\s+component=\{CharactersScreenWithAuth\}/s,
  'the Characters tab route should always be registered when its navigation button is shown'
);
assert.match(
  mainNavigatorSource,
  /<Drawer\.Screen\s+name="Characters"\s+component=\{CharactersScreenWithAuth\}/s,
  'the Characters drawer route should always be registered when its navigation item is shown'
);
assert.doesNotMatch(
  mainNavigatorSource,
  /\{\s*\(!isInstantMode\s*\|\|\s*isChildSession\)\s*&&\s*\(\s*<(Tab|Drawer)\.Screen\s+name="Characters"/s,
  'instant mode must not remove the Characters route from a navigator that still links to it'
);

assert.match(
  charactersScreenSource,
  /const\s+canAddCharacter\s*=\s*storyCreationMode\s*!==\s*'instant'/,
  'characters screen should disable manual character creation in instant mode'
);
assert.match(
  charactersScreenSource,
  /if\s*\(\s*!canAddCharacter\s*\|\|\s*characterQuotaExhausted\s*\)/,
  'character creation handler should guard against instant mode'
);
assert.equal(
  charactersScreenSource.match(/\{canAddCharacter\s*&&\s*\(/g)?.length,
  2,
  'both populated and empty character states should hide add actions in instant mode'
);
assert.match(
  charactersScreenSource,
  /characters\.no_characters_instant_hint/,
  'instant-mode empty state should explain automatic character creation'
);

const photoUploadGridSource = readSource('components/form/PhotoUploadGrid.tsx');

assert.match(
  photoUploadGridSource,
  /const\s+asset\s*=\s*result\.assets\[0\]/,
  'photo upload grid should keep the full ImagePicker asset'
);
assert.match(
  photoUploadGridSource,
  /file:\s*asset\.file/,
  'photo upload grid should pass the browser File from ImagePicker to uploadPhoto'
);
assert.match(
  photoUploadGridSource,
  /mimeType:\s*asset\.mimeType/,
  'photo upload grid should preserve ImagePicker MIME type metadata'
);

const uploadPhotoSource = readSource('utils/uploadPhoto.ts');

assert.match(
  uploadPhotoSource,
  /type\s+UploadPhotoSource\s*=/,
  'uploadPhoto should accept structured ImagePicker asset upload sources'
);
assert.match(
  uploadPhotoSource,
  /uploadSource\.file\s*\?\?/,
  'web upload should prefer the ImagePicker File before falling back to fetching a URI'
);
assert.match(
  uploadPhotoSource,
  /formData\.append\('photo',\s*uploadBlob,\s*fileName\)/,
  'web upload should append the selected Blob/File with a filename'
);

const instantWizardSource = readSource('screens/wizard/InstantWizardScreen.tsx');

assert.match(
  instantWizardSource,
  /!\s*photo\.isUploading\s*&&\s*isServerAssetUrl\(photo\.url\)/,
  'instant wizard should generate only with uploaded server asset URLs'
);
assert.match(
  instantWizardSource,
  /isUploading:\s*p\.isUploading/,
  'instant wizard should preserve upload state from PhotoUploadGrid'
);

const assetUrlSource = readSource('utils/assetUrl.ts');

for (const scheme of ['blob:', 'file:', 'data:']) {
  assert.match(
    assetUrlSource,
    new RegExp(`startsWith\\('${scheme}'\\)`),
    `${scheme} URLs should be excluded from server asset detection`
  );
}

console.log('instant mode regression source guards passed');
