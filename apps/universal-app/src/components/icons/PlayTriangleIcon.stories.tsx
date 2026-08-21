import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { PlayTriangleIcon } from './PlayTriangleIcon';

const meta: Meta<typeof PlayTriangleIcon> = {
  title: 'Icons/Play triangle',
  component: PlayTriangleIcon,
  decorators: [
    (Story) => (
      <View
        style={{
          width: 72,
          height: 72,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#5F4FC6',
          borderRadius: 36,
        }}
      >
        <Story />
      </View>
    ),
  ],
  args: { size: 32 },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
