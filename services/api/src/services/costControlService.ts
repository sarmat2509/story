export type CostControlStatus = 'healthy' | 'warning' | 'critical';
export type StoryCostFormat = 'story' | 'graphic_novel' | 'mixed_story';

export interface CostControlThresholds {
  storyWarnUsd: number;
  graphicNovelWarnUsd: number;
  mixedStoryWarnUsd: number;
  dailyWarnUsd: number;
  monthlyWarnUsd: number;
  userDailyWarnUsd: number;
  queueDepthWarn: number;
}

export interface StoryCostControlMetric {
  format: StoryCostFormat;
  storyCount: number;
  avgCostUsd: number;
  highCostStoryCount: number;
  maxStoryCostUsd: number;
}

export interface CostControlStatusInput {
  projectedMonthlyCostUsd: number;
  dailyAverageCostUsd: number;
  storyCostsByFormat: StoryCostControlMetric[];
  unpricedEventCount: number;
  topUser24hCostUsd: number;
}

export interface CostControlAlert {
  key: string;
  severity: Exclude<CostControlStatus, 'healthy'>;
  title: string;
  detail: string;
  action: string;
  reviewUrl: string;
  metricValue: number;
  thresholdValue: number;
}

function positiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function normalizeCostControlThresholds(
  thresholds: Partial<CostControlThresholds>
): CostControlThresholds {
  return {
    storyWarnUsd: positiveNumber(thresholds.storyWarnUsd ?? 0, 1.25),
    graphicNovelWarnUsd: positiveNumber(thresholds.graphicNovelWarnUsd ?? 0, 2.75),
    mixedStoryWarnUsd: positiveNumber(thresholds.mixedStoryWarnUsd ?? 0, 1.1),
    dailyWarnUsd: positiveNumber(thresholds.dailyWarnUsd ?? 0, 25),
    monthlyWarnUsd: positiveNumber(thresholds.monthlyWarnUsd ?? 0, 500),
    userDailyWarnUsd: positiveNumber(thresholds.userDailyWarnUsd ?? 0, 15),
    queueDepthWarn: Math.max(1, Math.floor(positiveNumber(thresholds.queueDepthWarn ?? 0, 20))),
  };
}

export function storyCostWarnThreshold(
  format: StoryCostFormat,
  thresholds: CostControlThresholds
): number {
  if (format === 'graphic_novel') return thresholds.graphicNovelWarnUsd;
  if (format === 'mixed_story') return thresholds.mixedStoryWarnUsd;
  return thresholds.storyWarnUsd;
}

function storyCostFormatLabel(format: StoryCostFormat): string {
  if (format === 'graphic_novel') return 'comic';
  if (format === 'mixed_story') return 'mixed story';
  return 'regular story';
}

export function classifyCostControlStatus(
  metrics: CostControlStatusInput,
  thresholds: CostControlThresholds
): CostControlStatus {
  if (
    metrics.projectedMonthlyCostUsd >= thresholds.monthlyWarnUsd ||
    metrics.topUser24hCostUsd >= thresholds.userDailyWarnUsd ||
    metrics.storyCostsByFormat.some(
      (metric) => metric.avgCostUsd >= storyCostWarnThreshold(metric.format, thresholds) * 2
    )
  ) {
    return 'critical';
  }

  if (
    metrics.dailyAverageCostUsd >= thresholds.dailyWarnUsd ||
    metrics.storyCostsByFormat.some(
      (metric) => metric.avgCostUsd >= storyCostWarnThreshold(metric.format, thresholds)
    ) ||
    metrics.unpricedEventCount > 0 ||
    metrics.topUser24hCostUsd >= thresholds.userDailyWarnUsd * 0.75
  ) {
    return 'warning';
  }

  return 'healthy';
}

export function buildCostControlAlerts(
  metrics: CostControlStatusInput,
  thresholds: CostControlThresholds,
  options?: { topUser24hUserId?: string | null }
): CostControlAlert[] {
  const alerts: CostControlAlert[] = [];

  if (metrics.projectedMonthlyCostUsd >= thresholds.monthlyWarnUsd) {
    alerts.push({
      key: 'projected-monthly-spend',
      severity: 'critical',
      title: 'Projected monthly spend is above the launch guardrail',
      detail: `Projected spend is $${metrics.projectedMonthlyCostUsd.toFixed(2)} against a $${thresholds.monthlyWarnUsd.toFixed(2)} warning threshold.`,
      action: 'Pause paid acquisition, review recent generation mix, and adjust plan pricing or provider limits before scaling traffic.',
      reviewUrl: '/admin/dashboard',
      metricValue: metrics.projectedMonthlyCostUsd,
      thresholdValue: thresholds.monthlyWarnUsd,
    });
  }

  if (metrics.dailyAverageCostUsd >= thresholds.dailyWarnUsd) {
    alerts.push({
      key: 'daily-average-spend',
      severity: 'warning',
      title: 'Daily average spend is above the launch guardrail',
      detail: `Daily average spend is $${metrics.dailyAverageCostUsd.toFixed(2)} against a $${thresholds.dailyWarnUsd.toFixed(2)} warning threshold.`,
      action: 'Review the last 24-48h of usage and generation failures before increasing traffic.',
      reviewUrl: '/admin/dashboard',
      metricValue: metrics.dailyAverageCostUsd,
      thresholdValue: thresholds.dailyWarnUsd,
    });
  }

  if (metrics.topUser24hCostUsd >= thresholds.userDailyWarnUsd) {
    alerts.push({
      key: 'top-user-daily-spend-critical',
      severity: 'critical',
      title: 'A single user is above the daily cost guardrail',
      detail: `Top user 24h spend is $${metrics.topUser24hCostUsd.toFixed(2)} against a $${thresholds.userDailyWarnUsd.toFixed(2)} warning threshold.`,
      action: `Review the user in admin, check abuse/support context, and consider temporary throttling. User: ${options?.topUser24hUserId || 'unknown'}.`,
      reviewUrl: '/admin/users',
      metricValue: metrics.topUser24hCostUsd,
      thresholdValue: thresholds.userDailyWarnUsd,
    });
  } else if (metrics.topUser24hCostUsd >= thresholds.userDailyWarnUsd * 0.75) {
    alerts.push({
      key: 'top-user-daily-spend-warning',
      severity: 'warning',
      title: 'A single user is approaching the daily cost guardrail',
      detail: `Top user 24h spend is $${metrics.topUser24hCostUsd.toFixed(2)} against a $${thresholds.userDailyWarnUsd.toFixed(2)} warning threshold.`,
      action: `Check whether usage is legitimate or repeated failed generation. User: ${options?.topUser24hUserId || 'unknown'}.`,
      reviewUrl: '/admin/users',
      metricValue: metrics.topUser24hCostUsd,
      thresholdValue: thresholds.userDailyWarnUsd,
    });
  }

  for (const metric of metrics.storyCostsByFormat) {
    const threshold = storyCostWarnThreshold(metric.format, thresholds);
    const label = storyCostFormatLabel(metric.format);

    if (metric.avgCostUsd >= threshold * 2) {
      alerts.push({
        key: `avg-${metric.format}-cost-critical`,
        severity: 'critical',
        title: `Average ${label} cost is more than 2x its guardrail`,
        detail: `Average ${label} cost is $${metric.avgCostUsd.toFixed(2)} across ${metric.storyCount} cost-tracked stories, against a $${threshold.toFixed(2)} warning threshold.`,
        action: 'Review the generation mix, retries, image count, and provider usage before promoting the current plan mix.',
        reviewUrl: '/admin/stories',
        metricValue: metric.avgCostUsd,
        thresholdValue: threshold,
      });
    } else if (metric.avgCostUsd >= threshold) {
      alerts.push({
        key: `high-average-${metric.format}-cost`,
        severity: 'warning',
        title: `Average ${label} cost is above its guardrail`,
        detail: `Average ${label} cost is $${metric.avgCostUsd.toFixed(2)} across ${metric.storyCount} cost-tracked stories, against a $${threshold.toFixed(2)} warning threshold.`,
        action: 'Review the generation mix and retry patterns, and update the matching format guardrail if the cost is expected.',
        reviewUrl: '/admin/stories',
        metricValue: metric.avgCostUsd,
        thresholdValue: threshold,
      });
    }
  }

  if (metrics.unpricedEventCount > 0) {
    alerts.push({
      key: 'unpriced-ai-events',
      severity: 'warning',
      title: 'AI usage events are missing prices',
      detail: `${metrics.unpricedEventCount} AI usage events do not have cost data.`,
      action: 'Update provider pricing metadata before trusting gross margin and projected spend calculations.',
      reviewUrl: '/admin/dashboard',
      metricValue: metrics.unpricedEventCount,
      thresholdValue: 1,
    });
  }

  return alerts;
}

export function classifyQueueStatus(totalQueued: number, queueDepthWarn: number): CostControlStatus {
  if (totalQueued >= queueDepthWarn * 2) {
    return 'critical';
  }

  if (totalQueued >= queueDepthWarn) {
    return 'warning';
  }

  return 'healthy';
}
