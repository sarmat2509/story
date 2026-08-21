import type { Meta, StoryObj } from '@storybook/react-native';
import { StoryRatingWidget } from './StoryRatingWidget';

const meta: Meta<typeof StoryRatingWidget> = {
  title: 'Story/Rating widget',
  component: StoryRatingWidget,
  args: { storyId: 'moonlit-garden', slugOrToken: 'moonlit-garden', isUnlisted: false },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const NewStory: Story = {};
export const WithVotes: Story = { args: { rating: { avg: 4.6, count: 28 } } };
