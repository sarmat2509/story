import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = join(__dirname, '../../drizzle');
const excluded = new Set(['add_updated_at_triggers.sql']);
const migrationPattern = /^(\d{4})_.*\.sql$/;
const destructiveAllowedThrough = 85;
const destructivePattern = /\b(DROP|TRUNCATE)\b/i;
const trackedJournalBaseline = 52;

const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
assert.ok(files.length > 0, 'expected SQL migration files');

const invalid = files.filter((file) => !excluded.has(file) && !migrationPattern.test(file));
assert.deepEqual(invalid, [], 'all migration SQL files must use the NNNN_name.sql pattern');

const destructiveTooNew: string[] = [];
const filesByNumber = new Map<number, string[]>();
for (const file of files) {
  if (excluded.has(file)) {
    continue;
  }
  const match = file.match(migrationPattern);
  assert.ok(match, `migration filename must match expected pattern: ${file}`);
  const migrationNumber = Number(match[1]);
  filesByNumber.set(migrationNumber, [...(filesByNumber.get(migrationNumber) ?? []), file]);
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  assert.ok(sql.trim().length > 0, `migration must not be empty: ${file}`);

  if (migrationNumber > destructiveAllowedThrough && destructivePattern.test(sql)) {
    destructiveTooNew.push(file);
  }
}

assert.deepEqual(
  destructiveTooNew,
  [],
  `new launch migrations must avoid destructive DROP/TRUNCATE statements: ${destructiveTooNew.join(', ')}`
);

const duplicateTrackedNumbers = [...filesByNumber.entries()]
  .filter(([migrationNumber, matchingFiles]) =>
    migrationNumber > trackedJournalBaseline && matchingFiles.length > 1
  )
  .map(([migrationNumber, matchingFiles]) => `${String(migrationNumber).padStart(4, '0')}: ${matchingFiles.join(', ')}`);

assert.deepEqual(
  duplicateTrackedNumbers,
  [],
  `tracked migrations after ${String(trackedJournalBaseline).padStart(4, '0')} must not reuse numeric prefixes: ${duplicateTrackedNumbers.join('; ')}`
);

const trackedNumbers = [...filesByNumber.keys()]
  .filter((migrationNumber) => migrationNumber > trackedJournalBaseline)
  .sort((a, b) => a - b);

if (trackedNumbers.length > 0) {
  const expectedTrackedNumbers = Array.from(
    { length: trackedNumbers[trackedNumbers.length - 1] - trackedJournalBaseline },
    (_unused, index) => trackedJournalBaseline + index + 1
  );
  assert.deepEqual(
    trackedNumbers,
    expectedTrackedNumbers,
    `tracked migrations after ${String(trackedJournalBaseline).padStart(4, '0')} must be contiguous`
  );
}

console.log('migration file checks passed');
