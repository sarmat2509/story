import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Meta, StoryObj } from '@storybook/react-native';
import { AppButton } from './AppButton';

const meta: Meta<typeof AppButton> = {
  title: 'Components/AppButton',
  component: AppButton,
  args: { label: 'Create a story', onPress: () => undefined },
  argTypes: {
    onPress: { action: 'pressed' },
    variant: { control: 'select', options: ['primary', 'secondary', 'danger', 'dangerSecondary', 'ghost'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { label: 'Save for later', variant: 'secondary', size: 'md' } };
export const Danger: Story = { args: { label: 'Delete story', variant: 'danger', size: 'md' } };
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { loading: true } };
export const WithIcons: Story = {
  args: {
    label: 'Listen now',
    size: 'md',
    leading: <Ionicons name="play" size={18} color="white" />,
    trailing: <Ionicons name="arrow-forward" size={18} color="white" />,
  },
};
