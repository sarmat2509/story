import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import type { SubscriptionUsageData } from '@/api/plans';

type UsageBucket = SubscriptionUsageData['stories'];

interface UsageSummaryCardProps {
  usage?: SubscriptionUsageData;
  isLoading?: boolean;
  periodEndFormatted?: string | null;
  hidePeriodEnd?: boolean;
  variant?: 'card' | 'embedded';
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function UsageRow({ label, bucket }: { label: string; bucket: UsageBucket }) {
  const { t } = useTranslation();
  const isUnlimited = bucket.limit < 0;
  const percentUsed =
    !isUnlimited && bucket.limit > 0 ? clampPercent((bucket.used / bucket.limit) * 100) : 0;

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>
          {isUnlimited
            ? t('usage_summary.unlimited', { defaultValue: 'Unlimited' })
            : t('usage_summary.remaining_of_limit', {
                remaining: bucket.remaining,
                limit: bucket.limit,
                defaultValue: '{{remaining}} of {{limit}} left',
              })}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percentUsed}%` }]} />
      </View>
    </View>
  );
}

export function UsageSummaryCard({
  usage,
  isLoading = false,
  periodEndFormatted,
  hidePeriodEnd = false,
  variant = 'card',
}: UsageSummaryCardProps) {
  const { t } = useTranslation();

  if (!usage && !isLoading) return null;

  const containerStyle = variant === 'embedded' ? styles.embedded : styles.card;

  return (
    <View style={containerStyle}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="speedometer-outline" size={18} color={theme.colors.interactive.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {t('usage_summary.title', { defaultValue: 'Usage this period' })}
          </Text>
          {!hidePeriodEnd ? (
            <Text style={styles.subtitle}>
              {periodEndFormatted
                ? t('usage_summary.resets_on', {
                    date: periodEndFormatted,
                    defaultValue: 'Resets on {{date}}',
                  })
                : t('usage_summary.resets_unknown', {
                    defaultValue: 'Current billing period',
                  })}
            </Text>
          ) : null}
        </View>
      </View>

      {isLoading && !usage ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : usage ? (
        <View style={styles.rows}>
          <UsageRow
            label={t('usage_summary.stories', { defaultValue: 'Stories' })}
            bucket={usage.stories}
          />
          {usage.graphicNovels && (!usage.storyMix || usage.graphicNovels.limit > 0 || usage.graphicNovels.used > 0) ? (
            <UsageRow
              label={t('usage_summary.graphic_novels', { defaultValue: 'Comics' })}
              bucket={usage.graphicNovels}
            />
          ) : null}
          {usage.mixedStories && (!usage.storyMix || usage.mixedStories.limit > 0 || usage.mixedStories.used > 0) ? (
            <UsageRow
              label={t('usage_summary.mixed_stories_in_story_limit', {
                defaultValue: 'Comic-to-text stories',
              })}
              bucket={usage.mixedStories}
            />
          ) : null}
          <UsageRow
            label={t('usage_summary.audio', { defaultValue: 'Audio stories' })}
            bucket={usage.audio}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
  },
  embedded: {
    paddingTop: theme.spacing[3],
    marginBottom: theme.spacing[5],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.borders.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary[50],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  rows: {
    gap: theme.spacing[3],
  },
  row: {
    width: '100%',
    gap: theme.spacing[2],
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
  },
  rowValue: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  progressTrack: {
    height: 8,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.neutral[200],
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.interactive.primary,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  loadingText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
});
