import type { Meta, StoryObj } from '@storybook/react-native';
import { ContinueSeriesSection } from './ContinueSeriesSection';

const meta: Meta<typeof ContinueSeriesSection> = {
  title: 'Story/Continue series',
  component: ContinueSeriesSection,
  args: {
    storyId: 'moonlit-garden',
    seriesInfo: { totalParts: 3, baseTitle: 'The Moonlit Garden' },
    userPlan: 'golden',
    skipPlanGate: true,
    allowScheduling: false,
    onNavigateToPlans: () => undefined,
  },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const CompactCard: Story = { args: { variant: 'card' } };
