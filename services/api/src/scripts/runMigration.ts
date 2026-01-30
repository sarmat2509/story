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
  const migrationFile = process.argv[2] || '0011_add_stories_metadata.sql';
  
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
