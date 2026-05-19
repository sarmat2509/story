import React from 'react';
import { TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/theme';

interface FloatingActionButtonProps {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  bottom?: number;
  right?: number;
}

export function FloatingActionButton({
  onPress,
  icon = 'musical-notes',
  bottom = 16,
  right = 16,
}: FloatingActionButtonProps) {
  const insets = useSafeAreaInsets();

  return (
    <TouchableOpacity
      style={[
        styles.fab,
        {
          bottom: insets.bottom + bottom,
          right: right,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons name={icon} size={24} color={theme.colors.text.inverse} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.interactive.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8, // Android shadow
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      web: {
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
      } as any,
    }),
  },
});
