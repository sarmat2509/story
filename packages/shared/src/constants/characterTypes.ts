/**
 * Character Types Constants
 * Централізовані константи для типів персонажів
 */

export const CHARACTER_TYPES = [
  'person',
  'animal',
  'imaginary'
] as const;

export type CharacterType = typeof CHARACTER_TYPES[number];

/**
 * Person Subtypes
 */
export const PERSON_SUBTYPES = [
  'mother',
  'father',
  'grandmother',
  'grandfather',
  'brother',
  'sister',
  'aunt',
  'uncle',
  'cousin_brother',
  'cousin_sister',
  'best_friend',
  'classmate',
  'neighbor',
  'teacher',
  'godparent',
  'nanny',
  'doctor',
  'other_adult',
  'other_child'
] as const;

export type PersonSubtype = typeof PERSON_SUBTYPES[number];

/**
 * Animal Subtypes
 */
export const ANIMAL_SUBTYPES = [
  'dog',
  'cat',
  'hamster',
  'parrot',
  'rabbit',
  'turtle',
  'fish',
  'goat',
  'cow',
  'horse',
  'other_animal'
] as const;

export type AnimalSubtype = typeof ANIMAL_SUBTYPES[number];

/**
 * Imaginary Character Subtypes
 */
export const IMAGINARY_SUBTYPES = [
  'dragon',
  'unicorn',
  'fairy',
  'elf',
  'gnome',
  'wizard',
  'witch',
  'ghost',
  'robot',
  'alien',
  'toy',
  'drawing',
  'imaginary_friend',
  'other_creature'
] as const;

export type ImaginarySubtype = typeof IMAGINARY_SUBTYPES[number];

export type CharacterSubtype = PersonSubtype | AnimalSubtype | ImaginarySubtype;

/**
 * Helper функція для перевірки чи є персонаж людиною
 */
export const isHumanType = (type: CharacterType): boolean => {
  return type === 'person';
};

/**
 * Helper функція для перевірки чи є персонаж твариною
 */
export const isAnimalType = (type: CharacterType): boolean => {
  return type === 'animal';
};

/**
 * Helper функція для перевірки чи є персонаж уявним другом
 */
export const isImaginaryType = (type: CharacterType): boolean => {
  return type === 'imaginary';
};
