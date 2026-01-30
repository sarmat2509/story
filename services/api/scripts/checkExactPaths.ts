/**
 * Check exact storage paths in database
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function checkPaths() {
  const storyId = 'a6773cad-e4d2-430d-9303-46c2ef5d5ed2';
  
  try {
    const result = await db.execute(sql`
      SELECT 
        id,
        scene_id,
        storage_path,
        storage_url,
        LENGTH(storage_path) as path_length
      FROM assets
      WHERE story_id = ${storyId}
      ORDER BY created_at
    `);
    
    console.log('=== STORAGE PATHS IN DB ===\n');
    for (const row of result.rows as any[]) {
      console.log(`Asset ID: ${row.id}`);
      console.log(`Scene ID: ${row.scene_id}`);
      console.log(`Storage Path: "${row.storage_path}"`);
      console.log(`Storage URL: "${row.storage_url}"`);
      console.log(`Path Length: ${row.path_length}`);
      console.log('---\n');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkPaths();
