import React from 'react';
import { View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import { StoryViewerSkeleton } from './StoryViewerSkeleton';

const meta: Meta<typeof StoryViewerSkeleton> = {
  title: 'Components/StoryViewerSkeleton', component: StoryViewerSkeleton,
  decorators: [(Story) => <View style={{ flex: 1 }}><Story /></View>],
};

export default meta;
type Story = StoryObj<typeof meta>;
export const Loading: Story = {};
