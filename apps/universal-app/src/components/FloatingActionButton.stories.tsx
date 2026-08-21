import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { FloatingActionButton } from './FloatingActionButton';

const meta: Meta<typeof FloatingActionButton> = {
  title: 'Components/Floating action button',
  component: FloatingActionButton,
  args: { onPress: () => undefined },
  decorators: [
    (Story) => (
      <View style={{ height: 180, position: 'relative' }}>
        <Story />
      </View>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Audio: Story = {};
export const Create: Story = { args: { icon: 'add' } };
