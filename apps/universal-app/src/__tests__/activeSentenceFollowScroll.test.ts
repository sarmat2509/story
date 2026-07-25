import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const viewerSource = readFileSync(
  resolve(process.cwd(), 'src/screens/story/StoryViewerScreen.tsx'),
  'utf8'
);

assert.match(
  viewerSource,
  /const sentenceRefs = useRef<Record<number, Text \| null>>\(\{\}\)/,
  'aligned sentences must expose scroll targets'
);
assert.match(
  viewerSource,
  /sentenceRefs\.current\[sentenceIndex\] = ref/,
  'each aligned sentence must register its rendered element'
);
assert.match(
  viewerSource,
  /visibleTop = Math\.max\(scrollRect\.top, 0\)[\s\S]*visibleBottom = Math\.min\(scrollRect\.bottom, window\.innerHeight\)/,
  'web centering must use the visible reading container after sticky UI is excluded'
);
assert.match(
  viewerSource,
  /sceneRect\.height > availableReadingHeight && sentenceElement[\s\S]*scrollTargetToViewportCenter\(sentenceElement\)/,
  'an oversized web scene must follow its active sentence'
);
assert.match(
  viewerSource,
  /sceneHeight > scrollViewportHeight &&\s*sentenceElement[\s\S]*scrollTargetToViewportCenter\(sentenceElement\)/,
  'an oversized native scene must follow its active sentence'
);
assert.match(
  viewerSource,
  /const sceneChanged = lastFollowedSceneIndexRef\.current !== activeSceneIndex/,
  'a scene that fits should only be recentered when the active scene changes'
);

console.log('active sentence follow-scroll contract passed');
