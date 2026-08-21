import type { Meta, StoryObj } from '@storybook/react-native';
import ForgotPasswordScreen from './ForgotPasswordScreen';

const meta: Meta<typeof ForgotPasswordScreen> = {
  title: 'Authentication/Forgot password',
  component: ForgotPasswordScreen,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
