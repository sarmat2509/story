import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ExpandableCard } from './ExpandableCard';

const styles = StyleSheet.create({ canvas: { flex: 1, padding: 24 }, copy: { fontSize: 15, lineHeight: 22, color: '#46556E' } });

const meta: Meta<typeof ExpandableCard> = {
  title: 'Components/ExpandableCard',
  component: ExpandableCard,
  decorators: [(Story) => <View style={styles.canvas}><Story /></View>],
  args: {
    title: 'Story details', icon: 'book-outline',
    children: <Text style={styles.copy}>Mila follows a friendly fox through a moonlit garden and learns that asking for help is brave.</Text>,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;
export const Collapsed: Story = {};
export const Expanded: Story = { args: { defaultExpanded: true } };
