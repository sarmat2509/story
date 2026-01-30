/**
 * Migration script for adding AI-generated description fields
 * Run with: npx tsx scripts/migrate-0017-ai-descriptions.ts
 */

import { config } from '../src/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import { sql } from 'drizzle-orm';

async function runMigration() {
  console.log('Starting migration 0017: Add AI-generated description fields...');
  
  const pool = new Pool({
    connectionString: config.database.url,
  });
  
  const db = drizzle(pool);
  
  try {
    // Add columns to child_profiles
    console.log('Adding columns to child_profiles...');
    await db.execute(sql`
      ALTER TABLE child_profiles 
        ADD COLUMN IF NOT EXISTS ai_generated_description TEXT NULL,
        ADD COLUMN IF NOT EXISTS clothing JSONB NULL,
        ADD COLUMN IF NOT EXISTS distinctive_features JSONB NULL
    `);
    
    // Add columns to characters
    console.log('Adding columns to characters...');
    await db.execute(sql`
      ALTER TABLE characters 
        ADD COLUMN IF NOT EXISTS ai_generated_description TEXT NULL,
        ADD COLUMN IF NOT EXISTS clothing JSONB NULL,
        ADD COLUMN IF NOT EXISTS distinctive_features JSONB NULL
    `);
    
    // Add indexes
    console.log('Adding indexes...');
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_child_profiles_ai_description 
        ON child_profiles USING gin(to_tsvector('english', ai_generated_description))
        WHERE ai_generated_description IS NOT NULL
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_characters_ai_description 
        ON characters USING gin(to_tsvector('english', ai_generated_description))
        WHERE ai_generated_description IS NOT NULL
    `);
    
    // Add comments
    console.log('Adding column comments...');
    await db.execute(sql`
      COMMENT ON COLUMN child_profiles.ai_generated_description IS 
        'AI-generated description from Gemini Vision API. NULL if analysis failed or photo quality insufficient.'
    `);
    
    await db.execute(sql`
      COMMENT ON COLUMN child_profiles.clothing IS 
        'Structured clothing data extracted by AI. NULL if clothing not visible or unclear in photos.'
    `);
    
    await db.execute(sql`
      COMMENT ON COLUMN child_profiles.distinctive_features IS 
        'Array of distinctive features detected by AI. NULL if none detected or photos unclear.'
    `);
    
    await db.execute(sql`
      COMMENT ON COLUMN characters.ai_generated_description IS 
        'AI-generated description from Gemini Vision API. NULL if analysis failed or photo quality insufficient.'
    `);
    
    await db.execute(sql`
      COMMENT ON COLUMN characters.clothing IS 
        'Structured clothing data extracted by AI. NULL if clothing not visible or unclear in photos.'
    `);
    
    await db.execute(sql`
      COMMENT ON COLUMN characters.distinctive_features IS 
        'Array of distinctive features detected by AI. NULL if none detected or photos unclear.'
    `);
    
    console.log('✅ Migration 0017 completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
