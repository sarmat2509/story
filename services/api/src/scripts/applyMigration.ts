import { db } from '../db';
import { sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

async function applyMigration() {
  try {
    logger.info('Applying metadata column migration...');
    
    // Add metadata column if it doesn't exist
    await db.execute(sql`
      ALTER TABLE stories 
      ADD COLUMN IF NOT EXISTS metadata jsonb;
    `);
    
    logger.info('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Migration failed');
    process.exit(1);
  }
}

applyMigration();
