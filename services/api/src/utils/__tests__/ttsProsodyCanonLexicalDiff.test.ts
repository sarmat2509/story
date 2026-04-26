import assert from 'node:assert';
import type { TtsSpeechTagCatalog } from '../../providers/base/TtsSpeechTagCatalog';
import { evaluateProsodyLexicalDiffPolicy } from '../ttsProsodyCanonLexicalDiff';

const cat: TtsSpeechTagCatalog = {
  markupModel: 'bracket_only',
  inlineBracketTags: ['pause', 'happy'],
  wrappingTagNames: [],
  promptConstraints: [],
  pauseInstructionsForLlm: 'test',
};

function testAcceptTagOnlyDecoration() {
  const canon = 'Hello world';
  const tagged = '[happy] Hello world';
  const r = evaluateProsodyLexicalDiffPolicy(tagged, canon, cat, 'en');
  assert.strictEqual(r.accept, true);
  assert.strictEqual(r.unifiedDiffLexicalNormalized, '');
  assert.strictEqual(r.approvedBracketTagCount, 1);
}

function testRejectLexicalChangeWithDiff() {
  const canon = 'Hello world';
  const tagged = '[pause] Hello there';
  const r = evaluateProsodyLexicalDiffPolicy(tagged, canon, cat, 'en');
  assert.strictEqual(r.accept, false);
  assert.ok(r.unifiedDiffLexicalNormalized.includes('--- canon'), r.unifiedDiffLexicalNormalized);
  assert.ok(r.unifiedDiffLexicalNormalized.includes('there'), r.unifiedDiffLexicalNormalized);
}

void (async () => {
  testAcceptTagOnlyDecoration();
  testRejectLexicalChangeWithDiff();
  console.log('ttsProsodyCanonLexicalDiff tests OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
