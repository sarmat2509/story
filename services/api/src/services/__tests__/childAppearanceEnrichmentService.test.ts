import assert from 'node:assert/strict';
import { enrichChildAppearanceOnCreate } from '../childAppearanceEnrichmentService';

async function main(): Promise<void> {
  let photoAnalysisCalls = 0;
  const photoAnalyzer = {
    analyzeCharacter: async () => {
      photoAnalysisCalls += 1;
      return {
        detailedDescription: 'A child with long brown hair and freckles.',
        appearanceTraits: {
          hairColor: 'dark_brown',
          hairLength: 'long',
          skinTone: 'light',
          faceShape: 'oval', // Not a child-profile field and must not persist.
        },
        distinctiveFeatures: ['freckles'],
      };
    },
    extractChildAppearanceFromDescription: async () => {
      throw new Error('description extraction must not run when photos are available');
    },
  } as any;

  const fromPhotos = await enrichChildAppearanceOnCreate(
    { referencePhotoUrls: ['https://assets.example/child.jpg'] },
    photoAnalyzer
  );
  assert.equal(photoAnalysisCalls, 1);
  assert.deepEqual(fromPhotos.appearanceTraits, {
    hairColor: 'dark_brown',
    hairLength: 'long',
    skinTone: 'light',
    distinctiveFeatures: ['freckles'],
  });
  assert.equal(fromPhotos.aiGeneratedDescription, 'A child with long brown hair and freckles.');

  let descriptionExtractionCalls = 0;
  const descriptionAnalyzer = {
    analyzeCharacter: async () => {
      throw new Error('photo analysis must not run without photos');
    },
    extractChildAppearanceFromDescription: async () => {
      descriptionExtractionCalls += 1;
      return {
        appearanceTraits: { hairColor: 'red', eyeColor: 'green', skinTone: null },
        distinctiveFeatures: ['glasses'],
      };
    },
  } as any;

  const fromDescription = await enrichChildAppearanceOnCreate(
    {
      referencePhotoUrls: [],
      description: 'У дитини руде волосся, зелені очі та окуляри.',
      descriptionLanguage: 'uk',
    },
    descriptionAnalyzer
  );
  assert.equal(descriptionExtractionCalls, 1);
  assert.deepEqual(fromDescription.appearanceTraits, {
    hairColor: 'red',
    eyeColor: 'green',
    distinctiveFeatures: ['glasses'],
  });

  const submittedTraits = await enrichChildAppearanceOnCreate(
    {
      referencePhotoUrls: ['https://assets.example/child.jpg'],
      appearanceTraits: { hairColor: 'black' },
    },
    {
      analyzeCharacter: async () => {
        return {
          detailedDescription: '',
          appearanceTraits: { hairColor: 'brown', eyeColor: 'green' },
          distinctiveFeatures: [],
        };
      },
      extractChildAppearanceFromDescription: async () => {
        throw new Error('existing parent-selected traits must not be overwritten');
      },
    } as any
  );
  assert.deepEqual(submittedTraits.appearanceTraits, {
    hairColor: 'black',
    eyeColor: 'green',
  });

  console.log('child appearance enrichment tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
