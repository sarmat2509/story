/**
 * Multi-Vendor TTS Integration Test Script
 * Tests all 3 providers with [emotion] tag conversion
 * 
 * Usage:
 *   AUDIO_PROVIDER=elevenlabs npm run test:tts
 *   AUDIO_PROVIDER=google npm run test:tts
 *   AUDIO_PROVIDER=openai npm run test:tts
 *   AUDIO_PROVIDER=grok npm run test:tts
 */

import { getAudioProvider } from '../services/aiService';
import { writeFileSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

async function testProvider(providerName: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${providerName.toUpperCase()} TTS Provider`);
  console.log('='.repeat(60));
  
  // Set provider
  process.env.AUDIO_PROVIDER = providerName;
  
  try {
    const provider = getAudioProvider();
    
    // Test cases
    const tests = [
      {
        name: 'basic-no-emotions',
        text: 'Hello, this is a test.',
        voiceId: getVoiceId(providerName, 'female'),
      },
      {
        name: 'with-emotion-tags',
        text: '[excited] This is amazing! [thoughtful] Or is it?',
        voiceId: getVoiceId(providerName, 'female'),
      },
      {
        name: 'with-nonverbal-tags',
        text: '[sighs] I don\'t know. [laughing] Maybe!',
        voiceId: getVoiceId(providerName, 'female'),
      },
      {
        name: 'with-pause-tags',
        text: 'Step one. [pause] Step two. [long pause] Step three.',
        voiceId: getVoiceId(providerName, 'male'),
      },
      {
        name: 'complex-ukrainian-mix',
        text: '[excited] Емілія миттєво взялася за справу. [thoughtful] Її брови насупилися. [sighs] Як же зробити? [pause] Це виглядає складно.',
        voiceId: getVoiceId(providerName, 'female'),
      },
    ];
    
    for (const test of tests) {
      console.log(`\n▶ Test: ${test.name}`);
      console.log(`  Voice: ${test.voiceId}`);
      console.log(`  Text: ${test.text.substring(0, 60)}${test.text.length > 60 ? '...' : ''}`);
      
      try {
        const startTime = Date.now();
        const result = await provider.synthesize({
          text: test.text,
          voiceId: test.voiceId,
          language: 'uk',
        });
        const duration = Date.now() - startTime;
        
        const outputDir = path.join(__dirname, '../../audio-test-output');
        const filename = `test-${providerName}-${test.name}.mp3`;
        const filepath = path.join(outputDir, filename);
        
        writeFileSync(filepath, result.audioData);
        
        console.log(`  ✅ Success: ${filename}`);
        console.log(`  Duration: ${result.durationSeconds}s`);
        console.log(`  Generation time: ${duration}ms`);
        console.log(`  Metadata:`, JSON.stringify(result.metadata, null, 2));
      } catch (error: any) {
        console.error(`  ❌ Failed:`, error.message);
        logger.error({ error, test }, 'TTS test failed');
      }
    }
    
    console.log(`\n✅ ${providerName.toUpperCase()} tests completed\n`);
  } catch (error: any) {
    console.error(`\n❌ Provider initialization failed:`, error.message);
    logger.error({ error, providerName }, 'Provider initialization failed');
  }
}

function getVoiceId(provider: string, gender: 'male' | 'female'): string {
  const voiceMap: Record<string, { male: string; female: string }> = {
    elevenlabs: {
      male: 'eLDtXX7z65CuLasDRxrP', // Іван
      female: 'ARxhnQPZCfSLpMBASSii', // Марія
    },
    google: {
      male: 'Charon',
      female: 'Aoede',
    },
    openai: {
      male: 'cedar',
      female: 'marin',
    },
    grok: {
      male: 'rex',
      female: 'eve',
    },
  };
  
  return voiceMap[provider]?.[gender] || voiceMap.elevenlabs[gender];
}

async function main() {
  const provider = process.env.AUDIO_PROVIDER || 'elevenlabs';
  
  console.log('\n' + '='.repeat(60));
  console.log('Multi-Vendor TTS Integration Test');
  console.log('='.repeat(60));
  console.log(`Testing provider: ${provider}`);
  console.log('Output directory: services/api/audio-test-output/');
  
  // Create output directory
  const outputDir = path.join(__dirname, '../../audio-test-output');
  try {
    const fs = require('fs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`Created output directory: ${outputDir}`);
    }
  } catch (error) {
    console.error('Failed to create output directory:', error);
  }
  
  await testProvider(provider);
  
  console.log('\n' + '='.repeat(60));
  console.log('All tests completed!');
  console.log('='.repeat(60) + '\n');
}

// Run tests
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
