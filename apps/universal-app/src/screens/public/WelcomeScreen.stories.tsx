import type { Meta, StoryObj } from '@storybook/react-native';
import WelcomeScreen from './WelcomeScreen';

const meta: Meta<typeof WelcomeScreen> = {
  title: 'Authentication/Login form',
  component: WelcomeScreen,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Email/password and OAuth entry points with locally editable inputs. */
export const Default: Story = {};
