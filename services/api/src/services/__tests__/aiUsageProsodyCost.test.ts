import assert from 'node:assert';
import { estimateUsageCostUsd, USAGE_OP_TTS_PROSODY_TAGS } from '../aiUsageService';

function testProsodyTagsPricedLikeTextGemini() {
  const cost = estimateUsageCostUsd({
    provider: 'gemini',
    operation: USAGE_OP_TTS_PROSODY_TAGS,
    model: 'gemini-3-flash-preview',
    inputUnits: 1_000_000,
    outputUnits: 100_000,
  });
  assert.ok(cost != null && cost > 0, `expected positive cost, got ${cost}`);
  // 0.5 + 0.3 = 0.8 USD at list config for this snapshot
  assert.ok(Math.abs(cost! - 0.8) < 0.001, String(cost));
}

function testProsodyTagsUnknownModelFallsBackLikeText() {
  const cost = estimateUsageCostUsd({
    provider: 'gemini',
    operation: USAGE_OP_TTS_PROSODY_TAGS,
    model: 'gemini-3-flash-preview-typo',
    inputUnits: 0,
    outputUnits: 0,
  });
  assert.strictEqual(cost, 0);
}

void (async () => {
  testProsodyTagsPricedLikeTextGemini();
  testProsodyTagsUnknownModelFallsBackLikeText();
  console.log('aiUsageProsodyCost tests OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
