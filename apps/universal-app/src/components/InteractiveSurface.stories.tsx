import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import { InteractiveSurface } from './InteractiveSurface';

const meta: Meta<typeof InteractiveSurface> = {
  title: 'Components/InteractiveSurface',
  component: InteractiveSurface,
  args: { children: null, onPress: () => undefined, accessibilityLabel: 'Open story' },
  argTypes: { onPress: { action: 'pressed' } },
  render: (args) => <InteractiveSurface {...args} style={styles.surface}><Text style={styles.title}>The Moonlit Garden</Text><Text style={styles.body}>Tap to open this story.</Text></InteractiveSurface>,
};

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };

const styles = StyleSheet.create({
  surface: { margin: 24, borderRadius: 20, padding: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE5F4' },
  title: { fontSize: 19, fontWeight: '700', color: '#14213D' },
  body: { marginTop: 6, fontSize: 14, color: '#5E6B82' },
});
