import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

export function AdminTable({
  headers,
  rows,
  emptyText,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  emptyText: string;
}) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        {headers.map((header) => (
          <Text key={header} style={[styles.cell, styles.headerCell]}>
            {header}
          </Text>
        ))}
      </View>

      {rows.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.bodyRow}>
            {row.map((cell, cellIndex) => (
              <View key={cellIndex} style={styles.cell}>
                {typeof cell === 'string' || typeof cell === 'number' ? (
                  <Text style={styles.cellText}>{cell}</Text>
                ) : (
                  cell
                )}
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 12,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background.secondary,
  },
  bodyRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  headerCell: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    textTransform: 'uppercase',
  },
  cellText: {
    fontSize: 13,
    color: theme.colors.text.primary,
  },
  emptyState: {
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
});
