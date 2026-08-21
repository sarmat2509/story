import type { Meta, StoryObj } from '@storybook/react-native';
import { PaywallModal } from './PaywallModal';

const meta: Meta<typeof PaywallModal> = {
  title: 'Popups/Paywall',
  component: PaywallModal,
  args: { visible: true, presentation: 'inline', onClose: () => undefined },
  argTypes: { onClose: { action: 'closed' } },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const UsageLimit: Story = {
  args: { limitInfo: { used: 3, limit: 3 }, periodEndFormatted: '1 September' },
};
export const CustomMessage: Story = {
  args: { title: 'Audio limit reached', message: 'Choose a plan with more narrated stories.' },
};
