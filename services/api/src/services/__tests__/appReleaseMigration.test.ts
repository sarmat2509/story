import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LOCALE_IDS } from '@wondertales/shared';

const migrationPath = path.resolve(process.cwd(), 'drizzle/0134_app_releases.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const releaseIds = [
  'a0000000-0000-4000-8000-000000000714',
  'a0000000-0000-4000-8000-000000000710',
  'a0000000-0000-4000-8000-000000000709',
  'a0000000-0000-4000-8000-000000000702',
];

assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
assert.match(sql, /assert_app_release_has_all_locales/);
assert.match(sql, /jsonb_array_length\("email_body"\) > 0/);

for (const releaseId of releaseIds) {
  for (const locale of LOCALE_IDS) {
    const marker = `('${releaseId}', '${locale}',`;
    assert.equal(
      sql.split(marker).length - 1,
      1,
      `${releaseId} must have exactly one ${locale} seed`
    );
  }
}

const jsonDocuments = [...sql.matchAll(/\$\$(\[[\s\S]*?\])\$\$::jsonb/g)].map((match) => match[1]);
assert.equal(jsonDocuments.length, releaseIds.length * LOCALE_IDS.length * 2);
for (const document of jsonDocuments) {
  const parsed = JSON.parse(document);
  assert.ok(
    Array.isArray(parsed) && parsed.length > 0,
    'seeded JSON content must be a non-empty array'
  );
}

console.log('appReleaseMigration tests passed');
