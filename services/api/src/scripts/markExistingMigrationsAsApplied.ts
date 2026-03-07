/**
 * Create schema_migrations table and mark all existing migration files as applied.
 * Use when migrations were run manually or via another tool and you need to sync the journal.
 *
 * Usage:
 *   cd services/api && npx tsx src/scripts/markExistingMigrationsAsApplied.ts
 */

import { config } from 'dotenv';
import { resolve, join } from 'path';
import { readdirSync, existsSync } from 'fs';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

const projectRoot = resolve(__dirname, '../../../../');
for (const name of ['.env.production', '.env']) {
  const p = join(projectRoot, name);
  if (existsSync(p)) {
    config({ path: p });
    break;
  }
}

const MIGRATIONS_DIR = join(__dirname, '../../drizzle');
const EXCLUDED = ['add_updated_at_triggers.sql'];
const MIGRATION_PATTERN = /^\d{4}_.*\.sql$/;

function getMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && MIGRATION_PATTERN.test(f) && !EXCLUDED.includes(f))
    .sort();
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const files = getMigrationFiles();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ Table schema_migrations created or already exists');

    const result = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    const applied = new Set(result.rows.map((r) => r.filename));
    const toInsert = files.filter((f) => !applied.has(f));

    if (toInsert.length === 0) {
      console.log(`✅ All ${files.length} migrations already marked as applied`);
      return;
    }

    for (const filename of toInsert) {
      await pool.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
        [filename]
      );
      console.log(`  ✓ ${filename}`);
      logger.info({ filename }, 'Marked migration as applied');
    }

    console.log(`\n✅ Marked ${toInsert.length} migration(s) as applied (${files.length} total in journal)`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
