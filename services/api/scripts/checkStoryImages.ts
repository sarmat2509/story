/**
 * Check story images in database
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function checkStoryImages() {
  const storyId = 'a6773cad-e4d2-430d-9303-46c2ef5d5ed2';
  
  try {
    // Check story exists
    const story = await db.execute(sql`
      SELECT id, title, created_at 
      FROM stories 
      WHERE id = ${storyId}
    `);
    
    console.log('=== STORY ===');
    console.log(story.rows);
    
    // Check scenes
    const scenes = await db.execute(sql`
      SELECT id, story_id, scene_id, created_at
      FROM scenes
      WHERE story_id = ${storyId}
      ORDER BY scene_id
    `);
    
    console.log('\n=== SCENES ===');
    console.log(scenes.rows);
    
    // Check assets
    const assets = await db.execute(sql`
      SELECT id, story_id, scene_id, asset_type, status, storage_path, created_at
      FROM assets
      WHERE story_id = ${storyId}
      ORDER BY scene_id, asset_type
    `);
    
    console.log('\n=== ASSETS ===');
    console.log(assets.rows);
    
    // Check if storage files exist
    for (const asset of assets.rows as any[]) {
      if (asset.storage_path) {
        const fs = require('fs');
        const fullPath = `/Users/ivanryzhenko/Documents/Repository/story/services/api/storage/${asset.storage_path}`;
        const exists = fs.existsSync(fullPath);
        console.log(`\n${asset.asset_type} (scene ${asset.scene_id || 'N/A'}): ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
        console.log(`  Path: ${fullPath}`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkStoryImages();
