import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import { GlassCard } from './GlassCard';

const styles = StyleSheet.create({
  canvas: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#E7EDF8' },
  title: { fontSize: 20, fontWeight: '700', color: '#14213D', marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22, color: '#46556E' },
});

const meta: Meta<typeof GlassCard> = {
  title: 'Components/GlassCard',
  component: GlassCard,
  decorators: [(Story) => <View style={styles.canvas}><Story /></View>],
  args: {
    children: <><Text style={styles.title}>A new adventure awaits</Text><Text style={styles.body}>A soft, elevated surface for featured WonderTales content.</Text></>,
  },
  argTypes: { intensity: { control: 'select', options: ['soft', 'strong'] } },
};

export default meta;
type Story = StoryObj<typeof meta>;
export const Soft: Story = {};
export const Strong: Story = { args: { intensity: 'strong' } };
