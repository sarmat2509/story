import assert from 'node:assert';
import {
  parseCharacterOutfitsString,
  findNameValueSeparator,
  lookupOutfitForCharacterName,
  isNaturalAppearanceOutfit,
  outfitBindingsToRecord,
  cameraCompositionOutfitsToRecord,
  normalizeOutfitBindingsOnEpisodeText,
} from '../characterOutfits';

function testParsePreservesDotsInOutfit() {
  const input =
    'Emilia: yellow pajamas with star print. Hair in two braids. Flash: natural appearance.';
  const r = parseCharacterOutfitsString(input);
  assert.ok(r.Emilia?.includes('braids'), `expected braids in Emilia outfit, got: ${r.Emilia}`);
  assert.ok(r.Emilia?.includes('pajamas'), 'expected pajamas');
  assert.strictEqual(r.Flash?.trim(), 'natural appearance.');
}

function testParseSemicolon() {
  const input = 'A: red dress; B: blue coat';
  const r = parseCharacterOutfitsString(input);
  assert.strictEqual(r.A, 'red dress');
  assert.strictEqual(r.B, 'blue coat');
}

function testParseNewline() {
  const input = 'Cat: soft fur\nDog: spotted vest';
  const r = parseCharacterOutfitsString(input);
  assert.strictEqual(r.Cat, 'soft fur');
  assert.strictEqual(r.Dog, 'spotted vest');
}

function testParseIdInName() {
  const input = 'Остап [ID: ost-456]: winter coat and boots.';
  const r = parseCharacterOutfitsString(input);
  assert.ok(r['Остап [ID: ost-456]']?.includes('boots'));
}

function testFindNameValueSeparator() {
  const s = 'Name [ID: x]: value';
  assert.strictEqual(findNameValueSeparator(s), s.lastIndexOf(':'));
}

function testLookupOutfit() {
  const outfits = { 'Emily [ID: e1]': 'yellow dress' };
  assert.strictEqual(lookupOutfitForCharacterName('Emily', outfits), 'yellow dress');
  assert.strictEqual(lookupOutfitForCharacterName('Emily [ID: e1]', outfits), 'yellow dress');
}

function testNaturalAppearanceDetection() {
  assert.strictEqual(isNaturalAppearanceOutfit('natural appearance'), true);
  assert.strictEqual(isNaturalAppearanceOutfit('Natural Appearance.'), true);
  assert.strictEqual(isNaturalAppearanceOutfit(' yellow dress '), false);
  assert.strictEqual(isNaturalAppearanceOutfit(undefined), false);
}

function testOutfitBindingsToRecord() {
  const r = outfitBindingsToRecord([
    { characterName: 'Anna', outfitId: 'o_anna_1' },
    { characterName: '  ', outfitId: 'x' },
    { characterName: 'Bob', outfitId: 'o_bob_1' },
  ]);
  assert.deepStrictEqual(r, { Anna: 'o_anna_1', Bob: 'o_bob_1' });
  assert.strictEqual(outfitBindingsToRecord([]), undefined);
  assert.strictEqual(outfitBindingsToRecord(undefined), undefined);
}

function testCameraCompositionOutfitsToRecord() {
  const r = cameraCompositionOutfitsToRecord({
    shot: 'wide',
    characters: [
      { name: 'A', description: 'left', outfitId: 'o_a' },
      { name: 'B', description: 'right', outfitId: 'o_b' },
    ],
  });
  assert.deepStrictEqual(r, { A: 'o_a', B: 'o_b' });
  assert.strictEqual(cameraCompositionOutfitsToRecord(null), undefined);
}

function testNormalizeOutfitBindingsOnEpisodeText() {
  const text = {
    scenes: [
      {
        sceneId: 1,
        sceneVisual: {
          cameraComposition: {
            shot: 'x',
            characters: [{ name: 'X', description: 'pos', outfitId: 'o_x' }],
          },
        },
      },
    ],
  };
  normalizeOutfitBindingsOnEpisodeText(text);
  assert.deepStrictEqual(text.scenes[0].characterOutfitIds, { X: 'o_x' });
  assert.strictEqual((text.scenes[0] as { outfitBindings?: unknown }).outfitBindings, undefined);
}

function testNormalizeLegacyOutfitBindingsFallback() {
  const text = {
    scenes: [{ sceneId: 1, outfitBindings: [{ characterName: 'Y', outfitId: 'o_y' }] }],
  };
  normalizeOutfitBindingsOnEpisodeText(text);
  assert.deepStrictEqual(text.scenes[0].characterOutfitIds, { Y: 'o_y' });
}

testParsePreservesDotsInOutfit();
testParseSemicolon();
testParseNewline();
testParseIdInName();
testFindNameValueSeparator();
testLookupOutfit();
testNaturalAppearanceDetection();
testOutfitBindingsToRecord();
testCameraCompositionOutfitsToRecord();
testNormalizeOutfitBindingsOnEpisodeText();
testNormalizeLegacyOutfitBindingsFallback();
console.log('characterOutfits tests OK');
