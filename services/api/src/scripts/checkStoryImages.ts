import pg from 'pg';

const storyId = '2b859f8d-440f-4cab-af99-519c56639733';

async function checkStoryImages() {
  const pool = new pg.Pool({ 
    connectionString: 'postgresql://kazka:devpass@localhost:5432/kazka_dev'
  });

  console.log('Checking images for story:', storyId);
  console.log('='.repeat(80));

  try {
    // Check scenes table
    const scenesResult = await pool.query(
      `SELECT id, scene_id, text, visual_prompt 
       FROM scenes 
       WHERE story_id = $1 
       ORDER BY scene_id`,
      [storyId]
    );

    console.log(`\n📸 SCENES TABLE (${scenesResult.rows.length} scenes):`);
    if (scenesResult.rows.length === 0) {
      console.log('  ❌ No scenes found in scenes table!');
    } else {
      scenesResult.rows.forEach(scene => {
        console.log(`\nScene ${scene.scene_id}:`);
        console.log('  ID:', scene.id);
        console.log('  Text (first 100 chars):', scene.text.substring(0, 100) + '...');
        console.log('  Visual Prompt:', scene.visual_prompt ? scene.visual_prompt.substring(0, 100) + '...' : 'NULL');
      });
    }

    // Check assets table
    const assetsResult = await pool.query(
      `SELECT a.id, s.scene_id, a.asset_type, a.storage_url, a.signed_url, 
              a.signed_url_expires_at, a.file_size_bytes, a.status, a.error_message
       FROM assets a
       JOIN scenes s ON a.scene_id = s.id
       WHERE a.story_id = $1 AND a.asset_type = 'image'
       ORDER BY s.scene_id`,
      [storyId]
    );

    console.log(`\n\n🎨 ASSETS TABLE (${assetsResult.rows.length} image assets):`);
    if (assetsResult.rows.length === 0) {
      console.log('  ❌ No image assets found for this story!');
    } else {
      assetsResult.rows.forEach(asset => {
        console.log(`\nScene ${asset.scene_id}:`);
        console.log('  Asset ID:', asset.id);
        console.log('  Type:', asset.asset_type);
        console.log('  Storage URL:', asset.storage_url || 'NULL');
        console.log('  Signed URL:', asset.signed_url ? (asset.signed_url.substring(0, 80) + '...') : 'NULL');
        console.log('  Signed URL Expires:', asset.signed_url_expires_at || 'NULL');
        console.log('  Size:', asset.file_size_bytes ? `${Math.round(asset.file_size_bytes / 1024)}KB` : 'NULL');
        console.log('  Status:', asset.status);
        console.log('  Error:', asset.error_message || 'None');
      });
    }

    // Check story.scenes JSON field
    const storyResult = await pool.query(
      `SELECT scenes FROM stories WHERE id = $1`,
      [storyId]
    );

    if (storyResult.rows.length > 0 && storyResult.rows[0].scenes) {
      const scenes = storyResult.rows[0].scenes;
      console.log(`\n\n📚 STORY.SCENES JSON (${scenes.length} scenes):`);
      scenes.forEach((scene: any, idx: number) => {
        console.log(`\nScene ${idx + 1}:`);
        console.log('  Has imageUrl:', !!scene.imageUrl);
        console.log('  imageUrl:', scene.imageUrl || 'NULL');
        console.log('  Has image object:', !!scene.image);
        if (scene.image) {
          console.log('  image.url:', scene.image.url || 'NULL');
          console.log('  image.status:', scene.image.status || 'NULL');
        }
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkStoryImages();
