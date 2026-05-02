import React, { useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  useAdminDashboard,
  type AdminDashboardBreakdownItem,
  type AdminDashboardDailyPoint,
  type AdminDashboardImageBucket,
  type AdminDashboardOperationBreakdown,
  type AdminDashboardQualityReview,
  type AdminDashboardStatus,
} from '@/admin/api/admin';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';

const RANGE_OPTIONS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 365, label: '365d' },
  { days: 0, label: 'All' },
] as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(valueMs: number) {
  if (!valueMs || valueMs <= 0) return '0m';
  const totalMinutes = valueMs / 60000;
  if (totalMinutes >= 60) {
    return `${(totalMinutes / 60).toFixed(1)}h`;
  }
  return `${totalMinutes.toFixed(1)}m`;
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatShortId(value: string | null) {
  if (!value) return 'None';
  return `${value.slice(0, 8)}...`;
}

function statusLabel(status: AdminDashboardStatus) {
  if (status === 'critical') return 'Critical';
  if (status === 'warning') return 'Warning';
  return 'Healthy';
}

function statusTone(status: AdminDashboardStatus): 'success' | 'warning' | 'critical' {
  if (status === 'critical') return 'critical';
  if (status === 'warning') return 'warning';
  return 'success';
}

function formatBucketLabel(bucket: string) {
  if (bucket === '0') return 'No images';
  if (bucket === '1') return '1 image';
  if (bucket === '5+') return '5+ images';
  return `${bucket} images`;
}

function prettifyOperation(operation: string) {
  return operation
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function prettifyBreakdownValue(value: string) {
  if (!value || value === 'unknown') return 'Unknown';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function prettifyPriority(priority: string) {
  return priority
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function MetricCard({
  label,
  value,
  helper,
  tone = 'default',
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: 'default' | 'success' | 'warning' | 'critical';
}) {
  const toneStyle =
    tone === 'success'
      ? styles.metricCardSuccess
      : tone === 'warning'
        ? styles.metricCardWarning
        : tone === 'critical'
          ? styles.metricCardCritical
        : null;

  return (
    <View style={[styles.metricCard, toneStyle]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {helper ? <Text style={styles.metricHelper}>{helper}</Text> : null}
    </View>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function VerticalBarChart({
  items,
  color,
  valueFormatter,
}: {
  items: Array<{ label: string; value: number; helper?: string }>;
  color: string;
  valueFormatter: (value: number) => string;
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const chartWidth = Math.max(items.length * 64, 320);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.verticalChart, { width: chartWidth }]}>
        {items.map((item) => {
          const heightRatio = item.value > 0 ? item.value / maxValue : 0;
          return (
            <View key={item.label} style={styles.verticalChartItem}>
              <Text style={styles.chartValueLabel}>{valueFormatter(item.value)}</Text>
              <View style={styles.verticalChartTrack}>
                <View
                  style={[
                    styles.verticalChartBar,
                    {
                      backgroundColor: color,
                      height: `${Math.max(heightRatio * 100, item.value > 0 ? 8 : 0)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.chartItemLabel}>{item.label}</Text>
              {item.helper ? <Text style={styles.chartItemHelper}>{item.helper}</Text> : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function HorizontalBreakdown({
  items,
  color,
  labelFormatter,
  valueFormatter,
}: {
  items: Array<{ key: string; label: string; value: number; helper?: string }>;
  color: string;
  labelFormatter?: (label: string) => string;
  valueFormatter: (value: number) => string;
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <View style={styles.breakdownList}>
      {items.map((item) => {
        const widthRatio = item.value > 0 ? item.value / maxValue : 0;
        return (
          <View key={item.key} style={styles.breakdownRow}>
            <View style={styles.breakdownTopRow}>
              <Text style={styles.breakdownLabel}>{labelFormatter ? labelFormatter(item.label) : item.label}</Text>
              <Text style={styles.breakdownValue}>{valueFormatter(item.value)}</Text>
            </View>
            <View style={styles.breakdownTrack}>
              <View
                style={[
                  styles.breakdownBar,
                  {
                    backgroundColor: color,
                    width: `${Math.max(widthRatio * 100, item.value > 0 ? 6 : 0)}%`,
                  },
                ]}
              />
            </View>
            {item.helper ? <Text style={styles.breakdownHelper}>{item.helper}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function BreakdownList({
  title,
  items,
}: {
  title: string;
  items: AdminDashboardBreakdownItem[];
}) {
  return (
    <SectionCard title={title}>
      <HorizontalBreakdown
        items={items.map((item) => ({
          key: item.value,
          label: item.value,
          value: item.storyCount,
          helper: `${formatPercent(item.share)} of stories • ${formatUsd(item.avgCostUsd)} avg`,
        }))}
        color={theme.colors.primary[500]}
        labelFormatter={prettifyBreakdownValue}
        valueFormatter={formatNumber}
      />
    </SectionCard>
  );
}

function buildRetryBars(totalStories: number, anyRetryStories: number, requestRetryStories: number, imageRetryStories: number, bothRetryStories: number) {
  const requestOnly = Math.max(requestRetryStories - bothRetryStories, 0);
  const imageOnly = Math.max(imageRetryStories - bothRetryStories, 0);
  const noRetry = Math.max(totalStories - anyRetryStories, 0);

  return [
    { key: 'no-retry', label: 'No retries', value: noRetry, helper: 'Stories completed cleanly' },
    { key: 'request-only', label: 'Request retries', value: requestOnly, helper: 'Pipeline/request reruns only' },
    { key: 'image-only', label: 'Image retries', value: imageOnly, helper: 'Extra image validation attempts only' },
    { key: 'both', label: 'Both retry types', value: bothRetryStories, helper: 'Request and image retries in one story' },
  ];
}

function buildDailyStoryBars(items: AdminDashboardDailyPoint[]) {
  return items.map((item) => ({
    label: formatDateLabel(item.date),
    value: item.storyCount,
    helper: item.retryStoryCount > 0 ? `${item.retryStoryCount} retry` : undefined,
  }));
}

function buildDailyCostBars(items: AdminDashboardDailyPoint[]) {
  return items.map((item) => ({
    label: formatDateLabel(item.date),
    value: item.totalCostUsd,
    helper: `${item.storyCount} stories`,
  }));
}

function buildImageBucketBars(items: AdminDashboardImageBucket[]) {
  return items.map((item) => ({
    label: formatBucketLabel(item.bucket),
    value: item.avgCostUsd,
    helper: `${formatNumber(item.storyCount)} stories • ${formatDuration(item.avgGenerationTimeMs)}`,
  }));
}

function buildOperationBars(items: AdminDashboardOperationBreakdown[]) {
  return items.map((item) => ({
    key: item.operation,
    label: item.operation,
    value: item.totalCostUsd,
    helper: `${formatNumber(item.storyCount)} stories • ${formatNumber(item.eventCount)} calls`,
  }));
}

function buildQueueBars(queues: Array<{ name: string; queued: number; processing: number; failed: number; maxConcurrency: number }>) {
  return queues.map((item) => ({
    key: item.name,
    label: item.name,
    value: item.queued,
    helper: `${formatNumber(item.processing)} active • ${formatNumber(item.failed)} failed • ${formatNumber(item.maxConcurrency)} concurrency`,
  }));
}

function buildQualityReviewBars(review: AdminDashboardQualityReview) {
  return review.queues.map((item) => ({
    key: item.key,
    label: item.label,
    value: item.count,
    helper: `${prettifyPriority(item.priority)} • ${item.helper}`,
  }));
}

export default function AdminDashboardScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, error } = useAdminDashboard(days);

  const overview = data?.overview;
  const retryBars = overview
    ? buildRetryBars(
        overview.totalStories,
        overview.anyRetryStories,
        overview.requestRetryStories,
        overview.imageRetryStories,
        overview.bothRetryStories,
      )
    : [];

  return (
    <AdminLayout navigation={navigation} activeRoute="AdminDashboard" title="Admin / Dashboard">
      <View style={styles.hero}>
        <View style={styles.heroTextWrap}>
          <Text style={styles.heroTitle}>Story production dashboard</Text>
          <Text style={styles.heroSubtitle}>
            Volume, себестоимость, retries и качество генерации в одном месте. Метрики считаются по историям, request'ам и image validation run'ам.
          </Text>
        </View>

        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((option) => {
            const isActive = option.days === days;
            return (
              <TouchableOpacity
                key={option.label}
                style={[styles.rangeChip, isActive && styles.rangeChipActive]}
                onPress={() => setDays(option.days)}
              >
                <Text style={[styles.rangeChipText, isActive && styles.rangeChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {isLoading ? <AdminLoadingState /> : null}
      {error ? <AdminErrorState message={(error as Error).message} /> : null}

      {!isLoading && !error && data && overview ? (
        <View style={styles.pageContent}>
          <View style={styles.metricGrid}>
            <MetricCard
              label="Stories"
              value={formatNumber(overview.totalStories)}
              helper={`${days === 0 ? 'all time' : `last ${days} days`} • ${formatUsd(overview.totalCostUsd)} total AI cost`}
            />
            <MetricCard
              label="Avg story cost"
              value={formatUsd(overview.avgCostUsd)}
              helper={`${overview.avgImageSceneCount.toFixed(1)} images/story • ${overview.avgSceneCount.toFixed(1)} scenes/story`}
            />
            <MetricCard
              label="Request success"
              value={formatPercent(overview.requestSuccessRate)}
              helper={`${formatNumber(overview.successfulRequests)} successful of ${formatNumber(overview.totalRequests)} requests`}
              tone={overview.requestSuccessRate >= 0.9 ? 'success' : 'warning'}
            />
            <MetricCard
              label="Stories with retries"
              value={formatPercent(overview.totalStories > 0 ? overview.anyRetryStories / overview.totalStories : 0)}
              helper={`${formatNumber(overview.anyRetryStories)} stories • ${formatNumber(overview.extraImageAttempts)} extra image attempts`}
              tone={overview.anyRetryStories === 0 ? 'success' : 'warning'}
            />
            <MetricCard
              label="First-pass image validation"
              value={formatPercent(overview.firstPassImageRate)}
              helper={`${overview.avgValidationAttempts.toFixed(2)} avg attempts per validated scene`}
              tone={overview.firstPassImageRate >= 0.8 ? 'success' : 'warning'}
            />
            <MetricCard
              label="Avg generation time"
              value={formatDuration(overview.avgGenerationTimeMs)}
              helper={`${formatCompactNumber(overview.avgWordCount)} words/story • ${formatPercent(overview.audioAttachRate)} with audio`}
            />
            <MetricCard
              label="Cost guardrail"
              value={statusLabel(data.costControls.status)}
              helper={`${formatUsd(data.costControls.projectedMonthlyCostUsd)} projected monthly • ${formatNumber(data.costControls.highCostStoryCount)} high-cost stories`}
              tone={statusTone(data.costControls.status)}
            />
            <MetricCard
              label="Queue backlog"
              value={formatNumber(data.queueHealth.totalQueued)}
              helper={`${formatNumber(data.queueHealth.totalProcessing)} active • warn at ${formatNumber(data.queueHealth.thresholdQueued)} queued`}
              tone={statusTone(data.queueHealth.status)}
            />
            <MetricCard
              label="Quality review"
              value={statusLabel(data.qualityReview.status)}
              helper={`${formatNumber(data.qualityReview.unsafeReportCount)} unsafe reports • ${formatPercent(data.qualityReview.imageRetryStoryRate)} image-retry stories`}
              tone={statusTone(data.qualityReview.status)}
            />
          </View>

          <View style={styles.sectionGrid}>
            <SectionCard
              title="Cost guardrails"
              subtitle={`Story warn ${formatUsd(data.costControls.thresholds.storyWarnUsd)} • daily warn ${formatUsd(data.costControls.thresholds.dailyWarnUsd)} • monthly warn ${formatUsd(data.costControls.thresholds.monthlyWarnUsd)}`}
            >
              <View style={styles.highlightList}>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Daily average spend</Text>
                  <Text style={styles.highlightValue}>{formatUsd(data.costControls.dailyAverageCostUsd)}</Text>
                </View>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Projected monthly spend</Text>
                  <Text style={styles.highlightValue}>{formatUsd(data.costControls.projectedMonthlyCostUsd)}</Text>
                </View>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Max story cost</Text>
                  <Text style={styles.highlightValue}>{formatUsd(data.costControls.maxStoryCostUsd)}</Text>
                </View>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Unpriced AI events</Text>
                  <Text style={styles.highlightValue}>{formatNumber(data.costControls.unpricedEventCount)}</Text>
                </View>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Top user cost, 24h</Text>
                  <Text style={styles.highlightValue}>
                    {formatUsd(data.costControls.topUser24hCostUsd)} • {formatShortId(data.costControls.topUser24hUserId)}
                  </Text>
                </View>
              </View>
            </SectionCard>

            <SectionCard
              title="Queue depth"
              subtitle="Live in-memory text, image, audio, and legacy queue pressure"
            >
              <HorizontalBreakdown
                items={buildQueueBars(data.queueHealth.queues)}
                color={theme.colors.warning[500]}
                labelFormatter={prettifyBreakdownValue}
                valueFormatter={formatNumber}
              />
            </SectionCard>
          </View>

          <View style={styles.sectionGrid}>
            <SectionCard
              title="Quality & safety review loop"
              subtitle={`Weekly queue • failed request warn ${formatPercent(data.qualityReview.thresholds.failedRequestRateWarn)} • image retry warn ${formatPercent(data.qualityReview.thresholds.imageRetryRateWarn)}`}
            >
              <HorizontalBreakdown
                items={buildQualityReviewBars(data.qualityReview)}
                color={theme.colors.error[500]}
                labelFormatter={prettifyBreakdownValue}
                valueFormatter={formatNumber}
              />
              <View style={styles.inlineMetricRow}>
                <View style={styles.inlineMetric}>
                  <Text style={styles.inlineMetricLabel}>Failed request rate</Text>
                  <Text style={styles.inlineMetricValue}>{formatPercent(data.qualityReview.failedRequestRate)}</Text>
                </View>
                <View style={styles.inlineMetric}>
                  <Text style={styles.inlineMetricLabel}>Moderation failures</Text>
                  <Text style={styles.inlineMetricValue}>{formatNumber(data.qualityReview.moderationFailureCount)}</Text>
                </View>
                <View style={styles.inlineMetric}>
                  <Text style={styles.inlineMetricLabel}>Sample candidates</Text>
                  <Text style={styles.inlineMetricValue}>{formatNumber(data.qualityReview.sampleCandidateCount)}</Text>
                </View>
              </View>
            </SectionCard>

            <SectionCard
              title="Quality review cadence"
              subtitle="Operator checklist for active beta traffic"
            >
              <View style={styles.highlightList}>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Unsafe reports</Text>
                  <Text style={styles.highlightValue}>{formatNumber(data.qualityReview.unsafeReportCount)}</Text>
                </View>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Generation reports</Text>
                  <Text style={styles.highlightValue}>{formatNumber(data.qualityReview.generationFailureReportCount)}</Text>
                </View>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Public story reports</Text>
                  <Text style={styles.highlightValue}>{formatNumber(data.qualityReview.publicStoryReportCount)}</Text>
                </View>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Image retry rate</Text>
                  <Text style={styles.highlightValue}>{formatPercent(data.qualityReview.imageRetryStoryRate)}</Text>
                </View>
              </View>
            </SectionCard>
          </View>

          <View style={styles.sectionGrid}>
            <SectionCard
              title="Stories per day"
              subtitle="Daily story output for the selected period"
            >
              <VerticalBarChart
                items={buildDailyStoryBars(data.daily)}
                color={theme.colors.primary[500]}
                valueFormatter={formatNumber}
              />
            </SectionCard>

            <SectionCard
              title="AI cost per day"
              subtitle="Daily spend across all AI operations linked to those stories"
            >
              <VerticalBarChart
                items={buildDailyCostBars(data.daily)}
                color={theme.colors.warning[500]}
                valueFormatter={formatUsd}
              />
            </SectionCard>
          </View>

          <View style={styles.sectionGrid}>
            <SectionCard
              title="Price by image count"
              subtitle="Average story cost grouped by how many scenes received completed images"
            >
              <VerticalBarChart
                items={buildImageBucketBars(data.costByImageCount)}
                color={theme.colors.success[500]}
                valueFormatter={formatUsd}
              />
            </SectionCard>

            <SectionCard
              title="Retries and validation quality"
              subtitle="Split of stories that needed extra generation work"
            >
              <HorizontalBreakdown
                items={retryBars}
                color={theme.colors.error[500]}
                valueFormatter={formatNumber}
              />
              <View style={styles.inlineMetricRow}>
                <View style={styles.inlineMetric}>
                  <Text style={styles.inlineMetricLabel}>Request retries</Text>
                  <Text style={styles.inlineMetricValue}>{formatNumber(overview.requestRetryStories)}</Text>
                </View>
                <View style={styles.inlineMetric}>
                  <Text style={styles.inlineMetricLabel}>Image retries</Text>
                  <Text style={styles.inlineMetricValue}>{formatNumber(overview.imageRetryStories)}</Text>
                </View>
                <View style={styles.inlineMetric}>
                  <Text style={styles.inlineMetricLabel}>Both retry types</Text>
                  <Text style={styles.inlineMetricValue}>{formatNumber(overview.bothRetryStories)}</Text>
                </View>
              </View>
            </SectionCard>
          </View>

          <View style={styles.sectionGrid}>
            <SectionCard
              title="Cost structure by operation"
              subtitle="Where AI spend goes: image generation, validation, text, audio and auxiliary ops"
            >
              <HorizontalBreakdown
                items={buildOperationBars(data.costByOperation)}
                color={theme.colors.primary[700]}
                labelFormatter={prettifyOperation}
                valueFormatter={formatUsd}
              />
            </SectionCard>

            <SectionCard
              title="Operational highlights"
              subtitle="Fast health summary for the selected period"
            >
              <View style={styles.highlightList}>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Failed requests</Text>
                  <Text style={styles.highlightValue}>{formatNumber(overview.failedRequests)}</Text>
                </View>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Stories with audio</Text>
                  <Text style={styles.highlightValue}>{formatNumber(overview.audioStoryCount)}</Text>
                </View>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Avg words/story</Text>
                  <Text style={styles.highlightValue}>{formatCompactNumber(overview.avgWordCount)}</Text>
                </View>
                <View style={styles.highlightItem}>
                  <Text style={styles.highlightLabel}>Avg scenes/story</Text>
                  <Text style={styles.highlightValue}>{overview.avgSceneCount.toFixed(1)}</Text>
                </View>
              </View>
            </SectionCard>
          </View>

          <View style={styles.sectionGrid}>
            <BreakdownList title="Top story languages" items={data.languages} />
            <BreakdownList title="Top image styles" items={data.imageStyles} />
          </View>
        </View>
      ) : null}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 16,
  },
  heroTextWrap: {
    gap: 6,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text.secondary,
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.secondary,
  },
  rangeChipActive: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  rangeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  rangeChipTextActive: {
    color: theme.colors.text.inverse,
  },
  pageContent: {
    gap: 20,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flexBasis: 220,
    flexGrow: 1,
    minWidth: 220,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    padding: 16,
    gap: 8,
  },
  metricCardSuccess: {
    borderColor: theme.colors.success[500],
  },
  metricCardWarning: {
    borderColor: theme.colors.warning[500],
  },
  metricCardCritical: {
    borderColor: theme.colors.error[500],
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: theme.colors.text.tertiary,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text.primary,
  },
  metricHelper: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text.secondary,
  },
  sectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  sectionCard: {
    flexBasis: 420,
    flexGrow: 1,
    minWidth: 320,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    padding: 18,
    gap: 16,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text.secondary,
  },
  verticalChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  verticalChartItem: {
    width: 52,
    gap: 8,
    alignItems: 'center',
  },
  verticalChartTrack: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.background.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    overflow: 'hidden',
  },
  verticalChartBar: {
    width: '100%',
    borderRadius: 14,
    minHeight: 0,
  },
  chartValueLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  chartItemLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  chartItemHelper: {
    fontSize: 10,
    lineHeight: 14,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
  breakdownList: {
    gap: 14,
  },
  breakdownRow: {
    gap: 6,
  },
  breakdownTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'center',
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  breakdownTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.background.primary,
    overflow: 'hidden',
  },
  breakdownBar: {
    height: '100%',
    borderRadius: 999,
  },
  breakdownHelper: {
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.text.secondary,
  },
  inlineMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  inlineMetric: {
    flexBasis: 120,
    flexGrow: 1,
    backgroundColor: theme.colors.background.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    padding: 12,
    gap: 4,
  },
  inlineMetricLabel: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  inlineMetricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  highlightList: {
    gap: 10,
  },
  highlightItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.light,
  },
  highlightLabel: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  highlightValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
});
