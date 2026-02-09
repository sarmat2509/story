#!/usr/bin/env tsx

import { writeFileSync } from 'fs';
import path from 'path';
import { config } from '../config';
import { ElevenLabsProvider } from '../providers/audio/elevenlabs/ElevenLabsProvider';

// Ukrainian test text (same as voice comparison)
const UKRAINIAN_TEST_TEXT = `Емілія сиділа на сонячному ґанку, розгорнувши велику, трохи пожовклу карту. Її молодший братик Максим притулився поруч, заглядаючи через плече. "Дивись, Максиме," – сказала Емілія, вказуючи пальчиком на маленьке зображення серед дерев. "Це ж стара теплиця! Мама розповідала, що там колись росли дивовижні квіти." Максим широко розплющив очі. "Квіти?" – прошепотів він.`;

async function main() {
  console.log('============================================================');
  console.log('ElevenLabs Voice Test - Ivan (Male)');
  console.log('============================================================');
  console.log(`Text: "${UKRAINIAN_TEST_TEXT.substring(0, 80)}..."`);
  console.log(`Text length: ${UKRAINIAN_TEST_TEXT.length} characters\n`);

  // Create ElevenLabs provider
  const provider = new ElevenLabsProvider(
    config.audio.elevenlabs.apiKey,
    config.audio.elevenlabs.model
  );

  // Ivan voice ID
  const voiceId = 'eLDtXX7z65CuLasDRxrP';
  const voiceName = 'Іван';

  console.log(`▶ Testing: ELEVENLABS - ${voiceName} (male)`);
  console.log(`  Voice ID: ${voiceId}`);
  console.log(`  Model: ${config.audio.elevenlabs.model}\n`);

  try {
    const startTime = Date.now();

    const response = await provider.synthesize({
      text: UKRAINIAN_TEST_TEXT,
      voiceId,
      language: 'uk',
    });

    const generationTime = Date.now() - startTime;

    // Save to voice comparison directory
    const outputDir = path.join(process.cwd(), 'audio-voice-comparison');
    const filename = 'elevenlabs-ivan-ukrainian-test.mp3';
    const filepath = path.join(outputDir, filename);
    
    writeFileSync(filepath, response.audioData);

    console.log(`  ✅ Success: ${filename}`);
    console.log(`  Duration: ${response.durationSeconds}s`);
    console.log(`  Generation time: ${generationTime}ms`);
    console.log(`  File size: ${(response.audioData.length / 1024).toFixed(2)} KB`);
    console.log(`  Saved to: ${filepath}`);

    console.log('\n============================================================');
    console.log('Comparison with other providers:');
    console.log('============================================================');
    console.log('Provider     | Voice      | Gender | Time      | Size');
    console.log('-------------|------------|--------|-----------|-------------');
    console.log('ElevenLabs   | Іван       | male   | ' + generationTime.toString().padEnd(9) + ' | ' + (response.audioData.length / 1024).toFixed(1) + ' KB');
    console.log('OpenAI       | Седар      | male   | 6837ms    | 578.3 KB');
    console.log('Google       | Харон      | male   | 14505ms   | 128.1 KB');
    console.log('Google       | Пак        | male   | 13860ms   | 124.8 KB');
    
    console.log('\n============================================================');
    console.log('✅ Test completed!');
    console.log('============================================================\n');

  } catch (error: any) {
    console.log(`  ❌ Failed: ${error.message}`);
    throw error;
  }
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
