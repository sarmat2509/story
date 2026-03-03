/**
 * Test script for Imagen 4 Fast API (environment images)
 * Run with: npx tsx src/scripts/testImagen4Fast.ts
 *
 * Requires: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GOOGLE_APPLICATION_CREDENTIALS
 */

import { config } from '../config';
import { getEnvironmentImageProvider } from '../services/aiService';
import { buildEnvironmentImagePrompt } from '../prompts/image';
import type { StoryEnvironment } from '../ai/types';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

async function testImagen4Fast() {
  logger.info('=== Testing Imagen 4 Fast API (Environment Images) ===');

  // Check configuration
  const projectId = config.image.imagen4Fast?.projectId || config.image.gemini.projectId;
  const location = config.image.imagen4Fast?.location || config.image.gemini.location;

  logger.info({
    projectId,
    location,
    hasCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  }, 'Configuration check');

  if (!projectId) {
    logger.error('GOOGLE_CLOUD_PROJECT is not set!');
    process.exit(1);
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    logger.error('GOOGLE_APPLICATION_CREDENTIALS is not set! Required for Vertex AI.');
    process.exit(1);
  }

  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!fs.existsSync(credsPath)) {
    logger.error({ path: credsPath }, 'Credentials file not found!');
    process.exit(1);
  }

  try {
    logger.info('Initializing Imagen 4 Fast provider...');
    const provider = getEnvironmentImageProvider();

    // Test environment (like from LLM)
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
      'Environment image generated successfully'
    );

    // Save test image
    const testOutputDir = path.join(__dirname, '../../test-output');
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }

    const outputPath = path.join(testOutputDir, `test-imagen4fast-env-${Date.now()}.png`);
    const buffer = Buffer.isBuffer(result.imageData) ? result.imageData : Buffer.from(result.imageData as string, 'base64');
    fs.writeFileSync(outputPath, buffer);

    logger.info({ outputPath }, 'Image saved');

    logger.info('=== All tests passed! ===');
    logger.info({ testOutputDir }, 'Check test-output directory for generated image');
  } catch (error: any) {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Test failed'
    );

    if (error.message.includes('Failed to obtain access token')) {
      logger.error('Authentication failed. Check:');
      logger.error('1. GOOGLE_APPLICATION_CREDENTIALS path is correct (use /app/secrets/... inside Docker)');
      logger.error('2. Service account key file exists and is readable');
      logger.error('3. Service account has "Vertex AI User" role');
    } else if (error.message.includes('403')) {
      logger.error('Permission denied. Ensure service account has roles/aiplatform.user');
    } else if (error.message.includes('404')) {
      logger.error('API not found. Check project, location, and that Vertex AI API is enabled.');
    }

    process.exit(1);
  }
}

testImagen4Fast();
