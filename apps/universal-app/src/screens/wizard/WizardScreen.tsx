import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/theme';

export default function WizardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Story Wizard</Text>
      <Text style={styles.text}>Story creation wizard will be implemented here</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing[6],
    backgroundColor: theme.colors.background.primary,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing[4],
  },
  text: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
});
