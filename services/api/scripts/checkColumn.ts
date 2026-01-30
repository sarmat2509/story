/**
 * Check if audio_metadata column exists in stories table
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function checkColumn() {
  try {
    const result = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'stories' 
      AND column_name IN ('metadata', 'audio_metadata')
      ORDER BY column_name;
    `);
    
    console.log('Columns in stories table:');
    console.log(result.rows);
    
    const hasMetadata = result.rows.some((r: any) => r.column_name === 'metadata');
    const hasAudioMetadata = result.rows.some((r: any) => r.column_name === 'audio_metadata');
    
    console.log('\nStatus:');
    console.log('✓ metadata:', hasMetadata ? 'EXISTS' : 'MISSING');
    console.log('✓ audio_metadata:', hasAudioMetadata ? 'EXISTS' : 'MISSING');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkColumn();
