import { db } from '../db';
import { ttsVoices } from '../db/schema';
import { eq } from 'drizzle-orm';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { PUBLIC_SEO_LOCALES } from '@wondertales/shared';
import { getLocalizedVoiceDisplayName, getVoiceSamplePath } from '../utils/voicePresentation';

const uploadsRoot = path.resolve(__dirname, '../..', 'uploads');

async function checkVoiceSamples() {
  const voices = await db
    .select({
      name: ttsVoices.name,
      displayName: ttsVoices.displayName,
      providerVoiceId: ttsVoices.providerVoiceId,
      provider: ttsVoices.provider,
      language: ttsVoices.language,
      isPremium: ttsVoices.isPremium,
    })
    .from(ttsVoices)
    .where(eq(ttsVoices.isActive, true));

  const missing: string[] = [];

  console.log('\n=== Voice Samples Status ===');
  console.log(`Uploads root: ${uploadsRoot}\n`);

  for (const locale of PUBLIC_SEO_LOCALES) {
    console.log(`-- ${locale} --`);

    for (const voice of voices) {
      const displayName = getLocalizedVoiceDisplayName(voice.name, locale, voice.displayName);
      const samplePath = getVoiceSamplePath(voice.providerVoiceId, locale);
      const fullPath = path.resolve(uploadsRoot, samplePath);

      try {
        await access(fullPath);
        const file = await stat(fullPath);
        console.log(`OK ${displayName} (${voice.provider}${voice.isPremium ? ', premium' : ''}): ${samplePath} (${file.size} bytes)`);
      } catch {
        missing.push(`${locale}: ${displayName} -> ${samplePath}`);
        console.log(`MISSING ${displayName} (${voice.provider}${voice.isPremium ? ', premium' : ''}): ${samplePath}`);
      }
    }

    console.log('');
  }

  const total = voices.length * PUBLIC_SEO_LOCALES.length;
  const present = total - missing.length;
  console.log(`Total expected: ${total}, present: ${present}, missing: ${missing.length}`);

  if (missing.length > 0) {
    console.log('\nMissing samples:');
    missing.forEach((item) => console.log(`- ${item}`));
    process.exit(1);
  }
}

checkVoiceSamples()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
