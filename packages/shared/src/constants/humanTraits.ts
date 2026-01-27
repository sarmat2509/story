// Age ranges for humans
export const AGE_RANGES = [
  'child', 'teenager', 'adult', 'middle_aged', 'elderly'
] as const;

// Human hair colors
export const HUMAN_HAIR_COLORS = [
  'blonde', 'light_brown', 'dark_brown', 'black', 'red', 'auburn',
  'grey', 'white', 'salt_and_pepper'
] as const;

// Human hair styles
export const HUMAN_HAIR_STYLES = [
  'short', 'medium', 'long', 'very_long', 'bald',
  'curly', 'wavy', 'straight', 'braided', 'ponytail', 'bun'
] as const;

// Heights
export const HEIGHTS = [
  'very_short', 'short', 'average', 'tall', 'very_tall'
] as const;

// Builds
export const BUILDS = [
  'slim', 'average', 'athletic', 'heavyset'
] as const;

// Clothing styles
export const CLOTHING_STYLES = [
  'casual', 'formal', 'sporty', 'traditional', 'vintage', 'modern'
] as const;

// Human distinctive features
export const HUMAN_DISTINCTIVE_FEATURES = [
  'glasses', 'sunglasses', 'beard', 'mustache', 'wrinkles',
  'kind_smile', 'freckles', 'mole', 'scar', 'tattoo',
  'earrings', 'necklace', 'hat', 'cap'
] as const;

// Type exports
export type AgeRange = typeof AGE_RANGES[number];
export type HumanHairColor = typeof HUMAN_HAIR_COLORS[number];
export type HumanHairStyle = typeof HUMAN_HAIR_STYLES[number];
export type Height = typeof HEIGHTS[number];
export type Build = typeof BUILDS[number];
export type ClothingStyle = typeof CLOTHING_STYLES[number];
export type HumanDistinctiveFeature = typeof HUMAN_DISTINCTIVE_FEATURES[number];
