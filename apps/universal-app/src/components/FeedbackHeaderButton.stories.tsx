import type { Meta, StoryObj } from '@storybook/react-native';
import { FeedbackHeaderButton } from './FeedbackHeaderButton';

const meta: Meta<typeof FeedbackHeaderButton> = {
  title: 'Components/Feedback header button',
  component: FeedbackHeaderButton,
  args: { onPress: () => undefined },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
