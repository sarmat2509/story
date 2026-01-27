import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

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
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  text: {
    fontSize: 16,
    color: '#64748b',
  },
});
