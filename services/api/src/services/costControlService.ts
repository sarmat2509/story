export type CostControlStatus = 'healthy' | 'warning' | 'critical';

export interface CostControlThresholds {
  storyWarnUsd: number;
  dailyWarnUsd: number;
  monthlyWarnUsd: number;
  userDailyWarnUsd: number;
  queueDepthWarn: number;
}

export interface CostControlStatusInput {
  projectedMonthlyCostUsd: number;
  dailyAverageCostUsd: number;
  highCostStoryCount: number;
  maxStoryCostUsd: number;
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
    dailyWarnUsd: positiveNumber(thresholds.dailyWarnUsd ?? 0, 25),
    monthlyWarnUsd: positiveNumber(thresholds.monthlyWarnUsd ?? 0, 500),
    userDailyWarnUsd: positiveNumber(thresholds.userDailyWarnUsd ?? 0, 15),
    queueDepthWarn: Math.max(1, Math.floor(positiveNumber(thresholds.queueDepthWarn ?? 0, 20))),
  };
}

export function classifyCostControlStatus(
  metrics: CostControlStatusInput,
  thresholds: CostControlThresholds
): CostControlStatus {
  if (
    metrics.projectedMonthlyCostUsd >= thresholds.monthlyWarnUsd ||
    metrics.topUser24hCostUsd >= thresholds.userDailyWarnUsd ||
    metrics.maxStoryCostUsd >= thresholds.storyWarnUsd * 2
  ) {
    return 'critical';
  }

  if (
    metrics.dailyAverageCostUsd >= thresholds.dailyWarnUsd ||
    metrics.highCostStoryCount > 0 ||
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

  if (metrics.maxStoryCostUsd >= thresholds.storyWarnUsd * 2) {
    alerts.push({
      key: 'max-story-cost-critical',
      severity: 'critical',
      title: 'A story cost is more than 2x the per-story guardrail',
      detail: `Highest story cost is $${metrics.maxStoryCostUsd.toFixed(2)} against a $${thresholds.storyWarnUsd.toFixed(2)} warning threshold.`,
      action: 'Review the expensive story path, retries, image count, and provider usage before promoting the current plan mix.',
      reviewUrl: '/admin/stories',
      metricValue: metrics.maxStoryCostUsd,
      thresholdValue: thresholds.storyWarnUsd,
    });
  } else if (metrics.highCostStoryCount > 0 || metrics.maxStoryCostUsd >= thresholds.storyWarnUsd) {
    alerts.push({
      key: 'high-cost-stories',
      severity: 'warning',
      title: 'High-cost stories were detected',
      detail: `${metrics.highCostStoryCount} stories exceeded the $${thresholds.storyWarnUsd.toFixed(2)} per-story guardrail.`,
      action: 'Review story/image retry patterns and update generation settings if the pattern repeats.',
      reviewUrl: '/admin/stories',
      metricValue: metrics.highCostStoryCount,
      thresholdValue: 1,
    });
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
