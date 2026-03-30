import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

export function AdminLoadingState() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
    </View>
  );
}

export function AdminErrorState({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.status.error,
  },
});
