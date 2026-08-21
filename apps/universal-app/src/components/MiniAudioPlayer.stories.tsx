import React, { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { useAudioPlayerStore } from '@/store/audioPlayerStore';
import { MiniAudioPlayer } from './MiniAudioPlayer';

type PlayerState = Pick<
  ReturnType<typeof useAudioPlayerStore.getState>,
  | 'activeStoryId'
  | 'storyTitle'
  | 'duration'
  | 'position'
  | 'isPlaying'
  | 'isLoading'
  | 'viewingStoryId'
>;

function PlayerPreview({ state }: { state: PlayerState }) {
  useEffect(() => {
    const previousState = useAudioPlayerStore.getState();
    useAudioPlayerStore.setState(state);
    return () => useAudioPlayerStore.setState(previousState);
  }, [state]);

  return <MiniAudioPlayer />;
}

const defaultState: PlayerState = {
  activeStoryId: 'moonlit-garden',
  storyTitle: 'The Moonlit Garden',
  duration: 185,
  position: 72,
  isPlaying: false,
  isLoading: false,
  viewingStoryId: null,
};

const meta: Meta<typeof PlayerPreview> = {
  title: 'Audio/Mini player',
  component: PlayerPreview,
  args: { state: defaultState },
  decorators: [
    (Story) => (
      <View style={{ width: 360, overflow: 'hidden', borderRadius: 12 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {};
export const Playing: Story = {
  args: { state: { ...defaultState, isPlaying: true, position: 126 } },
};
export const Loading: Story = {
  args: { state: { ...defaultState, isLoading: true, position: 0 } },
};
