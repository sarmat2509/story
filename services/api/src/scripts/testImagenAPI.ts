/**
 * Test script for Imagen 3 API integration
 * Run with: npx tsx src/scripts/testImagenAPI.ts
 */

import { config } from '../config';
import { GeminiImageProvider } from '../providers/image/gemini/GeminiImageProvider';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

async function testImagenAPI() {
  logger.info('=== Testing Imagen 3 API Integration ===');
  
  // Check configuration
  logger.info({
    projectId: config.image.gemini.projectId,
    location: config.image.gemini.location,
    hasCredentials: !!config.googleCloud.credentials || !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
  }, 'Configuration check');
  
  if (!config.image.gemini.projectId) {
    logger.error('GOOGLE_CLOUD_PROJECT is not set!');
    process.exit(1);
  }
  
  try {
    // Initialize provider
    logger.info('Initializing GeminiImageProvider...');
    const provider = new GeminiImageProvider();
    
    // Test 1: Simple text-to-image (Flow 1)
    logger.info('=== Test 1: Basic text-to-image (generate-002) ===');
    const simpleRequest = {
      prompt: 'soft watercolor children\'s book illustration, a friendly rabbit sitting in a meadow with flowers, bright sunny day, safe for children, friendly, positive, age-appropriate',
      aspectRatio: '16:9' as const,
      personGeneration: 'ALLOW_ADULT' as const,
    };
    
    logger.info({ prompt: simpleRequest.prompt.substring(0, 100) }, 'Generating simple image...');
    const simpleImage = await provider.generateImage(simpleRequest);
    
    logger.info({
      size: simpleImage.imageData.length,
      mimeType: simpleImage.mimeType,
      dimensions: `${simpleImage.width}x${simpleImage.height}`,
    }, '✅ Simple image generated successfully!');
    
    // Save test image
    const testOutputDir = path.join(__dirname, '../../test-output');
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
    
    const outputPath = path.join(testOutputDir, `test-simple-${Date.now()}.png`);
    fs.writeFileSync(outputPath, simpleImage.imageData);
    logger.info({ outputPath }, '💾 Image saved');
    
    // Test 2: Portrait generation (Flow 0)
    logger.info('=== Test 2: Character portrait (generate-002, 1:1) ===');
    const portraitRequest = {
      prompt: 'soft watercolor children\'s book illustration, character portrait, close-up view, brave young knight with shining armor and kind eyes, clear details, front-facing, safe for children, friendly, avoid: scary, violent',
      aspectRatio: '1:1' as const,
      personGeneration: 'ALLOW_ADULT' as const,
    };
    
    logger.info({ prompt: portraitRequest.prompt.substring(0, 100) }, 'Generating portrait...');
    const portraitImage = await provider.generateImage(portraitRequest);
    
    logger.info({
      size: portraitImage.imageData.length,
      mimeType: portraitImage.mimeType,
      dimensions: `${portraitImage.width}x${portraitImage.height}`,
    }, '✅ Portrait generated successfully!');
    
    const portraitPath = path.join(testOutputDir, `test-portrait-${Date.now()}.png`);
    fs.writeFileSync(portraitPath, portraitImage.imageData);
    logger.info({ outputPath: portraitPath }, '💾 Portrait saved');
    
    logger.info('=== ✅ All tests passed! ===');
    logger.info({
      testOutputDir,
      note: 'Check the test-output directory for generated images',
    }, 'Test completed successfully');
    
  } catch (error: any) {
    logger.error({ 
      error: error.message, 
      stack: error.stack 
    }, '❌ Test failed');
    
    // Provide helpful error messages
    if (error.message.includes('Failed to obtain access token')) {
      logger.error('Authentication failed. Check:');
      logger.error('1. GOOGLE_APPLICATION_CREDENTIALS path is correct');
      logger.error('2. Service account key file exists and is readable');
      logger.error('3. Service account has "Vertex AI User" role');
    } else if (error.message.includes('403')) {
      logger.error('Permission denied. Make sure service account has:');
      logger.error('- roles/aiplatform.user (Vertex AI User)');
      logger.error('- Vertex AI API is enabled in the project');
    } else if (error.message.includes('404')) {
      logger.error('API endpoint not found. Check:');
      logger.error('1. GOOGLE_CLOUD_PROJECT is correct');
      logger.error('2. GOOGLE_CLOUD_LOCATION is correct (us-central1)');
      logger.error('3. Vertex AI API is enabled');
    }
    
    process.exit(1);
  }
}

// Run test
testImagenAPI();
