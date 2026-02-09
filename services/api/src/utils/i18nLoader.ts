import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const TRANSLATIONS_DIR = path.join(__dirname, '../../../..', 'packages/shared/src/i18n');

/**
 * Load voice sample text from i18n files
 * Used by backend scripts to get demo text for voice sample generation
 */
export function getVoiceSampleText(language: string): string {
  try {
    const filePath = path.join(TRANSLATIONS_DIR, `${language}.json`);
    
    if (!fs.existsSync(filePath)) {
      logger.warn({ language, filePath }, 'Translation file not found, falling back to Ukrainian');
      // Fallback to Ukrainian if language file doesn't exist
      const fallbackPath = path.join(TRANSLATIONS_DIR, 'uk.json');
      const fallbackTranslations = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
      return fallbackTranslations.voice_sample_text;
    }
    
    const translations = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    if (!translations.voice_sample_text) {
      throw new Error(`voice_sample_text not found in ${language}.json`);
    }
    
    return translations.voice_sample_text;
  } catch (error) {
    logger.error({ error, language }, 'Failed to load voice sample text');
    throw error;
  }
}
