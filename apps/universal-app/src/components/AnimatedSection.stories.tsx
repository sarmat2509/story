import type { Meta, StoryObj } from '@storybook/react-native';
import { Text, View } from 'react-native';
import { theme } from '@/theme';
import { AnimatedSection } from './AnimatedSection';

const meta: Meta<typeof AnimatedSection> = {
  title: 'Components/Animated section',
  component: AnimatedSection,
  args: {
    delay: 0,
    duration: 450,
    translate: 12,
    children: (
      <View
        style={{
          padding: theme.spacing[4],
          borderRadius: theme.borders.radius.lg,
          backgroundColor: theme.colors.background.secondary,
        }}
      >
        <Text
          style={{
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.semibold,
          }}
        >
          This section enters with a fade and upward motion.
        </Text>
      </View>
    ),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Delayed: Story = { args: { delay: 600 } };
export const GentleMotion: Story = { args: { duration: 900, translate: 28 } };
