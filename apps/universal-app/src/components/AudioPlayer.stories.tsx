import React, { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { useAudioPlayerStore } from '@/store/audioPlayerStore';
import AudioPlayer from './AudioPlayer';

type PlayerState = Pick<
  ReturnType<typeof useAudioPlayerStore.getState>,
  | 'activeStoryId'
  | 'position'
  | 'isPlaying'
  | 'isLoading'
  | 'isLoaded'
  | 'isHighlightEnabled'
  | 'playbackRate'
  | 'didJustFinish'
>;

type PlayerPreviewProps = React.ComponentProps<typeof AudioPlayer> & {
  state: PlayerState;
};

/** Seeds the global player store so every story renders its actual runtime state. */
function PlayerPreview({ state, ...props }: PlayerPreviewProps) {
  useEffect(() => {
    const previousState = useAudioPlayerStore.getState();
    useAudioPlayerStore.setState(state);
    return () => useAudioPlayerStore.setState(previousState);
  }, [state]);

  return <AudioPlayer {...props} />;
}

const storyId = 'moonlit-garden';
const baseState: PlayerState = {
  activeStoryId: storyId,
  position: 65,
  isPlaying: false,
  isLoading: false,
  isLoaded: true,
  isHighlightEnabled: false,
  playbackRate: 1,
  didJustFinish: false,
};

const meta: Meta<typeof PlayerPreview> = {
  title: 'Audio/Player',
  component: PlayerPreview,
  args: {
    storyId,
    audioUrl: 'https://example.com/story.mp3',
    duration: 256,
    title: 'Audio Story',
    hasAlignment: true,
    onActivate: async () => undefined,
    state: baseState,
  },
  decorators: [
    (Story) => (
      <View style={{ width: 360, padding: 20 }}>
        <Story />
      </View>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Audio is ready but paused: displays the flat play triangle. */
export const Paused: Story = {};

/** Audio is actively playing: displays the matching flat pause glyph. */
export const Playing: Story = {
  args: { state: { ...baseState, isPlaying: true, position: 69 } },
};

/** The active audio is still buffering; player controls are disabled. */
export const Loading: Story = {
  args: { state: { ...baseState, isLoading: true, isLoaded: false, position: 0 } },
};

/** Read along is enabled while narration follows the current word. */
export const ReadAlongEnabled: Story = {
  args: { state: { ...baseState, isPlaying: true, isHighlightEnabled: true, position: 69 } },
};

/** Playback has reached the end and is ready to be replayed. */
export const Finished: Story = {
  args: { state: { ...baseState, position: 256 } },
};
