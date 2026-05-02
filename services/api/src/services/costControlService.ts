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

export function classifyQueueStatus(totalQueued: number, queueDepthWarn: number): CostControlStatus {
  if (totalQueued >= queueDepthWarn * 2) {
    return 'critical';
  }

  if (totalQueued >= queueDepthWarn) {
    return 'warning';
  }

  return 'healthy';
}
