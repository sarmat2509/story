import { Router } from 'express';
import {
  HAIR_COLORS, HAIR_STYLES, EYE_COLORS, SKIN_TONES, DISTINCTIVE_FEATURES,
  PERSONALITY_TRAITS, FAVORITE_ACTIVITIES, INTERESTS,
  COMMON_FEARS, AVOID_TOPICS,
  PET_TYPES, PET_SIZES, FUR_COLORS, FUR_PATTERNS, FUR_LENGTHS, PET_EYE_COLORS,
  CAT_BREEDS, DOG_BREEDS, PET_PERSONALITY_TRAITS, PET_ACTIVITIES, PET_DISTINCTIVE_FEATURES,
  AGE_RANGES, HUMAN_HAIR_COLORS, HUMAN_HAIR_STYLES, HEIGHTS, BUILDS,
  CLOTHING_STYLES, HUMAN_DISTINCTIVE_FEATURES,
  IMAGINARY_SPECIES_SUGGESTIONS, COLOR_SUGGESTIONS, SIZE_SUGGESTIONS, MAGICAL_FEATURES_SUGGESTIONS
} from '@kazka/shared';
import { db } from '../db';
import { storyGoals, storyTones, scenarioCards } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/v1/dictionaries/character-traits - Get type-specific traits (public)
router.get('/character-traits', async (req, res) => {
  const type = req.query.type as string;
  
  if (type === 'child') {
    return res.json({
      status: 'success',
      type: 'child',
      dictionaries: {
        hairColors: HAIR_COLORS,
        hairStyles: HAIR_STYLES,
        eyeColors: EYE_COLORS,
        skinTones: SKIN_TONES,
        distinctiveFeatures: DISTINCTIVE_FEATURES,
        personalityTraits: PERSONALITY_TRAITS,
        favoriteActivities: FAVORITE_ACTIVITIES,
        interests: INTERESTS,
        commonFears: COMMON_FEARS,
        avoidTopics: AVOID_TOPICS
      }
    });
  }
  
  if (type === 'pet') {
    return res.json({
      status: 'success',
      type: 'pet',
      dictionaries: {
        petTypes: PET_TYPES,
        sizes: PET_SIZES,
        furColors: FUR_COLORS,
        furPatterns: FUR_PATTERNS,
        furLengths: FUR_LENGTHS,
        eyeColors: PET_EYE_COLORS,
        catBreeds: CAT_BREEDS,
        dogBreeds: DOG_BREEDS,
        personalityTraits: PET_PERSONALITY_TRAITS,
        activities: PET_ACTIVITIES,
        distinctiveFeatures: PET_DISTINCTIVE_FEATURES
      }
    });
  }
  
  if (type === 'family_member' || type === 'friend' || type === 'neighbor') {
    return res.json({
      status: 'success',
      type,
      dictionaries: {
        ageRanges: AGE_RANGES,
        hairColors: HUMAN_HAIR_COLORS,
        hairStyles: HUMAN_HAIR_STYLES,
        heights: HEIGHTS,
        builds: BUILDS,
        clothingStyles: CLOTHING_STYLES,
        distinctiveFeatures: HUMAN_DISTINCTIVE_FEATURES
      }
    });
  }
  
  if (type === 'imaginary_friend') {
    return res.json({
      status: 'success',
      type: 'imaginary_friend',
      note: 'These are suggestions only - all fields accept free text',
      dictionaries: {
        speciesSuggestions: IMAGINARY_SPECIES_SUGGESTIONS,
        colorSuggestions: COLOR_SUGGESTIONS,
        sizeSuggestions: SIZE_SUGGESTIONS,
        magicalFeaturesSuggestions: MAGICAL_FEATURES_SUGGESTIONS
      }
    });
  }
  
  return res.status(400).json({
    status: 'error',
    message: 'Invalid type parameter. Must be one of: child, pet, family_member, friend, neighbor, imaginary_friend'
  });
});

// GET /api/v1/dictionaries/story-themes - Get story configuration (goals, tones, scenarios) (public)
router.get('/story-themes', async (req, res) => {
  try {
    const locale = (req.query.locale as string) || 'uk';
    
    // Fetch from database
    const [goalsData, tonesData, scenarioCardsData] = await Promise.all([
      db.select().from(storyGoals).orderBy(storyGoals.sortOrder),
      db.select().from(storyTones).orderBy(storyTones.sortOrder),
      db.select().from(scenarioCards).where(eq(scenarioCards.isActive, true)).orderBy(scenarioCards.sortOrder)
    ]);
    
    // Transform for API response
    // TODO M4: Add i18n translations based on locale
    // For M3, return English descriptions from DB
    const goals = goalsData.map(g => ({
      slug: g.slug,
      name: g.name, // TODO M4: translate using name_key
      description: g.description,
      minAge: g.minAge
    }));
    
    const tones = tonesData.map(t => ({
      slug: t.slug,
      name: t.name, // TODO M4: translate using name_key
      description: t.description,
      writingStyle: JSON.parse(t.writingStyle)
    }));
    
    // Scenario cards from DB (database-driven!)
    const scenarios = scenarioCardsData.map(sc => ({
      id: sc.id,
      name: sc.nameKey, // TODO M4: translate based on locale
      description: sc.descriptionKey, // TODO M4: translate based on locale
      icon: sc.icon,
      suggestedGoals: JSON.parse(sc.suggestedGoals),
      ageGroups: JSON.parse(sc.ageGroups)
    }));
    
    return res.json({
      status: 'success',
      data: { 
        goals, 
        tones, 
        scenarioCards: scenarios 
      }
    });
  } catch (error: unknown) {
    logger.error({ error }, 'Error fetching story themes');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch story themes'
    });
  }
});

export default router;
