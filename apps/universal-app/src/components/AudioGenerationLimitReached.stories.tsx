import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { AudioGenerationLimitReached } from './AudioGenerationLimitReached';
import { theme } from '@/theme';

const meta: Meta<typeof AudioGenerationLimitReached> = {
  title: 'Audio/Generation limit reached',
  component: AudioGenerationLimitReached,
  args: {
    used: 1,
    limit: 1,
    bundleHintText: 'Buy a bundle on Pricing — more until October 3, 2026.',
    onUpgrade: () => undefined,
    onViewPricing: () => undefined,
  },
  decorators: [
    (Story) => (
      <View
        style={{
          width: 360,
          padding: theme.spacing[5],
          borderWidth: 2,
          borderColor: theme.colors.interactive.primary,
          borderRadius: theme.spacing[4],
          backgroundColor: theme.colors.background.secondary,
        }}
      >
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** A parent has used their included monthly audio story. */
export const FreePlanLimitReached: Story = {};

/** Child Mode communicates the limit but never exposes billing controls. */
export const ChildModeLimitReached: Story = {
  args: { showUpgrade: false },
};
