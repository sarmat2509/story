import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

export function AdminTable({
  headers,
  rows,
  emptyText,
  minColumnWidth,
  columnWidths,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  emptyText: string;
  /** Keeps dense tables readable and scrollable on narrow viewports. */
  minColumnWidth?: number;
  /** Fixed widths for selected columns, keyed by zero-based column index. */
  columnWidths?: Record<number, number>;
}) {
  return (
    <View style={styles.wrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View
          style={[
            styles.table,
            minColumnWidth ? { minWidth: headers.length * minColumnWidth } : undefined,
          ]}
        >
          <View style={styles.headerRow}>
            {headers.map((header, columnIndex) => (
              <Text
                key={header}
                style={[
                  styles.cell,
                  styles.headerCell,
                  columnWidths?.[columnIndex] != null && styles.fixedCell,
                  columnWidths?.[columnIndex] != null
                    ? {
                        flexBasis: columnWidths[columnIndex],
                        width: columnWidths[columnIndex],
                      }
                    : undefined,
                ]}
              >
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
                  <View
                    key={cellIndex}
                    style={[
                      styles.cell,
                      columnWidths?.[cellIndex] != null && styles.fixedCell,
                      columnWidths?.[cellIndex] != null
                        ? {
                            flexBasis: columnWidths[cellIndex],
                            width: columnWidths[cellIndex],
                          }
                        : undefined,
                    ]}
                  >
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
      </ScrollView>
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
  table: {
    flexGrow: 1,
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
  fixedCell: {
    flexGrow: 0,
    flexShrink: 0,
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
