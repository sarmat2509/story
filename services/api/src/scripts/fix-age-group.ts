/**
 * Fix age_group_id constraint - make it nullable
 * We decided to use age_group (string) instead of age_group_id (UUID)
 */

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://kazka:devpass@localhost:5432/kazka_dev',
});

async function fixAgeGroupConstraint() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Making age_group_id nullable...');
    
    // Make age_group_id nullable in stories table
    await client.query(`
      ALTER TABLE stories ALTER COLUMN age_group_id DROP NOT NULL;
    `);
    console.log('✅ stories.age_group_id is now nullable');
    
    // Make age_group_id nullable in age_engine_rules table
    await client.query(`
      ALTER TABLE age_engine_rules ALTER COLUMN age_group_id DROP NOT NULL;
    `);
    console.log('✅ age_engine_rules.age_group_id is now nullable');
    
    console.log('✅ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixAgeGroupConstraint()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
