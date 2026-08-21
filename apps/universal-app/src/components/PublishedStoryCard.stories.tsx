import type { Meta, StoryObj } from '@storybook/react-native';
import type { PublicStoryListItem } from '@wondertales/shared';
import { PublishedStoryCard } from './PublishedStoryCard';

const story: PublicStoryListItem = {
  id: 'public-moon-garden',
  title: 'The Moonlit Garden',
  language: 'en',
  ageGroup: '6-7',
  storyFormat: 'graphic_novel',
  authorId: 'author-1',
  authorDisplayName: 'Alex Morgan',
  coverAssetId: null,
  coverImageUrl: null,
  coverThumbnailUrl: null,
  publishedAt: null,
  publishedSlug: 'the-moonlit-garden',
  scenes: [],
  hasAudio: true,
  scenarioCardId: null,
  shareUrl: 'https://example.com/stories/the-moonlit-garden',
  rating: { avg: 4.6, count: 28 },
};

const meta: Meta<typeof PublishedStoryCard> = {
  title: 'Cards/Published story card',
  component: PublishedStoryCard,
  args: { story, variant: 'grid', cardWidth: 340, onPress: () => undefined },
};

export default meta;
type Story = StoryObj<typeof meta>;
export const Grid: Story = {};
export const ListWithRating: Story = { args: { variant: 'list' } };
