/**
 * Playground Script for Testing Image Generation
 * 
 * Tests:
 * 1. Character Analysis with Gemini Vision
 * 2. Nano Banana Pro image generation with references
 * 3. Full workflow: Analysis → First scene → Subsequent scenes with reference
 * 
 * Usage:
 * - Test character analysis: npx tsx scripts/playgroundImageGen.ts --test-analysis --photo-url https://...
 * - Test reference generation: npx tsx scripts/playgroundImageGen.ts --test-reference --characters 2 --scenes 3
 * - Test full workflow: npx tsx scripts/playgroundImageGen.ts --full-workflow --child-photos https://... --scenes 5
 */

import { config } from '../src/config';
import { CharacterAnalysisService } from '../src/services/characterAnalysisService';
import { GeminiTextProvider } from '../src/providers/text/gemini/GeminiTextProvider';
import { NanoBananaProProvider } from '../src/providers/image/nanobananapro/NanoBananaProProvider';
import { ImageDomainService } from '../src/domain/image/ImageDomainService';
import { buildReferenceInstruction } from '../src/prompts/image/ImagePrompts';
import fs from 'fs/promises';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const testType = args.find(arg => arg.startsWith('--test-'))?.replace('--test-', '') || 
                 (args.includes('--full-workflow') ? 'full-workflow' : 'reference');
const photoUrl = args.find(arg => arg.startsWith('--photo-url='))?.split('=')[1];
const childPhotos = args.find(arg => arg.startsWith('--child-photos='))?.split('=')[1]?.split(',');
const characterCount = parseInt(args.find(arg => arg.startsWith('--characters='))?.split('=')[1] || '2');
const sceneCount = parseInt(args.find(arg => arg.startsWith('--scenes='))?.split('=')[1] || '3');

// Output directory for generated images
const OUTPUT_DIR = path.join(process.cwd(), 'playground-output');

/**
 * Test character analysis with Gemini Vision
 */
async function testCharacterAnalysis() {
  console.log('\n🔍 Testing Character Analysis with Gemini Vision...\n');
  
  if (!photoUrl) {
    console.error('❌ Error: --photo-url is required for character analysis test');
    console.log('Example: npx tsx scripts/playgroundImageGen.ts --test-analysis --photo-url=https://...');
    return;
  }
  
  try {
    const textProvider = new GeminiTextProvider(config.google.apiKey);
    const analysisService = new CharacterAnalysisService(textProvider);
    
    console.log('📸 Analyzing photo:', photoUrl);
    console.log('⏳ Calling Gemini Vision API...\n');
    
    const result = await analysisService.analyzeCharacter({
      photos: [photoUrl],
      characterType: 'person'
    });
    
    console.log('✅ Analysis complete!\n');
    console.log('📝 DETAILED DESCRIPTION:');
    console.log(result.detailedDescription);
    console.log('\n👤 APPEARANCE TRAITS:');
    console.log(JSON.stringify(result.appearanceTraits, null, 2));
    console.log('\n👕 CLOTHING:');
    console.log(JSON.stringify(result.clothing, null, 2));
    console.log('\n⭐ DISTINCTIVE FEATURES:');
    console.log(JSON.stringify(result.distinctiveFeatures, null, 2));
    
    // Save result to file
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const outputFile = path.join(OUTPUT_DIR, 'character-analysis.json');
    await fs.writeFile(outputFile, JSON.stringify(result, null, 2));
    console.log(`\n💾 Analysis saved to: ${outputFile}`);
    
  } catch (error) {
    console.error('❌ Character analysis failed:', error);
    throw error;
  }
}

/**
 * Test Nano Banana Pro with reference images
 */
async function testReferenceGeneration() {
  console.log('\n🎨 Testing Nano Banana Pro with Reference Images...\n');
  
  try {
    const imageProvider = new NanoBananaProProvider(config.google.apiKey);
    const imageDomain = new ImageDomainService(imageProvider);
    
    // Create mock character descriptions
    const characterDescriptions = [];
    for (let i = 0; i < characterCount; i++) {
      characterDescriptions.push({
        name: `Character ${i + 1}`,
        detailedDescription: `A cheerful ${i % 2 === 0 ? 'boy' : 'girl'} with ${['blonde', 'brown', 'black'][i % 3]} hair and ${['blue', 'green', 'brown'][i % 3]} eyes`,
        clothing: { style: 'casual', colors: ['red', 'blue'] },
        distinctiveFeatures: ['smiling', 'energetic']
      });
    }
    
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const logFile = path.join(OUTPUT_DIR, 'generation-log.txt');
    let log = '';
    
    // Generate first scene (no reference)
    console.log('🖼️  Generating Scene 1 (no reference)...');
    const firstScenePrompt = 'Children playing in a sunny park with trees and swings';
    log += `\n=== SCENE 1 (No Reference) ===\n`;
    log += `Prompt: ${firstScenePrompt}\n`;
    log += `Characters: ${characterDescriptions.length}\n\n`;
    
    const firstImage = await imageDomain.generateSceneWithReference({
      visualPrompt: firstScenePrompt,
      sceneId: 1,
      ageGroup: '4-5',
      style: 'soft_watercolor',
      characterDescriptions,
      referenceImage: undefined, // No reference for first scene
    });
    
    const firstImagePath = path.join(OUTPUT_DIR, 'scene-1.png');
    await fs.writeFile(firstImagePath, firstImage.imageData);
    console.log(`✅ Scene 1 saved to: ${firstImagePath}\n`);
    
    // Mock first scene URL (in real usage this would be a storage URL)
    const firstSceneUrl = `file://${firstImagePath}`;
    
    // Generate remaining scenes in parallel (all use first scene as reference)
    console.log(`🚀 Generating ${sceneCount - 1} scenes in parallel with reference...\n`);
    
    const scenePrompts = [
      'Children running through a flower garden',
      'Children having a picnic under a big tree',
      'Children building a sandcastle on the beach',
      'Children reading books in a cozy library',
      'Children flying kites on a hilltop'
    ];
    
    const scenePromises = [];
    for (let i = 1; i < sceneCount; i++) {
      const sceneNumber = i + 1;
      const scenePrompt = scenePrompts[i] || `Scene ${sceneNumber}: Children in different activity`;
      
      log += `\n=== SCENE ${sceneNumber} (With Reference) ===\n`;
      log += `Prompt: ${scenePrompt}\n`;
      log += `Reference: Scene 1\n`;
      log += `Instruction: ${buildReferenceInstruction()}\n\n`;
      
      scenePromises.push(
        imageDomain.generateSceneWithReference({
          visualPrompt: scenePrompt,
          sceneId: sceneNumber,
          ageGroup: '4-5',
          style: 'soft_watercolor',
          characterDescriptions,
          referenceImage: {
            url: firstImagePath, // Use local path for testing
            instructionText: buildReferenceInstruction()
          },
        }).then(async (image) => {
          const scenePath = path.join(OUTPUT_DIR, `scene-${sceneNumber}.png`);
          await fs.writeFile(scenePath, image.imageData);
          console.log(`✅ Scene ${sceneNumber} saved to: ${scenePath}`);
        })
      );
    }
    
    await Promise.all(scenePromises);
    
    console.log('\n✅ All scenes generated!\n');
    
    // Save log
    await fs.writeFile(logFile, log);
    console.log(`📝 Generation log saved to: ${logFile}`);
    console.log(`📁 All files in: ${OUTPUT_DIR}\n`);
    
  } catch (error) {
    console.error('❌ Reference generation test failed:', error);
    throw error;
  }
}

/**
 * Test full workflow: Analysis → Generation with reference
 */
async function testFullWorkflow() {
  console.log('\n🔄 Testing Full Workflow: Analysis + Generation...\n');
  
  if (!childPhotos || childPhotos.length === 0) {
    console.error('❌ Error: --child-photos is required for full workflow test');
    console.log('Example: npx tsx scripts/playgroundImageGen.ts --full-workflow --child-photos=https://photo1.jpg,https://photo2.jpg --scenes=5');
    return;
  }
  
  try {
    // Step 1: Analyze character photos
    console.log('📸 Step 1: Analyzing character photos...');
    const textProvider = new GeminiTextProvider(config.google.apiKey);
    const analysisService = new CharacterAnalysisService(textProvider);
    
    const analysis = await analysisService.analyzeCharacter({
      photos: childPhotos,
      characterType: 'person'
    });
    
    console.log('✅ Analysis complete');
    console.log('Description:', analysis.detailedDescription);
    console.log('');
    
    // Step 2: Generate images with reference
    console.log('🎨 Step 2: Generating images with Nano Banana Pro...\n');
    
    const imageProvider = new NanoBananaProProvider(config.google.apiKey);
    const imageDomain = new ImageDomainService(imageProvider);
    
    const characterDescriptions = [{
      name: 'Main Character',
      detailedDescription: analysis.detailedDescription,
      clothing: analysis.clothing,
      distinctiveFeatures: analysis.distinctiveFeatures
    }];
    
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Generate first scene
    console.log('🖼️  Generating Scene 1 (no reference)...');
    const firstImage = await imageDomain.generateSceneWithReference({
      visualPrompt: 'Child playing in a magical forest with sparkling trees',
      sceneId: 1,
      ageGroup: '4-5',
      style: 'soft_watercolor',
      characterDescriptions,
      referenceImage: undefined,
    });
    
    const firstImagePath = path.join(OUTPUT_DIR, 'workflow-scene-1.png');
    await fs.writeFile(firstImagePath, firstImage.imageData);
    console.log(`✅ Scene 1 saved\n`);
    
    // Generate remaining scenes in parallel
    console.log(`🚀 Generating ${sceneCount - 1} more scenes in parallel...\n`);
    
    const scenePrompts = [
      'Child discovering a hidden treasure chest',
      'Child meeting friendly forest animals',
      'Child climbing a tall tree',
      'Child resting by a crystal-clear stream'
    ];
    
    const scenePromises = [];
    for (let i = 1; i < sceneCount; i++) {
      const sceneNumber = i + 1;
      scenePromises.push(
        imageDomain.generateSceneWithReference({
          visualPrompt: scenePrompts[i - 1] || `Scene ${sceneNumber}`,
          sceneId: sceneNumber,
          ageGroup: '4-5',
          style: 'soft_watercolor',
          characterDescriptions,
          referenceImage: {
            url: firstImagePath,
            instructionText: buildReferenceInstruction()
          },
        }).then(async (image) => {
          const scenePath = path.join(OUTPUT_DIR, `workflow-scene-${sceneNumber}.png`);
          await fs.writeFile(scenePath, image.imageData);
          console.log(`✅ Scene ${sceneNumber} saved`);
        })
      );
    }
    
    await Promise.all(scenePromises);
    
    // Save analysis result
    const analysisPath = path.join(OUTPUT_DIR, 'workflow-analysis.json');
    await fs.writeFile(analysisPath, JSON.stringify(analysis, null, 2));
    
    console.log('\n✅ Full workflow complete!');
    console.log(`📁 All files saved to: ${OUTPUT_DIR}\n`);
    
  } catch (error) {
    console.error('❌ Full workflow test failed:', error);
    throw error;
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Playground: Character Analysis & Image Generation   ║');
  console.log('║  Nano Banana Pro (Gemini 2.5 Flash Image)             ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  
  // Check API key
  if (!config.google.apiKey) {
    console.error('\n❌ Error: GOOGLE_API_KEY is not set');
    console.log('Set GOOGLE_API_KEY in .env file\n');
    process.exit(1);
  }
  
  console.log(`\n🔧 Configuration:`);
  console.log(`  Model: ${config.nanoBanana?.model || 'gemini-2.5-flash-image'}`);
  console.log(`  API Key: ${config.google.apiKey.substring(0, 10)}...`);
  console.log(`  Test Type: ${testType}\n`);
  
  try {
    switch (testType) {
      case 'analysis':
        await testCharacterAnalysis();
        break;
      case 'reference':
        await testReferenceGeneration();
        break;
      case 'full-workflow':
        await testFullWorkflow();
        break;
      default:
        console.log('Available tests:');
        console.log('  --test-analysis --photo-url=<url>');
        console.log('  --test-reference --characters=2 --scenes=3');
        console.log('  --full-workflow --child-photos=<url1>,<url2> --scenes=5');
        break;
    }
    
    console.log('\n✨ Playground test completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Playground test failed:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
