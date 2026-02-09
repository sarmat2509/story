/**
 * Audio Settings Test Script
 * 
 * Tests different ElevenLabs voice settings and pause markup (SSML + v3 tags)
 * Generates audio samples and saves them with descriptive names
 * 
 * Usage:
 *   npx tsx src/scripts/testAudioSettings.ts
 *   npx tsx src/scripts/testAudioSettings.ts --voice-id <voice_id>
 *   npx tsx src/scripts/testAudioSettings.ts --package 1,3,5
 */

import { config } from '../config';
import { logger } from '../utils/logger';
import { ElevenLabsTestProvider } from './test-utils/ElevenLabsTestProvider';
import { TEST_CONFIGS, BASE_TEXT } from './test-utils/audioTestConfigs';
import * as fs from 'fs/promises';
import * as path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const voiceIdArg = args.find(arg => arg.startsWith('--voice-id='))?.split('=')[1];
const packageFilter = args.find(arg => arg.startsWith('--package='))
  ?.split('=')[1]
  ?.split(',')
  .map(p => parseInt(p.trim()));

// Output directory
const OUTPUT_DIR = path.join(process.cwd(), 'audio-test-output');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

/**
 * Get default Ukrainian voice from database or use fallback
 */
async function getDefaultVoice(): Promise<string> {
  // Try to get from database
  try {
    const { db } = await import('../db');
    const { ttsVoices } = await import('../db/schema');
    const { eq, and } = await import('drizzle-orm');
    
    const [voice] = await db
      .select()
      .from(ttsVoices)
      .where(and(
        eq(ttsVoices.language, 'uk'),
        eq(ttsVoices.isActive, true)
      ))
      .limit(1);
    
    if (voice) {
      logger.info({ voiceId: voice.providerVoiceId, name: voice.name }, 'Using voice from database');
      return voice.providerVoiceId;
    }
  } catch (error) {
    logger.warn({ error }, 'Could not query database for voice');
  }
  
  // Fallback: Use a known good Ukrainian voice ID
  logger.info('Using fallback voice ID');
  return 'pNInz6obpgDQGcFmaJgB'; // Example voice ID - replace with actual
}

/**
 * Generate audio for one test configuration
 */
async function generateAudioSample(
  provider: ElevenLabsTestProvider,
  voiceId: string,
  testConfig: typeof TEST_CONFIGS[0]
): Promise<void> {
  logger.info(
    { 
      configId: testConfig.id, 
      model: testConfig.model,
      voiceId 
    },
    `Generating audio: ${testConfig.name}`
  );

  try {
    const result = await provider.synthesizeWithModel({
      text: BASE_TEXT, // Plain text (not used)
      rawText: testConfig.text, // SSML or v3-tagged text
      voiceId,
      language: 'uk',
      model: testConfig.model,
      prosody: {
        speed: testConfig.voiceSettings.speed,
        stability: testConfig.voiceSettings.stability,
        similarity_boost: testConfig.voiceSettings.similarity_boost,
        style: testConfig.voiceSettings.style,
        use_speaker_boost: testConfig.voiceSettings.use_speaker_boost,
      } as any,
    });

    // Create filename with descriptive info
    const filename = `${TIMESTAMP}_${testConfig.id}_${testConfig.model}.mp3`;
    const filepath = path.join(OUTPUT_DIR, filename);
    
    await fs.writeFile(filepath, result.audioData);

    // Create metadata file
    const metadataPath = filepath.replace('.mp3', '.json');
    const metadata = {
      id: testConfig.id,
      name: testConfig.name,
      description: testConfig.description,
      model: testConfig.model,
      voiceId,
      voiceSettings: testConfig.voiceSettings,
      text: testConfig.text,
      timestamp: new Date().toISOString(),
      fileSizeBytes: result.audioData.length,
      durationSeconds: result.durationSeconds,
    };
    
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    logger.info(
      { 
        filename, 
        sizeKB: Math.round(result.audioData.length / 1024),
        duration: result.durationSeconds 
      },
      'Audio generated successfully'
    );

  } catch (error: any) {
    logger.error(
      { 
        error: error.message, 
        configId: testConfig.id,
        model: testConfig.model 
      },
      'Failed to generate audio'
    );
    throw error;
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  ElevenLabs Audio Settings Test Script                ║');
  console.log('║  Tests: SSML breaks + v3 pause/audio tags             ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Check API key
  const apiKey = process.env.ELEVENLABS_API_KEY || config.audio?.elevenlabs?.apiKey;
  if (!apiKey) {
    console.error('❌ Error: ELEVENLABS_API_KEY is not set');
    console.error('Set ELEVENLABS_API_KEY in .env file\n');
    process.exit(1);
  }

  // Get voice ID
  const voiceId = voiceIdArg || await getDefaultVoice();
  
  console.log('🔧 Configuration:');
  console.log(`  Voice ID: ${voiceId}`);
  console.log(`  API Key: ${apiKey.substring(0, 10)}...`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Timestamp: ${TIMESTAMP}\n`);

  // Filter packages if specified
  const configsToTest = packageFilter
    ? TEST_CONFIGS.filter((_, i) => packageFilter.includes(i + 1))
    : TEST_CONFIGS;

  console.log(`📦 Testing ${configsToTest.length} packages:\n`);
  configsToTest.forEach((cfg, i) => {
    console.log(`  ${i + 1}. ${cfg.name} (${cfg.model})`);
    console.log(`     ${cfg.description}`);
  });
  console.log('');

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Initialize provider
  const provider = new ElevenLabsTestProvider(apiKey);

  // Generate all samples
  console.log('🎙️  Generating audio samples...\n');
  
  for (const [index, testConfig] of configsToTest.entries()) {
    console.log(`[${index + 1}/${configsToTest.length}] ${testConfig.name}`);
    try {
      await generateAudioSample(provider, voiceId, testConfig);
      console.log('');
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}\n`);
      // Continue with next package
    }
  }

  // Create summary file
  const summaryPath = path.join(OUTPUT_DIR, `${TIMESTAMP}_SUMMARY.md`);
  let summary = `# Audio Test Results\n\n`;
  summary += `**Timestamp:** ${new Date().toISOString()}\n`;
  summary += `**Voice ID:** ${voiceId}\n`;
  summary += `**Packages Tested:** ${configsToTest.length}\n\n`;
  summary += `## Test Configurations\n\n`;
  
  configsToTest.forEach((cfg, i) => {
    summary += `### ${i + 1}. ${cfg.name}\n\n`;
    summary += `- **ID:** ${cfg.id}\n`;
    summary += `- **Model:** ${cfg.model}\n`;
    summary += `- **Description:** ${cfg.description}\n`;
    summary += `- **Voice Settings:**\n`;
    summary += `  - Stability: ${cfg.voiceSettings.stability}\n`;
    summary += `  - Similarity Boost: ${cfg.voiceSettings.similarity_boost}\n`;
    summary += `  - Style: ${cfg.voiceSettings.style}\n`;
    summary += `  - Speed: ${cfg.voiceSettings.speed}\n`;
    summary += `  - Speaker Boost: ${cfg.voiceSettings.use_speaker_boost}\n`;
    summary += `- **File:** \`${TIMESTAMP}_${cfg.id}_${cfg.model}.mp3\`\n\n`;
    summary += `**Text with markup:**\n\`\`\`\n${cfg.text}\n\`\`\`\n\n`;
  });

  await fs.writeFile(summaryPath, summary);

  console.log('✅ All audio samples generated!');
  console.log(`📁 Output directory: ${OUTPUT_DIR}`);
  console.log(`📝 Summary: ${summaryPath}\n`);
}

// Run test
main().catch(error => {
  logger.error({ error: error.message, stack: error.stack }, 'Test failed');
  console.error('\n❌ Test script failed:', error.message);
  process.exit(1);
});
