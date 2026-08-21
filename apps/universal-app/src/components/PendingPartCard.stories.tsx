import type { Meta, StoryObj } from '@storybook/react-native';
import { PendingPartCard } from './PendingPartCard';

const meta: Meta<typeof PendingPartCard> = {
  title: 'Cards/Pending series part',
  component: PendingPartCard,
  args: { partNumber: 4 },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
