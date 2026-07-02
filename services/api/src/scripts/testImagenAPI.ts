/**
 * Smoke test for Gemini 2.5 Flash Image (legacy name kept for muscle memory).
 * Run with: npx tsx src/scripts/testImagenAPI.ts
 *
 * Requires: GOOGLE_API_KEY (same as Nano Banana / main image stack)
 */

import { config } from '../config';
import { NanoBananaProProvider } from '../providers/image/nanobananapro/NanoBananaProProvider';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

async function testFlashImageApi() {
  logger.info('=== Testing Gemini Flash Image (generateContent) ===');

  logger.info(
    {
      model: config.image.simpleModel,
      hasApiKey: !!config.google.apiKey,
    },
    'Configuration check',
  );

  if (!config.google.apiKey) {
    logger.error('GOOGLE_API_KEY is not set!');
    process.exit(1);
  }

  try {
    const provider = new NanoBananaProProvider(
      config.google.apiKey,
      config.image.simpleModel,
    );

    logger.info('=== Test 1: Basic text-to-image ===');
    const simpleRequest = {
      prompt:
        "soft watercolor children's book illustration, a friendly rabbit sitting in a meadow with flowers, bright sunny day, safe for children, friendly, positive, age-appropriate",
      aspectRatio: '16:9' as const,
      personGeneration: 'ALLOW_ADULT' as const,
    };

    logger.info({ prompt: simpleRequest.prompt.substring(0, 100) }, 'Generating simple image...');
    const simpleImage = await provider.generateImage(simpleRequest);

    logger.info(
      {
        size: simpleImage.imageData.length,
        mimeType: simpleImage.mimeType,
        dimensions: `${simpleImage.width}x${simpleImage.height}`,
      },
      'Simple image generated successfully',
    );

    const testOutputDir = path.join(__dirname, '../../test-output');
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }

    const outputPath = path.join(testOutputDir, `test-simple-${Date.now()}.png`);
    fs.writeFileSync(outputPath, simpleImage.imageData);
    logger.info({ outputPath }, 'Image saved');

    logger.info('=== Test 2: Portrait (1:1) ===');
    const portraitRequest = {
      prompt:
        "soft watercolor children's book illustration, character portrait, close-up view, brave young knight with shining armor and kind eyes, clear details, front-facing, safe for children, friendly, avoid: scary, violent",
      aspectRatio: '1:1' as const,
      personGeneration: 'ALLOW_ADULT' as const,
    };

    const portraitImage = await provider.generateImage(portraitRequest);
    const portraitPath = path.join(testOutputDir, `test-portrait-${Date.now()}.png`);
    fs.writeFileSync(portraitPath, portraitImage.imageData);
    logger.info({ outputPath: portraitPath }, 'Portrait saved');

    logger.info('=== All tests passed ===');
  } catch (error: unknown) {
    const err = error as Error;
    logger.error({ error: err.message, stack: err.stack }, 'Test failed');
    process.exit(1);
  }
}

testFlashImageApi();
