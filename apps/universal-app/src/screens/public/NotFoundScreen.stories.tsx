import type { Meta, StoryObj } from '@storybook/react-native';
import NotFoundScreen from './NotFoundScreen';

const meta: Meta<typeof NotFoundScreen> = {
  title: 'Public/Not found',
  component: NotFoundScreen,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
