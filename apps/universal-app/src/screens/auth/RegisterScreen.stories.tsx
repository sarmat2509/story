import type { Meta, StoryObj } from '@storybook/react-native';
import RegisterScreen from './RegisterScreen';

const meta: Meta<typeof RegisterScreen> = {
  title: 'Authentication/Register form',
  component: RegisterScreen,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
