#!/usr/bin/env tsx

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { GOOGLE_TTS_VOICE_CATALOG } from '../providers/audio/google/voices';
import { OPENAI_TTS_VOICE_CATALOG } from '../providers/audio/openai/voices';
import { GoogleTTSProvider } from '../providers/audio/google/GoogleTTSProvider';
import { OpenAITTSProvider } from '../providers/audio/openai/OpenAITTSProvider';
import { IAudioProvider } from '../providers/base/IAudioProvider';

// Ukrainian test text from user
const UKRAINIAN_TEST_TEXT = `Емілія сиділа на сонячному ґанку, розгорнувши велику, трохи пожовклу карту. Її молодший братик Максим притулився поруч, заглядаючи через плече. "Дивись, Максиме," – сказала Емілія, вказуючи пальчиком на маленьке зображення серед дерев. "Це ж стара теплиця! Мама розповідала, що там колись росли дивовижні квіти." Максим широко розплющив очі. "Квіти?" – прошепотів він.`;

interface TestResult {
  provider: string;
  voiceId: string;
  voiceName: string;
  gender: string;
  success: boolean;
  generationTimeMs?: number;
  fileSizeBytes?: number;
  durationSeconds?: number;
  error?: string;
}

const OUTPUT_DIR = path.join(process.cwd(), 'audio-voice-comparison');

/**
 * Test a single voice
 */
async function testVoice(
  provider: 'google' | 'openai',
  voiceId: string,
  voiceName: string,
  gender: string
): Promise<TestResult> {
  console.log(`\n▶ Testing: ${provider.toUpperCase()} - ${voiceName} (${gender})`);
  console.log(`  Voice ID: ${voiceId}`);
  console.log(`  Text: ${UKRAINIAN_TEST_TEXT.substring(0, 50)}...`);

  const result: TestResult = {
    provider,
    voiceId,
    voiceName,
    gender,
    success: false,
  };

  try {
    // Create provider instance
    let audioProvider: IAudioProvider;
    if (provider === 'google') {
      audioProvider = new GoogleTTSProvider(
        config.audio.google.projectId,
        config.audio.google.credentials,
        config.audio.google.model
      );
    } else {
      audioProvider = new OpenAITTSProvider(
        config.audio.openai.apiKey,
        config.audio.openai.model
      );
    }
    
    const startTime = Date.now();

    const response = await audioProvider.synthesize({
      text: UKRAINIAN_TEST_TEXT,
      voiceId,
      language: 'uk',
    });

    const generationTime = Date.now() - startTime;
    result.generationTimeMs = generationTime;
    result.durationSeconds = response.durationSeconds;
    result.fileSizeBytes = response.audioData.length;

    // Save to file
    const filename = `${provider}-${voiceId.toLowerCase()}-ukrainian-test.mp3`;
    const filepath = path.join(OUTPUT_DIR, filename);
    writeFileSync(filepath, response.audioData);

    result.success = true;

    console.log(`  ✅ Success: ${filename}`);
    console.log(`  Duration: ${response.durationSeconds}s`);
    console.log(`  Generation time: ${generationTime}ms`);
    console.log(`  File size: ${(response.audioData.length / 1024).toFixed(2)} KB`);

    return result;
  } catch (error: any) {
    result.success = false;
    result.error = error.message;

    console.log(`  ❌ Failed: ${error.message}`);

    return result;
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('============================================================');
  console.log('Voice Comparison Test - Ukrainian Text');
  console.log('============================================================');
  console.log(`Text: "${UKRAINIAN_TEST_TEXT.substring(0, 80)}..."`);
  console.log(`Text length: ${UKRAINIAN_TEST_TEXT.length} characters`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results: TestResult[] = [];

  // Test Google TTS voices
  console.log('\n============================================================');
  console.log('Testing GOOGLE CLOUD TTS (Gemini 2.5 Flash TTS)');
  console.log('============================================================');

  for (const voice of GOOGLE_TTS_VOICE_CATALOG) {
    const result = await testVoice(
      'google',
      voice.providerVoiceId,
      voice.displayName,
      voice.gender
    );
    results.push(result);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Test OpenAI TTS voices
  console.log('\n============================================================');
  console.log('Testing OPENAI TTS (gpt-4o-mini-tts)');
  console.log('============================================================');

  for (const voice of OPENAI_TTS_VOICE_CATALOG) {
    const result = await testVoice(
      'openai',
      voice.providerVoiceId,
      voice.displayName,
      voice.gender
    );
    results.push(result);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Print summary
  console.log('\n\n============================================================');
  console.log('SUMMARY');
  console.log('============================================================\n');

  // Group by provider
  const googleResults = results.filter(r => r.provider === 'google');
  const openaiResults = results.filter(r => r.provider === 'openai');

  console.log('📊 Google Cloud TTS Results:');
  console.log('─'.repeat(80));
  console.log(`${'Voice'.padEnd(20)} ${'Gender'.padEnd(10)} ${'Time'.padEnd(12)} ${'Size'.padEnd(12)} ${'Status'}`);
  console.log('─'.repeat(80));
  
  for (const result of googleResults) {
    const status = result.success ? '✅' : '❌';
    const time = result.generationTimeMs ? `${result.generationTimeMs}ms` : 'N/A';
    const size = result.fileSizeBytes ? `${(result.fileSizeBytes / 1024).toFixed(1)} KB` : 'N/A';
    console.log(
      `${result.voiceName.padEnd(20)} ${result.gender.padEnd(10)} ${time.padEnd(12)} ${size.padEnd(12)} ${status}`
    );
  }

  const googleSuccess = googleResults.filter(r => r.success).length;
  const googleAvgTime = googleResults
    .filter(r => r.success)
    .reduce((sum, r) => sum + (r.generationTimeMs || 0), 0) / googleSuccess;

  console.log('─'.repeat(80));
  console.log(`Success Rate: ${googleSuccess}/${googleResults.length} (${((googleSuccess / googleResults.length) * 100).toFixed(0)}%)`);
  console.log(`Average Generation Time: ${googleAvgTime.toFixed(0)}ms`);

  console.log('\n📊 OpenAI TTS Results:');
  console.log('─'.repeat(80));
  console.log(`${'Voice'.padEnd(20)} ${'Gender'.padEnd(10)} ${'Time'.padEnd(12)} ${'Size'.padEnd(12)} ${'Status'}`);
  console.log('─'.repeat(80));
  
  for (const result of openaiResults) {
    const status = result.success ? '✅' : '❌';
    const time = result.generationTimeMs ? `${result.generationTimeMs}ms` : 'N/A';
    const size = result.fileSizeBytes ? `${(result.fileSizeBytes / 1024).toFixed(1)} KB` : 'N/A';
    console.log(
      `${result.voiceName.padEnd(20)} ${result.gender.padEnd(10)} ${time.padEnd(12)} ${size.padEnd(12)} ${status}`
    );
  }

  const openaiSuccess = openaiResults.filter(r => r.success).length;
  const openaiAvgTime = openaiResults
    .filter(r => r.success)
    .reduce((sum, r) => sum + (r.generationTimeMs || 0), 0) / openaiSuccess;

  console.log('─'.repeat(80));
  console.log(`Success Rate: ${openaiSuccess}/${openaiResults.length} (${((openaiSuccess / openaiResults.length) * 100).toFixed(0)}%)`);
  console.log(`Average Generation Time: ${openaiAvgTime.toFixed(0)}ms`);

  // Overall summary
  console.log('\n📈 Overall Statistics:');
  console.log('─'.repeat(80));
  console.log(`Total Voices Tested: ${results.length}`);
  console.log(`Total Success: ${results.filter(r => r.success).length}`);
  console.log(`Total Failed: ${results.filter(r => !r.success).length}`);
  console.log(`Overall Success Rate: ${((results.filter(r => r.success).length / results.length) * 100).toFixed(0)}%`);
  
  // Speed comparison
  if (googleAvgTime && openaiAvgTime) {
    const faster = googleAvgTime < openaiAvgTime ? 'Google' : 'OpenAI';
    const speedDiff = Math.abs(googleAvgTime - openaiAvgTime);
    const speedPercent = ((speedDiff / Math.max(googleAvgTime, openaiAvgTime)) * 100).toFixed(0);
    console.log(`\n🏃 Speed Winner: ${faster} (${speedPercent}% faster)`);
  }

  console.log('\n📁 Audio files saved to:', OUTPUT_DIR);
  console.log('─'.repeat(80));

  // Female voices comparison
  console.log('\n👩 Female Voices:');
  const femaleVoices = results.filter(r => r.gender === 'female' && r.success);
  for (const voice of femaleVoices) {
    console.log(`  • ${voice.provider.toUpperCase()} - ${voice.voiceName}: ${voice.generationTimeMs}ms`);
  }

  // Male voices comparison
  console.log('\n👨 Male Voices:');
  const maleVoices = results.filter(r => r.gender === 'male' && r.success);
  for (const voice of maleVoices) {
    console.log(`  • ${voice.provider.toUpperCase()} - ${voice.voiceName}: ${voice.generationTimeMs}ms`);
  }

  console.log('\n============================================================');
  console.log('✅ Voice comparison test completed!');
  console.log('============================================================\n');

  // Save results to JSON
  const jsonPath = path.join(OUTPUT_DIR, 'test-results.json');
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        testDate: new Date().toISOString(),
        testText: UKRAINIAN_TEST_TEXT,
        textLength: UKRAINIAN_TEST_TEXT.length,
        results,
        summary: {
          total: results.length,
          success: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          googleAvgTime: googleAvgTime.toFixed(0),
          openaiAvgTime: openaiAvgTime.toFixed(0),
        },
      },
      null,
      2
    )
  );
  console.log(`📄 Test results saved to: ${jsonPath}\n`);
}

// Run the test
main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
