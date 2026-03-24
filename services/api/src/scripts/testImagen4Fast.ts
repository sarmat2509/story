/**
 * Test environment image provider (Gemini 2.5 Flash Image via GOOGLE_API_KEY).
 * Run with: npx tsx src/scripts/testImagen4Fast.ts
 *
 * Requires: GOOGLE_API_KEY
 */

import { config } from '../config';
import { getEnvironmentImageProvider } from '../services/aiService';
import { buildEnvironmentImagePrompt } from '../prompts/image';
import type { StoryEnvironment } from '../ai/types';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

async function testEnvironmentImageProvider() {
  logger.info('=== Testing environment image provider (Gemini Flash Image) ===');

  logger.info(
    {
      model: config.image.flashImageModel,
      hasApiKey: !!config.google.apiKey,
    },
    'Configuration check',
  );

  if (!config.google.apiKey) {
    logger.error('GOOGLE_API_KEY is not set!');
    process.exit(1);
  }

  try {
    const provider = getEnvironmentImageProvider();

    const testEnvironment: StoryEnvironment = {
      id: 'test_canyon',
      name: 'Canyon',
      description:
        'A colorful desert canyon with red and orange rock formations, narrow passage between tall cliffs, warm sunlight from above.',
    };

    const prompt = buildEnvironmentImagePrompt({
      environment: testEnvironment,
    });

    logger.info({ prompt: prompt.substring(0, 150) }, 'Generating environment image...');

    const result = await provider.generateImage({
      prompt,
      aspectRatio: '16:9',
    });

    logger.info(
      {
        size: result.imageData.length,
        mimeType: result.mimeType,
        dimensions: `${result.width}x${result.height}`,
      },
      'Environment image generated successfully',
    );

    const testOutputDir = path.join(__dirname, '../../test-output');
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }

    const outputPath = path.join(testOutputDir, `test-env-image-${Date.now()}.png`);
    const buffer = Buffer.isBuffer(result.imageData)
      ? result.imageData
      : Buffer.from(result.imageData as string, 'base64');
    fs.writeFileSync(outputPath, buffer);

    logger.info({ outputPath }, 'Image saved');
    logger.info('=== All tests passed ===');
  } catch (error: unknown) {
    const err = error as Error;
    logger.error({ error: err.message, stack: err.stack }, 'Test failed');
    process.exit(1);
  }
}

testEnvironmentImageProvider();
