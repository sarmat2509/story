/**
 * Debug Script: Check Alignment Data Structure
 * Shows how alignment data looks in the database
 */

import { db } from '../db';
import { stories } from '../db/schema';
import { eq } from 'drizzle-orm';

async function debugAlignmentData() {
  try {
    console.log('🔍 Checking Alignment Data Structure\n');
    
    // Find story with alignment
    const [story] = await db
      .select()
      .from(stories)
      .where(eq(stories.id, '7ce632ea-f4c2-4596-b752-c2ba3eb3cf62'))
      .limit(1);
    
    if (!story) {
      console.log('❌ Story not found');
      return;
    }
    
    console.log('📖 Story:', {
      id: story.id,
      title: story.title,
      fullTextLength: story.fullText.length,
      fullTextPreview: story.fullText.substring(0, 150) + '...',
    });
    
    const audioMetadata = story.audioMetadata as any;
    
    if (!audioMetadata) {
      console.log('❌ No audio metadata');
      return;
    }
    
    console.log('\n🎵 Audio Metadata:', {
      hasAlignment: !!audioMetadata.alignment,
      provider: audioMetadata.provider,
      totalDuration: audioMetadata.totalDuration,
    });
    
    if (!audioMetadata.alignment) {
      console.log('❌ No alignment data');
      return;
    }
    
    const alignment = audioMetadata.alignment;
    
    console.log('\n✅ Alignment Data:', {
      wordCount: alignment.words?.length || 0,
      characterCount: alignment.characters?.length || 0,
      averageConfidence: alignment.averageConfidence,
      provider: alignment.provider,
      generatedAt: alignment.generatedAt,
    });
    
    // Show first 10 words
    console.log('\n📝 First 10 words:');
    alignment.words.slice(0, 10).forEach((word: any, i: number) => {
      console.log(`  ${i + 1}. "${word.text.padEnd(15)}" | ${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s | conf: ${(word.confidence || 0).toFixed(3)}`);
    });
    
    // Check for audio tags in fullText
    const hasAudioTags = /\[[\w\s]+\]/.test(story.fullText);
    console.log('\n🏷️  Audio Tags Check:', {
      hasAudioTags,
      examples: hasAudioTags ? story.fullText.match(/\[[\w\s]+\]/g)?.slice(0, 5) : 'None',
    });
    
    // Check if words exist in cleaned text
    const cleanedText = story.fullText.replace(/\[[\w\s]+\]/g, '').trim();
    const firstWord = alignment.words[0];
    const wordFoundInCleanedText = cleanedText.indexOf(firstWord.text) !== -1;
    const wordFoundInOriginalText = story.fullText.indexOf(firstWord.text) !== -1;
    
    console.log('\n🔍 Word Matching Test:', {
      firstWord: firstWord.text,
      foundInOriginalText: wordFoundInOriginalText,
      foundInCleanedText: wordFoundInCleanedText,
      originalTextPreview: story.fullText.substring(0, 100),
      cleanedTextPreview: cleanedText.substring(0, 100),
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

debugAlignmentData();
