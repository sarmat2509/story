import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const audioPlayer = readFileSync(resolve(process.cwd(), 'src/components/AudioPlayer.tsx'), 'utf8');
const miniPlayer = readFileSync(resolve(process.cwd(), 'src/components/MiniAudioPlayer.tsx'), 'utf8');
const store = readFileSync(resolve(process.cwd(), 'src/store/audioPlayerStore.ts'), 'utf8');
const storyViewer = readFileSync(
  resolve(process.cwd(), 'src/screens/story/StoryViewerScreen.tsx'),
  'utf8'
);
const bottomSheet = readFileSync(resolve(process.cwd(), 'src/components/StoryBottomSheet.tsx'), 'utf8');

assert.match(
  audioPlayer,
  /container:\s*\{[\s\S]*paddingHorizontal: theme\.spacing\[6\]/,
  'AudioPlayer must own its horizontal content padding on every breakpoint'
);
assert.match(
  storyViewer,
  /audioPlayerSidebarWidget[\s\S]*marginBottom: theme\.spacing\[4\]/,
  'desktop audio must use a spacing-only wrapper instead of duplicating its background and padding'
);
assert.match(storyViewer, /icon="layers-outline"/, 'tablet story panel needs a content-neutral icon');
assert.match(
  storyViewer,
  /openBottomSheet[\s\S]*setFullPlayerStoryId\(storyId\)[\s\S]*bottomSheetRef\.current\?\.expand\(\)/,
  'opening the panel must hide the current story mini player before sheet expansion begins'
);
assert.match(
  storyViewer,
  /onSheetChange=\{handleTabletPanelChange\}/,
  'tablet sheet visibility must drive full-player visibility'
);
assert.match(
  bottomSheet,
  /enablePanDownToClose\s+topInset=\{20\}/,
  'story actions sheet must stop 20px below the header when fully expanded'
);
assert.match(
  store,
  /fullPlayerStoryId: string \| null[\s\S]*setFullPlayerStoryId/,
  'audio state must track whether a full player is visible separately from viewing the story'
);
assert.match(
  miniPlayer,
  /isViewingActiveStory && \(isFullPlayerOpenForActiveStory \|\| !hasStartedPlayback\)/,
  'current-story mini player must survive pause after narration has started and its full player is closed'
);
assert.match(
  miniPlayer,
  /Animated\.timing\(entrance,[\s\S]*useNativeDriver: true[\s\S]*translateY:[\s\S]*outputRange: \[72, 0\]/,
  'mini player must slide in from below the bottom edge'
);
assert.doesNotMatch(
  miniPlayer,
  /chevron-up-outline/,
  'mini player must not render the removed non-functional chevron control'
);
assert.match(
  miniPlayer,
  /onPress=\{handleSeek\}[\s\S]*onResponderMove=\{handleDragMove\}/,
  'mini player progress must support both tap-to-seek and dragging'
);
assert.match(
  miniPlayer,
  /globalAudioService\.seekTo\(newPositionSeconds \* 1000\)/,
  'mini player seeking must use the shared audio service'
);
assert.match(
  miniPlayer,
  /viewingStoryId && viewingStoryId !== activeStoryId[\s\S]*navigateToStory\(activeStoryId\)/,
  'mini player must offer opening the playing story only when a different story is being viewed'
);
assert.match(
  store,
  /hasStartedPlayback: boolean[\s\S]*markPlaybackStarted/,
  'audio state must distinguish already-started playback from current playing state'
);

console.log('story audio panel layout contract passed');
