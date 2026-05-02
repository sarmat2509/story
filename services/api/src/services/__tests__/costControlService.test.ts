import assert from 'node:assert/strict';
import {
  buildCostControlAlerts,
  classifyCostControlStatus,
  classifyQueueStatus,
  normalizeCostControlThresholds,
} from '../costControlService';

const thresholds = normalizeCostControlThresholds({
  storyWarnUsd: 1,
  dailyWarnUsd: 10,
  monthlyWarnUsd: 100,
  userDailyWarnUsd: 20,
  queueDepthWarn: 5,
});

assert.equal(
  classifyCostControlStatus(
    {
      projectedMonthlyCostUsd: 20,
      dailyAverageCostUsd: 1,
      highCostStoryCount: 0,
      maxStoryCostUsd: 0.5,
      unpricedEventCount: 0,
      topUser24hCostUsd: 0,
    },
    thresholds
  ),
  'healthy'
);

assert.equal(
  classifyCostControlStatus(
    {
      projectedMonthlyCostUsd: 20,
      dailyAverageCostUsd: 11,
      highCostStoryCount: 0,
      maxStoryCostUsd: 0.5,
      unpricedEventCount: 0,
      topUser24hCostUsd: 0,
    },
    thresholds
  ),
  'warning'
);

assert.equal(
  classifyCostControlStatus(
    {
      projectedMonthlyCostUsd: 101,
      dailyAverageCostUsd: 1,
      highCostStoryCount: 0,
      maxStoryCostUsd: 0.5,
      unpricedEventCount: 0,
      topUser24hCostUsd: 0,
    },
    thresholds
  ),
  'critical'
);

assert.equal(classifyQueueStatus(4, thresholds.queueDepthWarn), 'healthy');
assert.equal(classifyQueueStatus(5, thresholds.queueDepthWarn), 'warning');
assert.equal(classifyQueueStatus(10, thresholds.queueDepthWarn), 'critical');

{
  const alerts = buildCostControlAlerts(
    {
      projectedMonthlyCostUsd: 120,
      dailyAverageCostUsd: 12,
      highCostStoryCount: 2,
      maxStoryCostUsd: 2.5,
      unpricedEventCount: 3,
      topUser24hCostUsd: 21,
    },
    thresholds,
    { topUser24hUserId: 'user-123' }
  );

  assert.deepEqual(
    alerts.map((alert) => [alert.key, alert.severity, alert.reviewUrl]),
    [
      ['projected-monthly-spend', 'critical', '/admin/dashboard'],
      ['daily-average-spend', 'warning', '/admin/dashboard'],
      ['top-user-daily-spend-critical', 'critical', '/admin/users'],
      ['max-story-cost-critical', 'critical', '/admin/stories'],
      ['unpriced-ai-events', 'warning', '/admin/dashboard'],
    ]
  );
  assert.match(alerts[2].action, /user-123/);
}

{
  const alerts = buildCostControlAlerts(
    {
      projectedMonthlyCostUsd: 20,
      dailyAverageCostUsd: 1,
      highCostStoryCount: 0,
      maxStoryCostUsd: 0.5,
      unpricedEventCount: 0,
      topUser24hCostUsd: 0,
    },
    thresholds
  );

  assert.equal(alerts.length, 0);
}

console.log('costControlService tests passed');
