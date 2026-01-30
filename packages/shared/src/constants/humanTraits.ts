// Age ranges for humans
export const AGE_RANGES = [
  'child', 'teenager', 'adult', 'middle_aged', 'elderly'
] as const;

// Human hair colors (extends child hair colors with additional aging colors)
export const HUMAN_HAIR_COLORS = [
  'blonde', 'light_brown', 'dark_brown', 'black', 'red', 'auburn',
  'grey', 'white', 'salt_and_pepper'
] as const;

// Human hair lengths
export const HUMAN_HAIR_LENGTHS = [
  'bald', 'very_short', 'short', 'medium', 'long', 'very_long'
] as const;

// Human hair styles
export const HUMAN_HAIR_STYLES = [
  'straight', 'wavy', 'curly', 'coily', 'braided', 'ponytail', 'bun',
  'afro', 'dreadlocks', 'mohawk', 'side_part', 'slicked_back'
] as const;

// Face shapes
export const FACE_SHAPES = [
  'round', 'oval', 'square', 'heart', 'long'
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

// Clothing items (distinctive pieces)
export const CLOTHING_ITEMS = [
  'jacket', 'coat', 'sweater', 'hoodie', 'shirt', 'blouse', 't-shirt',
  'dress', 'skirt', 'pants', 'jeans', 'shorts',
  'tie', 'bow_tie', 'scarf', 'belt',
  'boots', 'shoes', 'sneakers', 'sandals',
  'uniform', 'suit', 'blazer', 'vest'
] as const;

// Accessories
export const ACCESSORIES = [
  'hat', 'cap', 'beanie', 'helmet',
  'glasses', 'sunglasses',
  'watch', 'bracelet', 'ring',
  'necklace', 'earrings', 'pendant',
  'bag', 'backpack', 'purse',
  'gloves', 'mittens',
  'headband', 'hair_clip', 'bow'
] as const;

// Clothing colors (common colors for clothes)
export const CLOTHING_COLORS = [
  'white', 'black', 'grey', 'light_grey', 'dark_grey',
  'red', 'dark_red', 'pink', 'light_pink',
  'blue', 'light_blue', 'dark_blue', 'navy',
  'green', 'light_green', 'dark_green', 'olive',
  'yellow', 'orange', 'brown', 'beige', 'tan',
  'purple', 'violet', 'burgundy',
  'multicolor', 'patterned', 'striped', 'checkered'
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
export type HumanHairLength = typeof HUMAN_HAIR_LENGTHS[number];
export type HumanHairStyle = typeof HUMAN_HAIR_STYLES[number];
export type FaceShape = typeof FACE_SHAPES[number];
export type Height = typeof HEIGHTS[number];
export type Build = typeof BUILDS[number];
export type ClothingStyle = typeof CLOTHING_STYLES[number];
export type ClothingItem = typeof CLOTHING_ITEMS[number];
export type Accessory = typeof ACCESSORIES[number];
export type ClothingColor = typeof CLOTHING_COLORS[number];
export type HumanDistinctiveFeature = typeof HUMAN_DISTINCTIVE_FEATURES[number];
