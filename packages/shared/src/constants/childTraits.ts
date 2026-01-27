// Appearance enums
export const HAIR_COLORS = [
  'blonde', 'light_brown', 'dark_brown', 'black', 'red', 'auburn', 'grey'
] as const;

export const HAIR_STYLES = [
  'short', 'medium', 'long', 'very_long', 'curly', 'wavy', 'straight', 'braided'
] as const;

export const EYE_COLORS = [
  'blue', 'light_blue', 'dark_blue', 'green', 'hazel', 'brown', 'dark_brown', 'grey'
] as const;

export const SKIN_TONES = [
  'very_light', 'light', 'medium', 'tan', 'brown', 'dark_brown', 'very_dark'
] as const;

export const DISTINCTIVE_FEATURES = [
  'freckles', 'dimples', 'curly_hair', 'glasses', 'birthmark', 'round_face', 'oval_face'
] as const;

// Personality enums
export const PERSONALITY_TRAITS = [
  'curious', 'brave', 'shy', 'energetic', 'calm', 'thoughtful', 'playful',
  'creative', 'analytical', 'empathetic', 'independent', 'sociable', 'careful',
  'adventurous', 'sensitive', 'confident', 'patient', 'impulsive'
] as const;

export const FAVORITE_ACTIVITIES = [
  'reading', 'drawing', 'painting', 'sports', 'football', 'swimming', 'dancing',
  'singing', 'music', 'playing_instruments', 'building', 'crafts', 'cooking',
  'nature', 'animals', 'computers', 'puzzles', 'board_games'
] as const;

// Interests enum
export const INTERESTS = [
  'dinosaurs', 'space', 'animals', 'cars', 'trains', 'planes', 'ships',
  'princesses', 'knights', 'dragons', 'magic', 'science', 'nature',
  'ocean', 'forest', 'robots', 'superheroes', 'fairy_tales', 'adventure',
  'family', 'friends', 'school', 'sports'
] as const;

// Fears/Sensitivities enums
export const COMMON_FEARS = [
  'dark', 'loud_noises', 'monsters', 'being_alone', 'strangers', 'heights',
  'animals', 'doctors', 'thunder', 'separation_from_parents'
] as const;

export const AVOID_TOPICS = [
  'darkness', 'scary_creatures', 'violence', 'being_lost', 'abandonment',
  'death', 'illness', 'conflict', 'loud_situations'
] as const;

// Type exports
export type HairColor = typeof HAIR_COLORS[number];
export type HairStyle = typeof HAIR_STYLES[number];
export type EyeColor = typeof EYE_COLORS[number];
export type SkinTone = typeof SKIN_TONES[number];
export type DistinctiveFeature = typeof DISTINCTIVE_FEATURES[number];
export type PersonalityTrait = typeof PERSONALITY_TRAITS[number];
export type FavoriteActivity = typeof FAVORITE_ACTIVITIES[number];
export type Interest = typeof INTERESTS[number];
export type CommonFear = typeof COMMON_FEARS[number];
export type AvoidTopic = typeof AVOID_TOPICS[number];
