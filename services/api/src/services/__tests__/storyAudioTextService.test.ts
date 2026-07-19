import assert from 'node:assert/strict';
import { resolveStoryAudioScenes } from '../storyAudioTextService';

assert.deepEqual(
  resolveStoryAudioScenes({
    normalizedScenes: [{ sceneId: 2, text: 'Normalized narration.' }],
    embeddedScenes: [{ sceneId: 1, text: 'Comic page narration.' }],
    fullText: 'Fallback narration.',
  }),
  [{ sceneId: 2, text: 'Normalized narration.' }],
  'normalized story/mixed scenes remain the first choice'
);

assert.deepEqual(
  resolveStoryAudioScenes({
    normalizedScenes: [],
    embeddedScenes: [
      { sceneId: 1, text: '[happy] First comic page.' },
      { sceneId: 2, text: 'Second comic page.' },
    ],
    fullText: 'Fallback narration.',
  }),
  [
    { sceneId: 1, text: '[happy] First comic page.' },
    { sceneId: 2, text: 'Second comic page.' },
  ],
  'graphic novels use their ordered embedded page text manifest'
);

assert.deepEqual(
  resolveStoryAudioScenes({
    normalizedScenes: [],
    embeddedScenes: [],
    fullText: 'A final fallback.',
  }),
  [{ sceneId: 1, text: 'A final fallback.' }]
);

assert.deepEqual(
  resolveStoryAudioScenes({ normalizedScenes: [], embeddedScenes: null, fullText: '   ' }),
  []
);

console.log('story audio text service tests passed');
