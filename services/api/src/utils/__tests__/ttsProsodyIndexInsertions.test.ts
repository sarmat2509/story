import assert from 'node:assert';
import type { TtsSpeechTagCatalog } from '../../providers/base/TtsSpeechTagCatalog';
import { applyDeferredProsodyIndexInsertions } from '../ttsProsodyIndexInsertions';
import { validateTaggedAgainstCanon } from '../ttsProsodyTaggedText';

const cat: TtsSpeechTagCatalog = {
  markupModel: 'bracket_only',
  inlineBracketTags: ['happy', 'pause'],
  wrappingTagNames: [],
  promptConstraints: [],
  pauseInstructionsForLlm: 'test',
};

function testApplyInsertsAtStartAndMiddle() {
  const canon = 'Hello world';
  const out = applyDeferredProsodyIndexInsertions(
    canon,
    [
      { utf16OffsetBefore: 0, tagInner: 'happy' },
      { utf16OffsetBefore: 6, tagInner: 'pause' },
    ],
    cat
  );
  assert.strictEqual(out, '[happy]Hello [pause]world');
  assert.ok(validateTaggedAgainstCanon(out!, canon, cat, 'en'));
}

void (async () => {
  testApplyInsertsAtStartAndMiddle();
  // eslint-disable-next-line no-console
  console.log('ttsProsodyIndexInsertions tests ok');
})();
