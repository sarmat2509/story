import { db } from '../db';
import { ttsVoices } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

async function checkVoiceSamples() {
  const voices = await db
    .select({
      name: ttsVoices.name,
      displayName: ttsVoices.displayName,
      provider: ttsVoices.provider,
      language: ttsVoices.language,
      sampleAudioUrl: ttsVoices.sampleAudioUrl,
    })
    .from(ttsVoices)
    .where(eq(ttsVoices.language, 'uk'));
  
  console.log('\n=== Voice Samples Status ===\n');
  voices.forEach(v => {
    const status = v.sampleAudioUrl ? '✅' : '❌';
    console.log(`${status} ${v.displayName} (${v.provider}): ${v.sampleAudioUrl || 'NO SAMPLE'}`);
  });
  console.log(`\nTotal: ${voices.length}, With samples: ${voices.filter(v => v.sampleAudioUrl).length}\n`);
  
  process.exit(0);
}

checkVoiceSamples().catch(console.error);
