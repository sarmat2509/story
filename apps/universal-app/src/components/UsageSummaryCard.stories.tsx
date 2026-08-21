import type { Meta, StoryObj } from '@storybook/react-native';
import { UsageSummaryCard } from './UsageSummaryCard';

const usage = {
  stories: { used: 7, limit: 10, remaining: 3 },
  graphicNovels: { used: 1, limit: 3, remaining: 2 },
  audio: { used: 2, limit: 5, remaining: 3 },
  imagesPerStory: 8,
  storyCharacterSelectionLimit: 5,
  resetsAt: '2026-09-01T00:00:00.000Z',
};

const meta: Meta<typeof UsageSummaryCard> = {
  title: 'Cards/Usage summary',
  component: UsageSummaryCard,
  args: { usage, periodEndFormatted: '1 September' },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentPlan: Story = {};
export const Unlimited: Story = {
  args: {
    usage: { ...usage, stories: { used: 42, limit: -1, remaining: -1 } },
    variant: 'embedded',
  },
};
export const Loading: Story = { args: { usage: undefined, isLoading: true } };
