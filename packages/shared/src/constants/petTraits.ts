// Pet types
export const PET_TYPES = [
  'cat', 'dog', 'hamster', 'rabbit', 'guinea_pig', 'parrot', 'fish',
  'turtle', 'horse'
] as const;

// Pet sizes
export const PET_SIZES = ['tiny', 'small', 'medium', 'large', 'giant'] as const;

// Fur colors
export const FUR_COLORS = [
  'black', 'white', 'grey', 'light_grey', 'dark_grey',
  'brown', 'light_brown', 'dark_brown',
  'orange', 'red', 'cream', 'golden', 'yellow',
  'orange_tabby', 'grey_tabby', 'brown_tabby',
  'black_white', 'brown_white', 'grey_white', 'tri_color'
] as const;

// Fur patterns
export const FUR_PATTERNS = [
  'solid', 'striped', 'spotted', 'patched', 'bicolor', 'tricolor', 'tuxedo'
] as const;

// Fur lengths
export const FUR_LENGTHS = ['hairless', 'short', 'medium', 'long', 'curly'] as const;

// Pet eye colors
export const PET_EYE_COLORS = [
  'blue', 'green', 'yellow', 'amber', 'brown', 'dark_brown', 'odd_eyed'
] as const;

// Cat breeds
export const CAT_BREEDS = [
  'mixed', 'persian', 'siamese', 'british_shorthair', 'maine_coon',
  'scottish_fold', 'sphynx', 'bengal', 'ragdoll', 'abyssinian'
] as const;

// Dog breeds
export const DOG_BREEDS = [
  'mixed', 'labrador', 'german_shepherd', 'golden_retriever', 'bulldog',
  'poodle', 'husky', 'corgi', 'dachshund', 'beagle', 'chihuahua',
  'yorkshire_terrier', 'boxer', 'shiba_inu', 'pomeranian'
] as const;

// Pet personality traits
export const PET_PERSONALITY_TRAITS = [
  'playful', 'lazy', 'curious', 'friendly', 'shy', 'energetic',
  'calm', 'protective', 'independent', 'affectionate', 'smart',
  'loyal', 'mischievous', 'gentle', 'bold'
] as const;

// Pet activities
export const PET_ACTIVITIES = [
  'sleeping', 'playing', 'chasing_toys', 'eating', 'running',
  'swimming', 'digging', 'climbing', 'hunting', 'cuddling',
  'fetching', 'rolling', 'jumping', 'hiding'
] as const;

// Pet distinctive features
export const PET_DISTINCTIVE_FEATURES = [
  'fluffy_tail', 'short_tail', 'no_tail', 'long_tail',
  'white_paws', 'black_nose', 'pink_nose', 'brown_nose',
  'floppy_ears', 'pointy_ears', 'short_ears',
  'long_whiskers', 'collar', 'bow', 'bandana',
  'spot_on_eye', 'white_chest', 'white_belly'
] as const;

// Type exports
export type PetType = typeof PET_TYPES[number];
export type PetSize = typeof PET_SIZES[number];
export type FurColor = typeof FUR_COLORS[number];
export type FurPattern = typeof FUR_PATTERNS[number];
export type FurLength = typeof FUR_LENGTHS[number];
export type PetEyeColor = typeof PET_EYE_COLORS[number];
export type CatBreed = typeof CAT_BREEDS[number];
export type DogBreed = typeof DOG_BREEDS[number];
export type PetPersonalityTrait = typeof PET_PERSONALITY_TRAITS[number];
export type PetActivity = typeof PET_ACTIVITIES[number];
export type PetDistinctiveFeature = typeof PET_DISTINCTIVE_FEATURES[number];
