/**
 * Test Script: Forced Alignment Generation (M6)
 * Tests ElevenLabsAlignmentProvider with test audio file from voice comparison
 */

import { getAlignmentProvider } from '../services/aiService';
import { readFileSync } from 'fs';
import path from 'path';

// Ukrainian test text (same as used in voice comparison tests)
const UKRAINIAN_TEST_TEXT = `Емілія сиділа на сонячному ґанку, розгорнувши велику, трохи пожовклу карту. Її молодший братик Максим притулився поруч, заглядаючи через плече. "Дивись, Максиме," – сказала Емілія, вказуючи пальчиком на маленьке зображення серед дерев. "Це ж стара теплиця! Мама розповідала, що там колись росли дивовижні квіти." Максим широко розплющив очі. "Квіти?" – прошепотів він.`;

async function testAlignmentGeneration() {
  try {
    console.log('🧪 Testing Forced Alignment Generation\n');
    
    // 1. Get alignment provider
    const alignmentProvider = getAlignmentProvider();
    console.log('✅ Alignment Provider initialized:', alignmentProvider.getProviderName());
    
    // 2. Health check
    console.log('\n🏥 Running health check...');
    const isHealthy = await alignmentProvider.healthCheck();
    console.log(`${isHealthy ? '✅' : '❌'} Health check:`, isHealthy);
    
    if (!isHealthy) {
      throw new Error('Alignment provider is not healthy');
    }
    
    // 3. Load test audio file
    console.log('\n📥 Loading test audio file...');
    const audioFilePath = path.join(process.cwd(), 'audio-voice-comparison', 'elevenlabs-ivan-ukrainian-test.mp3');
    const audioBuffer = readFileSync(audioFilePath);
    
    console.log('✅ Audio file loaded:', {
      path: audioFilePath,
      size: audioBuffer.length,
      sizeKB: Math.round(audioBuffer.length / 1024),
    });
    
    // 4. Display test text
    console.log('\n📝 Test text:');
    console.log(`  "${UKRAINIAN_TEST_TEXT.substring(0, 80)}..."`);
    console.log(`  Length: ${UKRAINIAN_TEST_TEXT.length} characters`);
    
    // 5. Generate alignment
    console.log('\n⏳ Generating forced alignment...');
    const startTime = Date.now();
    
    const alignmentResult = await alignmentProvider.generateAlignment({
      audioBuffer,
      text: UKRAINIAN_TEST_TEXT,
      language: 'uk',
      mimeType: 'audio/mpeg',
    });
    
    const duration = Date.now() - startTime;
    
    console.log('\n✅ Alignment generated successfully!');
    console.log({
      durationMs: duration,
      durationSeconds: Math.round(duration / 1000),
      wordCount: alignmentResult.words.length,
      characterCount: alignmentResult.characters.length,
      averageConfidence: alignmentResult.averageConfidence?.toFixed(3),
      provider: alignmentResult.metadata?.provider,
      audioDuration: alignmentResult.metadata?.durationSeconds,
    });
    
    // 6. Show sample words (first 15)
    console.log('\n📝 Sample words (first 15):');
    alignmentResult.words.slice(0, 15).forEach((word, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. "${word.text.padEnd(15)}" | ${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s | confidence: ${(word.confidence || 0).toFixed(3)}`);
    });
    
    // 7. Show sample words (last 5)
    console.log('\n📝 Sample words (last 5):');
    alignmentResult.words.slice(-5).forEach((word, i) => {
      const index = alignmentResult.words.length - 5 + i;
      console.log(`  ${String(index + 1).padStart(2)}. "${word.text.padEnd(15)}" | ${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s | confidence: ${(word.confidence || 0).toFixed(3)}`);
    });
    
    // 8. Show statistics
    console.log('\n📊 Statistics:');
    const confidences = alignmentResult.words.map(w => w.confidence || 0);
    const minConfidence = Math.min(...confidences);
    const maxConfidence = Math.max(...confidences);
    const avgWordDuration = alignmentResult.words.reduce((sum, w) => sum + (w.end - w.start), 0) / alignmentResult.words.length;
    
    console.log({
      totalWords: alignmentResult.words.length,
      totalCharacters: alignmentResult.characters.length,
      avgConfidence: alignmentResult.averageConfidence?.toFixed(3),
      minConfidence: minConfidence.toFixed(3),
      maxConfidence: maxConfidence.toFixed(3),
      avgWordDuration: `${avgWordDuration.toFixed(3)}s`,
    });
    
    console.log('\n🎉 Test completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('  1. Generate audio for a story in the app');
    console.log('  2. Alignment will be auto-generated after audio completes');
    console.log('  3. Open story viewer and toggle "Читати разом"');
    console.log('  4. Play audio and watch sentence/word highlighting');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack:', error.stack);
    }
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run test
testAlignmentGeneration();
