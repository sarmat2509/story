import { z } from 'zod';
import { LOCALE_IDS } from '../config/languages';

// Locale schema - dynamically generated from config
export const LocaleSchema = z.enum(LOCALE_IDS as [string, ...string[]]);

// Age group schema
export const AgeGroupSchema = z.enum(['1y', '2-3', '4-5', '6-8', '9-12']);

// Story goal schema
export const StoryGoalSchema = z.enum([
  'friendship',
  'kindness',
  'empathy',
  'help_parents',
  'independence',
  'courage',
  'sharing',
  'safety',
]);

// Story tone schema
export const StoryToneSchema = z.enum(['calm', 'adventure', 'humor', 'lullaby', 'educational']);

// Art style schema
export const ArtStyleSchema = z.enum([
  'soft_watercolor',
  'colored_pencil',
  'comic_line',
  'anime_light',
  'warm_3d',
  'night_calm',
  'felt_craft',
  'clay',
]);

// Child profile schema
export const ChildProfileSchema = z.object({
  child_id: z.string().uuid(),
  name: z.string().min(1).max(50),
  age_months: z.number().int().min(0).max(200),
  age_group: AgeGroupSchema,
  language: LocaleSchema,
  interests: z.array(z.string()).default([]),
  sensitivities: z.object({
    fear: z.enum(['none', 'low', 'medium']).default('low'),
    avoid_topics: z.array(z.string()).default([]),
  }),
  family_cast: z
    .object({
      mom_name: z.string().optional(),
      dad_name: z.string().optional(),
    })
    .optional(),
  pet: z
    .object({
      type: z.string(),
      name: z.string(),
    })
    .optional(),
});

// Story request schema
export const StoryRequestSchema = z.object({
  request_id: z.string().uuid(),
  child_id: z.string().uuid(),
  mode: z.enum(['single', 'series']).default('single'),
  ui_locale: LocaleSchema,
  story_language: LocaleSchema,
  goal: StoryGoalSchema,
  tone: StoryToneSchema,
  length: z.enum(['auto', 'short', 'medium', 'long']).default('auto'),
  image_style: ArtStyleSchema,
  include_family: z.boolean().default(false),
  seed_elements: z
    .object({
      scenario_card_id: z.string().optional(),
      user_notes: z.string().optional(),
      upload_asset_ids: z.array(z.string()).optional(),
    })
    .optional(),
});

// Policy profile schema
export const PolicyProfileSchema = z.object({
  policy_version: z.string(),
  age_group: AgeGroupSchema,
  language: LocaleSchema,
  allowed_themes: z.array(StoryGoalSchema),
  disallowed: z.array(z.string()),
  fear_level_max: z.number().int().min(0).max(3),
  moral_style: z.enum(['show_dont_tell', 'explicit']),
  constraints: z.object({
    must_have_happy_ending: z.boolean(),
    no_shaming_language: z.boolean(),
    no_real_person_impersonation: z.boolean(),
  }),
  readability: z.object({
    max_sentence_len: z.number().int(),
    target_words_range: z.tuple([z.number().int(), z.number().int()]),
    dialog_ratio: z.number().min(0).max(1),
  }),
});

// Export type inference helpers
export type ChildProfileInput = z.input<typeof ChildProfileSchema>;
export type ChildProfileOutput = z.output<typeof ChildProfileSchema>;
export type StoryRequestInput = z.input<typeof StoryRequestSchema>;
export type StoryRequestOutput = z.output<typeof StoryRequestSchema>;

// OAuth validation schemas (added for API auth validation)
export const GoogleProfileSchema = z.object({
  id: z.string(),
  email: z.string().email().max(255),
  name: z.string().max(255),
  picture: z.string().url().optional(),
});

export const AppleProfileSchema = z.object({
  sub: z.string(),
  email: z.string().email().max(255).optional(),
  name: z.object({
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
  }).optional(),
});

export const GoogleTokenSchema = z.object({
  idToken: z.string(),
  deviceInfo: z.object({
    name: z.string().max(255).optional(),
    type: z.enum(['ios', 'android', 'web']).optional(),
  }).optional(),
});

export const AppleTokenSchema = z.object({
  idToken: z.string(),
  user: z.object({
    name: z.object({
      firstName: z.string().max(100).optional(),
      lastName: z.string().max(100).optional(),
    }).optional(),
  }).optional(),
  deviceInfo: z.object({
    name: z.string().max(255).optional(),
    type: z.enum(['ios', 'android', 'web']).optional(),
  }).optional(),
});

// ==========================================
// Milestone 2: Child Profiles & Characters
// ==========================================

import {
  HAIR_COLORS, HAIR_STYLES, EYE_COLORS, SKIN_TONES, DISTINCTIVE_FEATURES,
  PERSONALITY_TRAITS, FAVORITE_ACTIVITIES, INTERESTS,
  COMMON_FEARS, AVOID_TOPICS
} from '../constants/childTraits';

import {
  PET_SIZES, FUR_COLORS, FUR_PATTERNS, FUR_LENGTHS, PET_EYE_COLORS,
  CAT_BREEDS, DOG_BREEDS, PET_PERSONALITY_TRAITS, PET_ACTIVITIES, PET_DISTINCTIVE_FEATURES
} from '../constants/petTraits';

import {
  AGE_RANGES, HUMAN_HAIR_COLORS, HUMAN_HAIR_STYLES, HEIGHTS, BUILDS,
  CLOTHING_STYLES, HUMAN_DISTINCTIVE_FEATURES
} from '../constants/humanTraits';

// Child Profile Schemas
export const CreateChildProfileSchema = z.object({
  name: z.string().min(1).max(100),
  birthDate: z.coerce.date().max(new Date(), 'Birth date cannot be in future'),
  gender: z.enum(['girl', 'boy', 'other']).optional(),
  
  // Languages array (min 1, max 3)
  languages: z.array(LocaleSchema).min(1).max(3),
  
  // Reference photos (optional)
  referencePhotos: z.array(z.object({
    url: z.string().url(),
    purpose: z.enum(['face', 'full_body']),
    uploadedAt: z.coerce.date()
  })).max(5).optional(),
  
  // Appearance traits (select from enums)
  appearanceTraits: z.object({
    hairColor: z.enum(HAIR_COLORS).optional(),
    hairStyle: z.enum(HAIR_STYLES).optional(),
    eyeColor: z.enum(EYE_COLORS).optional(),
    skinTone: z.enum(SKIN_TONES).optional(),
    distinctiveFeatures: z.array(z.enum(DISTINCTIVE_FEATURES)).max(3).optional()
  }).optional(),
  
  // Personality (select from enums, max 5 each)
  personality: z.object({
    traits: z.array(z.enum(PERSONALITY_TRAITS)).max(5).optional(),
    favoriteActivities: z.array(z.enum(FAVORITE_ACTIVITIES)).max(5).optional()
  }).optional(),
  
  // Interests (select from enum, max 7)
  interests: z.array(z.enum(INTERESTS)).max(7).optional(),
  
  // Sensitivities (select from enums)
  sensitivities: z.object({
    fearLevel: z.enum(['none', 'low', 'medium', 'high']).optional(),
    commonFears: z.array(z.enum(COMMON_FEARS)).max(5).optional(),
    avoidTopics: z.array(z.enum(AVOID_TOPICS)).max(5).optional()
  }).optional(),
  
  // Family cast (free text names)
  familyCast: z.record(z.string().max(100)).optional()
});

export const UpdateChildProfileSchema = CreateChildProfileSchema.partial();

// Character Schemas (Type-specific)

// Base character schema
const BaseCharacterSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['pet', 'family_member', 'friend', 'neighbor', 'imaginary_friend']),
  
  // Reference photos (optional, not for imaginary)
  referencePhotos: z.array(z.object({
    url: z.string().url(),
    purpose: z.enum(['full_body', 'face', 'action']),
    uploadedAt: z.coerce.date()
  })).max(5).optional(),
  
  // Optional free text description
  description: z.string().max(500).optional()
});

// Pet-specific appearance traits
const PetAppearanceSchema = z.object({
  breed: z.union([z.enum(CAT_BREEDS), z.enum(DOG_BREEDS), z.string()]).optional(),
  furColor: z.enum(FUR_COLORS).optional(),
  furPattern: z.enum(FUR_PATTERNS).optional(),
  furLength: z.enum(FUR_LENGTHS).optional(),
  size: z.enum(PET_SIZES).optional(),
  eyeColor: z.enum(PET_EYE_COLORS).optional(),
  distinctiveFeatures: z.array(z.enum(PET_DISTINCTIVE_FEATURES)).max(5).optional()
});

const PetPersonalitySchema = z.object({
  traits: z.array(z.enum(PET_PERSONALITY_TRAITS)).max(5).optional(),
  favoriteActivities: z.array(z.enum(PET_ACTIVITIES)).max(5).optional()
});

// Human-specific appearance traits
const HumanAppearanceSchema = z.object({
  ageRange: z.enum(AGE_RANGES).optional(),
  hairColor: z.enum(HUMAN_HAIR_COLORS).optional(),
  hairStyle: z.enum(HUMAN_HAIR_STYLES).optional(),
  eyeColor: z.enum(EYE_COLORS).optional(), // reuse from child
  skinTone: z.enum(SKIN_TONES).optional(), // reuse from child
  height: z.enum(HEIGHTS).optional(),
  build: z.enum(BUILDS).optional(),
  clothing: z.enum(CLOTHING_STYLES).optional(),
  distinctiveFeatures: z.array(z.enum(HUMAN_DISTINCTIVE_FEATURES)).max(5).optional()
});

const HumanPersonalitySchema = z.object({
  traits: z.array(z.string()).max(5).optional(), // free text for humans
  favoriteActivities: z.array(z.string()).max(5).optional()
});

// Imaginary-specific appearance traits (ALL FREE TEXT!)
const ImaginaryAppearanceSchema = z.object({
  species: z.string().max(100).optional(), // pure free text (UI shows random suggestions)
  primaryColor: z.string().max(50).optional(), // pure free text
  secondaryColor: z.string().max(50).optional(), // pure free text
  size: z.string().max(50).optional(), // pure free text (UI shows random suggestions)
  magicalFeatures: z.array(z.string().max(50)).max(10).optional(), // pure free text array (UI suggestions)
  customDescription: z.string().max(500).optional() // full description
});

const ImaginaryPersonalitySchema = z.object({
  traits: z.array(z.string().max(50)).max(5).optional(), // free text
  favoriteActivities: z.array(z.string().max(50)).max(5).optional()
});

// Main character schema with discriminated union
export const CreateCharacterSchema = BaseCharacterSchema.and(
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('pet'),
      appearanceTraits: PetAppearanceSchema.optional(),
      personality: PetPersonalitySchema.optional()
    }),
    z.object({
      type: z.enum(['family_member', 'friend', 'neighbor']),
      appearanceTraits: HumanAppearanceSchema.optional(),
      personality: HumanPersonalitySchema.optional()
    }),
    z.object({
      type: z.literal('imaginary_friend'),
      appearanceTraits: ImaginaryAppearanceSchema.optional(),
      personality: ImaginaryPersonalitySchema.optional(),
      referencePhotos: z.undefined() // not allowed for imaginary
    })
  ])
);

export const UpdateCharacterSchema = BaseCharacterSchema.partial().and(
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('pet'),
      appearanceTraits: PetAppearanceSchema.optional(),
      personality: PetPersonalitySchema.optional()
    }),
    z.object({
      type: z.enum(['family_member', 'friend', 'neighbor']),
      appearanceTraits: HumanAppearanceSchema.optional(),
      personality: HumanPersonalitySchema.optional()
    }),
    z.object({
      type: z.literal('imaginary_friend'),
      appearanceTraits: ImaginaryAppearanceSchema.optional(),
      personality: ImaginaryPersonalitySchema.optional(),
      referencePhotos: z.undefined() // not allowed for imaginary
    })
  ]).optional()
);

// Type exports
export type CreateChildProfileInput = z.infer<typeof CreateChildProfileSchema>;
export type UpdateChildProfileInput = z.infer<typeof UpdateChildProfileSchema>;
export type CreateCharacterInput = z.infer<typeof CreateCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof UpdateCharacterSchema>;

// ==========================================
// Milestone 3: Story Generation
// ==========================================

export const CreateStoryRequestSchema = z.object({
  childProfileId: z.string().uuid().optional(),
  uiLocale: LocaleSchema,
  storyLanguage: LocaleSchema,
  goal: z.string().max(50).optional(), // DB-driven, slug from story_goals
  tone: z.string().max(50).optional(), // DB-driven, slug from story_tones
  scenarioCardId: z.string().max(100).optional(), // DB-driven, from scenario_cards
  userNotes: z.string().max(500).optional(),
  includeFamily: z.boolean().default(false),
  selectedCharacters: z.array(z.string().uuid()).max(5).optional()
});

export type CreateStoryRequestInput = z.infer<typeof CreateStoryRequestSchema>;

