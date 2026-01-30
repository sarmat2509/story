import pg from 'pg';

const storyId = '2b859f8d-440f-4cab-af99-519c56639733';

async function checkStory() {
  const pool = new pg.Pool({ 
    connectionString: 'postgresql://kazka:devpass@localhost:5432/kazka_dev'
  });

  console.log('Checking story:', storyId);
  console.log('='.repeat(80));

  try {
    // Check story details
    const storyResult = await pool.query(
      `SELECT id, title, language, created_at FROM stories WHERE id = $1`,
      [storyId]
    );

    if (storyResult.rows.length > 0) {
      const story = storyResult.rows[0];
      console.log('\n📖 STORY DETAILS:');
      console.log('Title:', story.title);
      console.log('Language:', story.language);
      console.log('Created:', story.created_at);

      // Get first scene
      const sceneResult = await pool.query(
        `SELECT text FROM scenes WHERE story_id = $1 ORDER BY scene_id LIMIT 1`,
        [storyId]
      );
      
      if (sceneResult.rows.length > 0) {
        console.log('\n📝 First scene text (first 300 chars):');
        console.log(sceneResult.rows[0].text.substring(0, 300));
      }
    } else {
      console.log('❌ Story not found');
      await pool.end();
      return;
    }

    // Check story request
    const requestResult = await pool.query(
      `SELECT id, story_language, ui_locale, created_at FROM story_requests WHERE story_id = $1`,
      [storyId]
    );

    if (requestResult.rows.length > 0) {
      const request = requestResult.rows[0];
      console.log('\n\n📋 STORY REQUEST DETAILS:');
      console.log('Request ID:', request.id);
      console.log('Story Language Field:', request.story_language);
      console.log('UI Locale:', request.ui_locale);
      console.log('Created:', request.created_at);
    } else {
      console.log('\n❌ Story request not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkStory();
