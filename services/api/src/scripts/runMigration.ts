// Load .env from project root FIRST, before any other imports
import { config } from 'dotenv';
import { resolve } from 'path';
// From services/api/src/scripts/ need to go up 4 levels to reach project root
config({ path: resolve(__dirname, '../../../../.env') });

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';

async function runMigration() {
  // Get migration file from command line argument or default to 0011
  // Accept filename only (e.g. 0046_normalize_asset_urls_to_relative.sql) - path is resolved relative to drizzle/
  // Skip '--' (pnpm run db:migrate -- 0048_xxx.sql passes -- as first arg)
  const arg = process.argv.slice(2).find(a => a !== '--') || '0011_add_stories_metadata.sql';
  const migrationFile = arg.includes('/') ? arg.split('/').pop()! : arg;
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    console.error('Tried to load from:', resolve(__dirname, '../../../.env'));
    console.error('Current env keys:', Object.keys(process.env).filter(k => k.includes('DATABASE')));
    process.exit(1);
  }

  console.log('✅ DATABASE_URL found');
  console.log(`📄 Running migration: ${migrationFile}`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    logger.info(`Running migration ${migrationFile}...`);
    
    const sql = readFileSync(
      join(__dirname, '../../drizzle/', migrationFile),
      'utf-8'
    );
    
    await pool.query(sql);
    
    logger.info('Migration completed successfully!');
    console.log('✅ Migration applied successfully!');
    process.exit(0);
  } catch (error) {
    logger.error({ error, message: error instanceof Error ? error.message : 'Unknown error' }, 'Migration failed');
    console.error('❌ Migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
