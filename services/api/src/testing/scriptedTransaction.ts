import assert from 'node:assert/strict';

export type ScriptedSelect = {
  label: string;
  table: unknown;
  rows: unknown[];
};

export type ScriptedInsert = {
  label: string;
  table: unknown;
  returningRows?: unknown[];
};

export type RecordedInsert = {
  label: string;
  table: unknown;
  values: unknown;
};

export type ScriptedTransaction = {
  tx: any;
  inserts: RecordedInsert[];
  assertExhausted(): void;
};

function awaitable<T>(value: T): PromiseLike<T> {
  return {
    then(onFulfilled, onRejected) {
      return Promise.resolve(value).then(onFulfilled, onRejected);
    },
  };
}

/**
 * Minimal Drizzle transaction boundary for service contract tests.
 * It provides static database outputs and records production writes without
 * reproducing any quota calculations or branching from the service itself.
 */
export function createScriptedTransaction(input: {
  selects: ScriptedSelect[];
  inserts?: ScriptedInsert[];
}): ScriptedTransaction {
  const pendingSelects = [...input.selects];
  const pendingInserts = [...(input.inserts ?? [])];
  const inserts: RecordedInsert[] = [];

  const tx = {
    execute: async () => undefined,
    select: () => {
      const step = pendingSelects.shift();
      assert.ok(step, 'unexpected transaction select');

      const chain: any = {
        from(table: unknown) {
          assert.ok(table === step.table, `unexpected table for select: ${step.label}`);
          return chain;
        },
        innerJoin() {
          return chain;
        },
        where() {
          return chain;
        },
        limit() {
          return Promise.resolve(step.rows);
        },
        then: awaitable(step.rows).then,
      };
      return chain;
    },
    insert: (table: unknown) => {
      const step = pendingInserts.shift();
      assert.ok(step, 'unexpected transaction insert');
      assert.ok(table === step.table, `unexpected table for insert: ${step.label}`);

      return {
        values(values: unknown) {
          inserts.push({ label: step.label, table, values });
          const result = step.returningRows ?? [];
          return {
            returning: async () => result,
            then: awaitable(undefined).then,
          };
        },
      };
    },
  };

  return {
    tx,
    inserts,
    assertExhausted() {
      assert.deepEqual(
        pendingSelects.map((step) => step.label),
        [],
        'all scripted selects must be consumed'
      );
      assert.deepEqual(
        pendingInserts.map((step) => step.label),
        [],
        'all scripted inserts must be consumed'
      );
    },
  };
}

export function createTransactionRunner(transactions: ScriptedTransaction[]) {
  const pendingTransactions = [...transactions];

  return {
    transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const scripted = pendingTransactions.shift();
      assert.ok(scripted, 'unexpected repository transaction');
      const result = await callback(scripted.tx);
      scripted.assertExhausted();
      return result;
    },
    assertExhausted() {
      assert.equal(pendingTransactions.length, 0, 'all scripted transactions must be consumed');
    },
  };
}
