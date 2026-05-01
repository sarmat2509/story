import assert from 'node:assert';
import type { TtsSpeechTagCatalog } from '../../providers/base/TtsSpeechTagCatalog';
import { validateTaggedAgainstCanon } from '../ttsProsodyTaggedText';
import { projectApprovedBracketTagsOntoCanon } from '../ttsProsodyTagProjection';

const cat: TtsSpeechTagCatalog = {
  markupModel: 'bracket_only',
  inlineBracketTags: ['happy', 'pause', 'short pause'],
  wrappingTagNames: [],
  promptConstraints: [],
  pauseInstructionsForLlm: 'test',
};

function testProjectionExactMatch() {
  const canon = 'Hello brave world';
  const llm = '[happy] Hello brave world';
  const r = projectApprovedBracketTagsOntoCanon(llm, canon, cat, 'en');
  assert.strictEqual(r.ok, true, r.reason);
  assert.ok(validateTaggedAgainstCanon(r.text, canon, cat, 'en'), r.text);
  assert.strictEqual(r.text, '[happy] Hello brave world');
}

function testProjectionLexicalTypoStillPlacesTag() {
  const canon = 'Hello brave world';
  const llm = '[happy] Hello brave wrld';
  const r = projectApprovedBracketTagsOntoCanon(llm, canon, cat, 'en');
  assert.strictEqual(r.ok, true, r.reason);
  assert.ok(validateTaggedAgainstCanon(r.text, canon, cat, 'en'), r.text);
  assert.ok(r.text.includes('[happy]'), r.text);
  assert.strictEqual(r.text.replace(/\[[^\]]+\]\s*/g, ''), canon);
}

function testProjectionMultipleTagsOrder() {
  const canon = 'One two three.';
  const llm = 'One [pause] two [happy] three.';
  const r = projectApprovedBracketTagsOntoCanon(llm, canon, cat, 'en');
  assert.strictEqual(r.ok, true, r.reason);
  assert.ok(validateTaggedAgainstCanon(r.text, canon, cat, 'en'), r.text);
}

function testWrapCatalogRejected() {
  const wrapCat: TtsSpeechTagCatalog = {
    ...cat,
    markupModel: 'bracket_and_angle_wrap',
    wrappingTagNames: ['whisper'],
  };
  const r = projectApprovedBracketTagsOntoCanon('[pause] Hi', 'Hi', wrapCat, 'en');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'wrap_catalog_unsupported');
}

void (async () => {
  testProjectionExactMatch();
  testProjectionLexicalTypoStillPlacesTag();
  testProjectionMultipleTagsOrder();
  testWrapCatalogRejected();
  // eslint-disable-next-line no-console
  console.log('ttsProsodyTagProjection tests ok');
})();
