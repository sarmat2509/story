import assert from 'node:assert';
import {
  extractClosingKeepsakeFromEpisodeText,
  extractStoryKeepsakeLabel,
  stripAllTags,
  stripForAudio,
} from '../audioTags';

function testExtractClosingFromScenesWhenFullTextHasNoMarker() {
  const label = extractClosingKeepsakeFromEpisodeText({
    fullText: 'No braces here.',
    scenes: [{ text: 'End {golden leaf}.' }],
  });
  assert.strictEqual(label, 'golden leaf');
}

function testExtractKeepsakeLastWins() {
  const t = 'Start {old leaf}. Later she kept {silver pebble} warm.';
  assert.strictEqual(extractStoryKeepsakeLabel(t), 'silver pebble');
}

function testStripAllTagsUnwrapsKeepsake() {
  assert.strictEqual(
    stripAllTags('She smiled at {woven shell} here.'),
    'She smiled at woven shell here.',
  );
}

function testStripForAudioKeepsAudioTagRemovesKeepsake() {
  const s = stripForAudio('[happy] She found {blue shell}!');
  assert.ok(s.includes('[happy]'), 'allowed audio tag kept');
  assert.ok(!s.includes('{'), 'keepsake braces removed');
  assert.ok(s.includes('blue shell'), 'inner keepsake text remains for TTS');
}

void (async () => {
  testExtractClosingFromScenesWhenFullTextHasNoMarker();
  testExtractKeepsakeLastWins();
  testStripAllTagsUnwrapsKeepsake();
  testStripForAudioKeepsAudioTagRemovesKeepsake();
  console.log('audioTags tests OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
