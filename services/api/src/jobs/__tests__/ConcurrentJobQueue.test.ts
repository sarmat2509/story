import assert from 'node:assert/strict';
import { ConcurrentJobQueue, type BaseJob } from '../ConcurrentJobQueue';

interface TestJob extends BaseJob {
  type: 'test';
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for queue assertion');
}

void (async function main() {
  let attempts = 0;
  let permanentFailures = 0;
  let permanentFailureRetries = 0;
  let permanentFailureError = '';

  const queue = new ConcurrentJobQueue<TestJob>({
    name: 'test-permanent-failure',
    maxConcurrency: 1,
    maxRetries: 1,
    failedRetentionMs: 1,
    completedRetentionMs: 1,
    processor: async () => {
      attempts += 1;
      throw new Error('boom');
    },
    onPermanentFailure: (job, error) => {
      permanentFailures += 1;
      permanentFailureRetries = job.retries;
      permanentFailureError = error instanceof Error ? error.message : String(error);
    },
  });

  queue.addJob({ type: 'test' });

  await waitFor(() => permanentFailures === 1);

  assert.equal(attempts, 1, 'processor runs once when maxRetries is 1');
  assert.equal(permanentFailures, 1, 'permanent failure hook runs once');
  assert.equal(permanentFailureRetries, 1, 'hook receives the failed retry count');
  assert.equal(permanentFailureError, 'boom', 'hook receives the processor error');

  console.log('ConcurrentJobQueue tests passed');
})();
