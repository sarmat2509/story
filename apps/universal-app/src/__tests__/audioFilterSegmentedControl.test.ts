import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const srcRoot = resolve(process.cwd(), 'src');
const toggleSource = readFileSync(resolve(srcRoot, 'components/AudioFilterToggle.tsx'), 'utf8');
const headerSource = readFileSync(resolve(srcRoot, 'components/LibraryHeader.tsx'), 'utf8');

assert.doesNotMatch(
  toggleSource,
  /toggleTrack|toggleThumb/,
  'audio filtering should no longer render a separate switch between external labels'
);
assert.match(
  toggleSource,
  /testID="catalog-audio-toggle"[\s\S]*testID="catalog-audio-active-bubble"/,
  'the labels and moving active bubble should live inside one segmented control'
);
assert.match(
  toggleSource,
  /new Animated\.Value\(0\)[\s\S]*new Animated\.Value\(0\)/,
  'the active bubble should animate both its horizontal position and width'
);
assert.match(
  toggleSource,
  /onLayout=\{\(event\) => recordSegmentLayout\(segment, event\)\}/,
  'each localized segment should be measured from its rendered label width'
);
assert.match(
  toggleSource,
  /Animated\.parallel\(\[[\s\S]*toValue:\s*target\.x[\s\S]*toValue:\s*target\.width/,
  'the bubble should move and resize together when the selected segment changes'
);
assert.match(
  toggleSource,
  /renderSegment\(false, allStoriesLabel[\s\S]*renderSegment\(true, audioOnlyLabel/,
  'both titles should be interactive states inside the control'
);
assert.match(
  headerSource,
  /\[allStoriesLabel, audioOnlyLabel, audioToggleRef, onToggleAudioFilter\]/,
  'localized label changes should remeasure and resize the segmented control'
);

console.log('audio filter segmented-control regression guards passed');
