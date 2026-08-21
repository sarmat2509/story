import type { Meta, StoryObj } from '@storybook/react-native';
import { Text } from 'react-native';
import { theme } from '@/theme';
import { LinearGradient } from './AppLinearGradient';

const meta: Meta<typeof LinearGradient> = {
  title: 'Components/Linear gradient',
  component: LinearGradient,
  args: {
    colors: ['#6E56CF', '#FF7A59'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    style: {
      minHeight: 160,
      borderRadius: theme.borders.radius.lg,
      padding: theme.spacing[5],
      justifyContent: 'flex-end',
    },
    children: <Text style={{ color: theme.colors.text.inverse }}>A reusable colour gradient.</Text>,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Sunset: Story = { args: { colors: ['#FF9A8B', '#FF6A88', '#FF99AC'] } };
export const Ocean: Story = { args: { colors: ['#1446A0', '#36C2CE'] } };
