/**
 * Update existing assets URLs in database
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function updateAssetUrls() {
  try {
    // Update all assets that have /uploads/ URLs
    const result = await db.execute(sql`
      UPDATE assets 
      SET 
        storage_url = REPLACE(storage_url, '/uploads/', '/api/v1/assets/'),
        signed_url = REPLACE(signed_url, '/uploads/', '/api/v1/assets/')
      WHERE storage_url LIKE '/uploads/%'
      RETURNING id, storage_path, storage_url;
    `);
    
    console.log(`✓ Updated ${result.rowCount} asset records`);
    console.log('\nSample updated records:');
    for (const row of (result.rows as any[]).slice(0, 3)) {
      console.log(`  ${row.id}: ${row.storage_url}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateAssetUrls();
