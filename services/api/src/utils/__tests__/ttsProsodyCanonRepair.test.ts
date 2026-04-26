import assert from 'node:assert';
import type { TtsSpeechTagCatalog } from '../../providers/base/TtsSpeechTagCatalog';
import { attemptRepairTaggedTextToMatchCanon } from '../ttsProsodyCanonRepair';
import { validateTaggedAgainstCanon } from '../ttsProsodyTaggedText';

const cat: TtsSpeechTagCatalog = {
  markupModel: 'bracket_only',
  inlineBracketTags: ['pause', 'happy', 'curiosity'],
  wrappingTagNames: [],
  promptConstraints: [],
  pauseInstructionsForLlm: 'test',
};

function testRepairSingleLetterUk() {
  const canon = 'холод пробирається під куртку';
  const tagged = '[pause] холод пробирається под куртку';
  assert.strictEqual(validateTaggedAgainstCanon(tagged, canon, cat, 'uk'), false);
  const r = attemptRepairTaggedTextToMatchCanon(tagged, canon, cat, 'uk');
  assert.strictEqual(r.repaired, true);
  assert.strictEqual(r.substitutionCount, 1);
  assert.strictEqual(r.text, '[pause] холод пробирається під куртку');
  assert.strictEqual(validateTaggedAgainstCanon(r.text, canon, cat, 'uk'), true);
}

function testNoRepairWhenWordInserted() {
  const canon = 'Hello world';
  const tagged = '[happy] Hello big world';
  const r = attemptRepairTaggedTextToMatchCanon(tagged, canon, cat, 'en');
  assert.strictEqual(r.repaired, false);
  assert.strictEqual(r.text, tagged);
}

void (async () => {
  testRepairSingleLetterUk();
  testNoRepairWhenWordInserted();
  console.log('ttsProsodyCanonRepair tests OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
