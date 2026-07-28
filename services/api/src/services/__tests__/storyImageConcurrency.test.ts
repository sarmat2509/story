import assert from 'node:assert/strict';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

type FailureMode = 'rejected_promise' | 'delayed_rejection';

class FakeAsyncImageModel {
  readonly calls: Array<{ batch: number; sceneId: number }> = [];
  readonly siblingStarted = deferred<void>();
  readonly releaseSibling = deferred<void>();
  readonly releaseDelayedFailure = deferred<void>();

  constructor(private readonly failureMode: FailureMode) {}

  async generate(batch: number, sceneId: number): Promise<{ imageId: string }> {
    this.calls.push({ batch, sceneId });

    if (batch === 1 && sceneId === 1) {
      if (this.failureMode === 'delayed_rejection') {
        await this.releaseDelayedFailure.promise;
      } else {
        await Promise.resolve();
      }
      throw new Error(`fake model request failed (${this.failureMode})`);
    }

    if (batch === 1 && sceneId === 3) {
      this.siblingStarted.resolve();
      await this.releaseSibling.promise;
    }

    return { imageId: `batch-${batch}-scene-${sceneId}` };
  }
}

async function verifyRetryDoesNotDuplicateSibling(
  runWithConcurrencyLimit: <T>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<void>
  ) => Promise<void>,
  failureMode: FailureMode
): Promise<void> {
  const model = new FakeAsyncImageModel(failureMode);
  const persistedSceneIds = new Set<number>();
  const allSceneIds = [1, 3, 5];

  const runBatch = async (batch: number) => {
    const missingSceneIds = allSceneIds.filter((sceneId) => !persistedSceneIds.has(sceneId));
    await runWithConcurrencyLimit(missingSceneIds, 2, async (sceneId) => {
      await model.generate(batch, sceneId);
      persistedSceneIds.add(sceneId);
    });
  };

  let firstBatchSettled = false;
  const firstBatch = runBatch(1);
  void firstBatch.then(
    () => {
      firstBatchSettled = true;
    },
    () => {
      firstBatchSettled = true;
    }
  );

  await model.siblingStarted.promise;
  if (failureMode === 'delayed_rejection') {
    model.releaseDelayedFailure.resolve();
  }
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    firstBatchSettled,
    false,
    `${failureMode}: batch must not reject while a sibling model request is still running`
  );
  assert.deepEqual(
    model.calls,
    [
      { batch: 1, sceneId: 1 },
      { batch: 1, sceneId: 3 },
    ],
    `${failureMode}: no new scene may start after the model failure`
  );

  model.releaseSibling.resolve();
  await assert.rejects(firstBatch, new RegExp(`fake model request failed \\(${failureMode}\\)`));
  assert.deepEqual(
    [...persistedSceneIds],
    [3],
    `${failureMode}: the already-running sibling must persist before retry is allowed`
  );

  await runBatch(2);

  assert.equal(
    model.calls.filter((call) => call.sceneId === 3).length,
    1,
    `${failureMode}: retry must skip the sibling scene persisted by the failed batch`
  );
  assert.deepEqual(
    [...persistedSceneIds].sort((left, right) => left - right),
    allSceneIds,
    `${failureMode}: retry must finish only the scenes that remained missing`
  );
}

async function main(): Promise<void> {
  const { storyOrchestrationTestSeams } = await import('../storyOrchestrationService');
  const { runWithConcurrencyLimit } = storyOrchestrationTestSeams;

  for (const failureMode of ['rejected_promise', 'delayed_rejection'] as const) {
    await verifyRetryDoesNotDuplicateSibling(runWithConcurrencyLimit, failureMode);
  }

  console.log('story image async model race guards passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
