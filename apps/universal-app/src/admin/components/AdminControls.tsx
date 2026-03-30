import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { theme } from '@/theme';

export function AdminSearchBar({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.text.tertiary}
      autoCapitalize="none"
      autoCorrect={false}
    />
  );
}

export function AdminPagination({
  limit,
  offset,
  total,
  onChange,
}: {
  limit: number;
  offset: number;
  total: number;
  onChange: (nextOffset: number) => void;
}) {
  const canGoBack = offset > 0;
  const canGoForward = offset + limit < total;

  return (
    <View style={styles.pagination}>
      <TouchableOpacity
        style={[styles.pageButton, !canGoBack && styles.pageButtonDisabled]}
        disabled={!canGoBack}
        onPress={() => onChange(Math.max(0, offset - limit))}
      >
        <Text style={styles.pageButtonText}>Previous</Text>
      </TouchableOpacity>
      <Text style={styles.pageText}>
        {total === 0 ? '0 results' : `${offset + 1}-${Math.min(offset + limit, total)} of ${total}`}
      </Text>
      <TouchableOpacity
        style={[styles.pageButton, !canGoForward && styles.pageButtonDisabled]}
        disabled={!canGoForward}
        onPress={() => onChange(offset + limit)}
      >
        <Text style={styles.pageButtonText}>Next</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.primary,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pageButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.secondary,
  },
  pageButtonDisabled: {
    opacity: 0.45,
  },
  pageButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  pageText: {
    color: theme.colors.text.secondary,
    fontSize: 13,
  },
});
