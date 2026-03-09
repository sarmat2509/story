/**
 * Run all SQL migrations that haven't been applied yet.
 * Uses a journal table to track applied migrations.
 *
 * Usage:
 *   npx tsx src/scripts/runAllMigrations.ts
 *   npx tsx src/scripts/runAllMigrations.ts 0040_add_scenario_world_rules.sql 0041_add_expeditions_and_macro_scifi.sql ...
 *
 * Excludes: add_updated_at_triggers.sql (run separately after db:push)
 */

import { join } from 'path';
import { readdirSync, readFileSync } from 'fs';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

const MIGRATIONS_DIR = join(__dirname, '../../drizzle');
const EXCLUDED = ['add_updated_at_triggers.sql'];
const MIGRATION_PATTERN = /^\d{4}_.*\.sql$/;

async function ensureJournalTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function getMigrationFiles(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && MIGRATION_PATTERN.test(f) && !EXCLUDED.includes(f));
  return files.sort();
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((r) => r.filename));
}

async function runAllMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set');
    console.error('Run via: docker compose -f docker-compose.dev.yml run --rm api npx tsx src/scripts/runAllMigrations.ts');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await ensureJournalTable(pool);
    const applied = await getAppliedMigrations(pool);
    const onlyFiles = process.argv.slice(2).filter((a) => a.endsWith('.sql'));
    const allFiles = onlyFiles.length > 0 ? onlyFiles : getMigrationFiles();
    const pending = allFiles.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('✅ All migrations already applied');
      return;
    }

    console.log(`📋 Found ${pending.length} pending migration(s) of ${allFiles.length} total`);
    for (const file of pending) {
      console.log(`  - ${file}`);
    }
    console.log('');

    for (const filename of pending) {
      const filepath = join(MIGRATIONS_DIR, filename);
      const sql = readFileSync(filepath, 'utf-8');

      try {
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await pool.query('COMMIT');
        console.log(`✅ ${filename}`);
        logger.info({ filename }, 'Migration applied');
      } catch (err) {
        await pool.query('ROLLBACK');
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ ${filename}: ${msg}`);
        logger.error({ err, filename }, 'Migration failed');
        process.exit(1);
      }
    }

    console.log('');
    console.log(`✅ Applied ${pending.length} migration(s) successfully`);
  } finally {
    await pool.end();
  }
}

runAllMigrations();
