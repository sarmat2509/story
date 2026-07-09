import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const srcRoot = resolve(process.cwd(), 'src');

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
}

const mainNavigatorSource = readSource('navigation/MainNavigator.tsx');

assert.match(
  mainNavigatorSource,
  /!\s*isChildSession\s*&&\s*\(\s*<Tab\.Screen\s+name="Children"/s,
  'instant-mode parent sessions should still register the Children tab route'
);
assert.match(
  mainNavigatorSource,
  /!\s*isChildSession\s*&&\s*\(\s*<Drawer\.Screen\s+name="Children"/s,
  'instant-mode parent sessions should still register the Children drawer route'
);
assert.doesNotMatch(
  mainNavigatorSource,
  /!\s*isInstantMode\s*&&\s*!\s*isChildSession\s*&&\s*\(\s*<(Tab|Drawer)\.Screen\s+name="Children"/s,
  'Children routes must not be hidden only because the user is in instant mode'
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
