import assert from 'node:assert/strict';
import {
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

console.log('costControlService tests passed');
