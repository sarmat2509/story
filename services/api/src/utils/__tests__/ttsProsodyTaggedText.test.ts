import assert from 'node:assert';
import type { TtsSpeechTagCatalog } from '../../providers/base/TtsSpeechTagCatalog';
import {
  normalizeCanonLikeAudioDomain,
  sanitizeVendorMarkup,
  splitTaggedTextForTtsChunks,
  stripApprovedCatalogMarkup,
  validateTaggedAgainstCanon,
} from '../ttsProsodyTaggedText';

const mockCatalog: TtsSpeechTagCatalog = {
  markupModel: 'bracket_only',
  inlineBracketTags: ['pause', 'happy'],
  wrappingTagNames: [],
  promptConstraints: [],
  pauseInstructionsForLlm: 'test',
};

const wrapCatalog: TtsSpeechTagCatalog = {
  markupModel: 'bracket_and_angle_wrap',
  inlineBracketTags: ['pause'],
  wrappingTagNames: ['whisper', 'soft', 'build-intensity'],
  promptConstraints: [],
  pauseInstructionsForLlm: 'test',
};

function testSanitizeRemovesUnknownBracket() {
  const { text } = sanitizeVendorMarkup('Hi [bad] there [pause] end', mockCatalog);
  assert.ok(!text.includes('[bad]'), text);
  assert.ok(text.includes('[pause]'), text);
}

function testSanitizePreservesWhisperPair() {
  const raw = 'Say <whisper>this phrase</whisper> now [pause] done.';
  const { text } = sanitizeVendorMarkup(raw, wrapCatalog);
  assert.ok(text.includes('<whisper>this phrase</whisper>'), text);
  assert.ok(text.includes('[pause]'), text);
}

function testSanitizePreservesBuildIntensityWrapper() {
  const raw = 'He <build-intensity>grumbled loudly</build-intensity> at the vines.';
  const { text } = sanitizeVendorMarkup(raw, wrapCatalog);
  assert.ok(text.includes('<build-intensity>grumbled loudly</build-intensity>'), text);
}

function testSanitizePreservesNestedWrappers() {
  const cat: TtsSpeechTagCatalog = {
    ...wrapCatalog,
    wrappingTagNames: ['build-intensity', 'slow', 'soft', 'whisper'],
  };
  const raw = '<slow><soft>Goodnight, sleep well.</soft></slow>';
  const { text } = sanitizeVendorMarkup(raw, cat);
  assert.strictEqual(text, raw, text);
}

function testValidatePassesWithOnlyAllowedMarkup() {
  const canon = normalizeCanonLikeAudioDomain('Hello world', 'en');
  const tagged = '[happy] Hello world';
  const cat: TtsSpeechTagCatalog = {
    ...mockCatalog,
    inlineBracketTags: ['happy', 'pause'],
  };
  const { text } = sanitizeVendorMarkup(tagged, cat);
  assert.strictEqual(
    validateTaggedAgainstCanon(text, canon, cat, 'en'),
    true,
    'stripped tagged should match canon',
  );
}

function testValidateFailsOnWordChange() {
  const canon = 'Hello world';
  const tagged = 'Hello there';
  assert.strictEqual(validateTaggedAgainstCanon(tagged, canon, mockCatalog, 'en'), false);
}

function testStripApprovedRemovesInline() {
  const cat: TtsSpeechTagCatalog = {
    ...mockCatalog,
    inlineBracketTags: ['pause'],
  };
  const out = stripApprovedCatalogMarkup('A [pause] B', cat);
  assert.strictEqual(
    normalizeCanonLikeAudioDomain(out, 'en'),
    normalizeCanonLikeAudioDomain('A  B', 'en')
  );
}

function testSplitRespectsBracketBoundaries() {
  const max = 80;
  const s =
    'A'.repeat(50) +
    ' word [medium pause] ' +
    'B'.repeat(60) +
    ' [short pause] tail here';
  const parts = splitTaggedTextForTtsChunks(s, max);
  assert.ok(parts.length >= 2, String(parts.length));
  for (const p of parts) {
    assert.ok(p.length <= max, `chunk len ${p.length}`);
  }
  assert.strictEqual(parts.join(''), s);
  const firstJoin = parts[0] + parts[1];
  assert.ok(firstJoin.includes('[medium pause]'), firstJoin);
}

function testSplitSingleShort() {
  const s = 'Hi [pause] there';
  const parts = splitTaggedTextForTtsChunks(s, 500);
  assert.strictEqual(parts.length, 1);
  assert.strictEqual(parts[0], s);
}

void (async () => {
  testSanitizeRemovesUnknownBracket();
  testSanitizePreservesWhisperPair();
  testSanitizePreservesBuildIntensityWrapper();
  testSanitizePreservesNestedWrappers();
  testValidatePassesWithOnlyAllowedMarkup();
  testValidateFailsOnWordChange();
  testStripApprovedRemovesInline();
  testSplitRespectsBracketBoundaries();
  testSplitSingleShort();
  console.log('ttsProsodyTaggedText tests OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
