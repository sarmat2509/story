import type { Meta, StoryObj } from '@storybook/react-native';
import type { SeriesListItem } from '@/api/stories';
import { SeriesCard } from './SeriesCard';

const series: SeriesListItem = {
  id: 'forest-chronicles',
  baseTitle: 'Forest Chronicles',
  totalParts: 3,
  storyIds: ['part-1', 'part-2', 'part-3'],
  lastStories: [
    { id: 'part-1', coverImageUrl: null, coverThumbnailUrl: null },
    { id: 'part-2', coverImageUrl: null, coverThumbnailUrl: null },
    { id: 'part-3', coverImageUrl: null, coverThumbnailUrl: null },
  ],
};

const meta: Meta<typeof SeriesCard> = {
  title: 'Cards/Series card',
  component: SeriesCard,
  args: { series, cardWidth: 320, onPress: () => undefined },
};

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const SinglePart: Story = {
  args: { series: { ...series, totalParts: 1, lastStories: series.lastStories.slice(0, 1) } },
};
