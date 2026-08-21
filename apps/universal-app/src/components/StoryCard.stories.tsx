import type { Meta, StoryObj } from '@storybook/react-native';
import { StoryCard } from './StoryCard';

const baseStory = {
  id: 'moon-garden',
  title: 'The Moonlit Garden',
  language: 'en',
  status: 'completed',
  scenes: [],
};

const meta: Meta<typeof StoryCard> = {
  title: 'Cards/Story card',
  component: StoryCard,
  args: { story: baseStory, onPress: () => undefined },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {};
export const GridWithAudio: Story = {
  args: {
    variant: 'grid',
    story: { ...baseStory, hasAudio: true, audioMetadata: { finalAssetId: 'audio-1' } },
  },
};
export const AwaitingParentReview: Story = {
  args: {
    story: { ...baseStory, createdByMode: 'child', parentReviewStatus: 'pending' },
    onDelete: () => undefined,
  },
};
