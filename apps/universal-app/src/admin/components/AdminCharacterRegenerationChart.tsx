import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import type { AdminImageValidationCharacterRegenerationAnalytics } from '@/admin/api/admin';
import { theme } from '@/theme';

const VIEWBOX_WIDTH = 760;
const VIEWBOX_HEIGHT = 320;
const PLOT_LEFT = 58;
const PLOT_RIGHT = 24;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 50;
const PLOT_WIDTH = VIEWBOX_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - PLOT_TOP - PLOT_BOTTOM;

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatCorrelation(value: number | null): string {
  if (value == null) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}

function correlationDescription(value: number | null): string {
  if (value == null) return 'Not enough variation to calculate correlation.';
  const strength =
    Math.abs(value) < 0.2
      ? 'No clear'
      : Math.abs(value) < 0.4
        ? 'Weak'
        : Math.abs(value) < 0.6
          ? 'Moderate'
          : 'Strong';
  if (Math.abs(value) < 0.2) return `${strength} correlation.`;
  return `${strength} ${value > 0 ? 'positive' : 'negative'} correlation.`;
}

function yTicks(maxY: number): number[] {
  if (maxY <= 6) {
    return Array.from({ length: maxY + 1 }, (_, index) => index);
  }
  return Array.from(
    new Set([0, Math.round(maxY * 0.25), Math.round(maxY * 0.5), Math.round(maxY * 0.75), maxY])
  ).sort((left, right) => left - right);
}

export function AdminCharacterRegenerationChart({
  data,
}: {
  data: AdminImageValidationCharacterRegenerationAnalytics;
}) {
  const maxCharacterCount = Math.max(...data.buckets.map((bucket) => bucket.characterCount), 1);
  const maxRegenerations = Math.max(
    ...data.distribution.map((point) => point.regenerations),
    ...data.buckets.map((bucket) => Math.ceil(bucket.averageRegenerations)),
    1
  );
  const x = (characterCount: number) =>
    PLOT_LEFT + (characterCount / maxCharacterCount) * PLOT_WIDTH;
  const y = (regenerations: number) =>
    PLOT_TOP + PLOT_HEIGHT - (regenerations / maxRegenerations) * PLOT_HEIGHT;
  const averagePath = data.buckets
    .map(
      (bucket, index) =>
        `${index === 0 ? 'M' : 'L'} ${x(bucket.characterCount)} ${y(bucket.averageRegenerations)}`
    )
    .join(' ');

  return (
    <View style={styles.card} testID="character-regeneration-correlation">
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Characters vs image regenerations</Text>
          <Text style={styles.subtitle}>
            Each sample is one scene or comic-panel image target. Duplicate validation rows for the
            same attempt count as one generated image.
          </Text>
        </View>
        <View style={styles.correlationBadge}>
          <Text style={styles.correlationValue}>
            r = {formatCorrelation(data.totals.pearsonCorrelation)}
          </Text>
          <Text style={styles.correlationLabel}>
            {correlationDescription(data.totals.pearsonCorrelation)}
          </Text>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{data.totals.imageTargets}</Text>
          <Text style={styles.summaryLabel}>Image targets</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{data.totals.totalGenerations}</Text>
          <Text style={styles.summaryLabel}>Generated images</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{data.totals.totalRegenerations}</Text>
          <Text style={styles.summaryLabel}>Regenerations</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{formatPercent(data.totals.retryRate)}</Text>
          <Text style={styles.summaryLabel}>Image targets retried</Text>
        </View>
      </View>

      {data.distribution.length > 0 ? (
        <>
          <View style={styles.chartWrap} testID="character-regeneration-scatter-chart">
            <Svg
              width="100%"
              height={VIEWBOX_HEIGHT}
              viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            >
              {yTicks(maxRegenerations).map((tick) => (
                <React.Fragment key={`y-${tick}`}>
                  <Line
                    x1={PLOT_LEFT}
                    x2={VIEWBOX_WIDTH - PLOT_RIGHT}
                    y1={y(tick)}
                    y2={y(tick)}
                    stroke={theme.colors.border.light}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={PLOT_LEFT - 12}
                    y={y(tick) + 4}
                    textAnchor="end"
                    fontSize={11}
                    fill={theme.colors.text.tertiary}
                  >
                    {tick}
                  </SvgText>
                </React.Fragment>
              ))}
              <Line
                x1={PLOT_LEFT}
                x2={PLOT_LEFT}
                y1={PLOT_TOP}
                y2={PLOT_TOP + PLOT_HEIGHT}
                stroke={theme.colors.text.tertiary}
                strokeWidth={1}
              />
              <Line
                x1={PLOT_LEFT}
                x2={VIEWBOX_WIDTH - PLOT_RIGHT}
                y1={PLOT_TOP + PLOT_HEIGHT}
                y2={PLOT_TOP + PLOT_HEIGHT}
                stroke={theme.colors.text.tertiary}
                strokeWidth={1}
              />
              {data.buckets.map((bucket) => (
                <React.Fragment key={`x-${bucket.characterCount}`}>
                  <Line
                    x1={x(bucket.characterCount)}
                    x2={x(bucket.characterCount)}
                    y1={PLOT_TOP + PLOT_HEIGHT}
                    y2={PLOT_TOP + PLOT_HEIGHT + 5}
                    stroke={theme.colors.text.tertiary}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={x(bucket.characterCount)}
                    y={PLOT_TOP + PLOT_HEIGHT + 21}
                    textAnchor="middle"
                    fontSize={11}
                    fill={theme.colors.text.secondary}
                  >
                    {bucket.characterCount}
                  </SvgText>
                </React.Fragment>
              ))}
              {data.distribution.map((point) => (
                <Circle
                  key={`${point.characterCount}-${point.regenerations}`}
                  cx={x(point.characterCount)}
                  cy={y(point.regenerations)}
                  r={Math.min(14, 5 + Math.sqrt(point.imageTargets) * 2)}
                  fill="rgba(37, 99, 235, 0.38)"
                  stroke="#2563eb"
                  strokeWidth={2}
                />
              ))}
              {averagePath ? (
                <Path
                  d={averagePath}
                  fill="none"
                  stroke={theme.colors.interactive.primary}
                  strokeWidth={3}
                />
              ) : null}
              {data.buckets.map((bucket) => (
                <Circle
                  key={`avg-${bucket.characterCount}`}
                  cx={x(bucket.characterCount)}
                  cy={y(bucket.averageRegenerations)}
                  r={4}
                  fill={theme.colors.interactive.primary}
                />
              ))}
              <SvgText
                x={PLOT_LEFT + PLOT_WIDTH / 2}
                y={VIEWBOX_HEIGHT - 8}
                textAnchor="middle"
                fontSize={12}
                fontWeight="600"
                fill={theme.colors.text.secondary}
              >
                Characters in visual scene
              </SvgText>
              <SvgText
                x={14}
                y={PLOT_TOP + PLOT_HEIGHT / 2}
                textAnchor="middle"
                fontSize={12}
                fontWeight="600"
                fill={theme.colors.text.secondary}
                transform={`rotate(-90 14 ${PLOT_TOP + PLOT_HEIGHT / 2})`}
              >
                Regenerations
              </SvgText>
            </Svg>
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={styles.legendBubble} />
              <Text style={styles.legendText}>Image targets (bubble size = sample count)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendLine} />
              <Text style={styles.legendText}>Average regenerations</Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={styles.emptyText}>No image validation data with character counts yet.</Text>
      )}

      {data.buckets.length > 0 ? (
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>Characters</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>Images</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>Avg retries</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>Retry rate</Text>
          </View>
          {data.buckets.map((bucket) => (
            <View key={`bucket-${bucket.characterCount}`} style={styles.tableRow}>
              <Text style={styles.tableCell}>{bucket.characterCount}</Text>
              <Text style={styles.tableCell}>{bucket.imageTargets}</Text>
              <Text style={styles.tableCell}>{bucket.averageRegenerations.toFixed(2)}</Text>
              <Text style={styles.tableCell}>{formatPercent(bucket.retryRate)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {data.totals.excludedImageTargets > 0 ? (
        <Text style={styles.footnote}>
          Excluded {data.totals.excludedImageTargets} image target(s) without a stored expected
          character count.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 18,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  titleBlock: {
    flex: 1,
    minWidth: 280,
    gap: 4,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.text.secondary,
  },
  correlationBadge: {
    minWidth: 190,
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.background.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  correlationValue: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.interactive.primary,
  },
  correlationLabel: {
    fontSize: 11,
    color: theme.colors.text.secondary,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    minWidth: 130,
    flexGrow: 1,
    gap: 2,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.background.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text.primary,
  },
  summaryLabel: {
    fontSize: 11,
    color: theme.colors.text.secondary,
  },
  chartWrap: {
    width: '100%',
    minWidth: 0,
    borderRadius: 12,
    backgroundColor: theme.colors.background.primary,
    overflow: 'hidden',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  legendBubble: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#2563eb',
    backgroundColor: 'rgba(37, 99, 235, 0.38)',
  },
  legendLine: {
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.interactive.primary,
  },
  legendText: {
    fontSize: 11,
    color: theme.colors.text.secondary,
  },
  emptyText: {
    paddingVertical: 28,
    textAlign: 'center',
    color: theme.colors.text.secondary,
  },
  table: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
  },
  tableHeader: {
    borderTopWidth: 0,
    backgroundColor: theme.colors.background.secondary,
  },
  tableCell: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 12,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  tableHeaderText: {
    fontWeight: '700',
    color: theme.colors.text.secondary,
  },
  footnote: {
    fontSize: 11,
    color: theme.colors.text.tertiary,
  },
});
