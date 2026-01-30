/**
 * Character Types Constants
 * Централізовані константи для типів персонажів
 */

export const CHARACTER_TYPES = [
  'pet',
  'family_member',
  'friend',
  'neighbor',
  'imaginary_friend'
] as const;

export type CharacterType = typeof CHARACTER_TYPES[number];

/**
 * Helper функція для перевірки чи є персонаж людиною
 */
export const isHumanType = (type: CharacterType): boolean => {
  return ['family_member', 'friend', 'neighbor'].includes(type);
};

/**
 * Helper функція для перевірки чи є персонаж домашньою твариною
 */
export const isPetType = (type: CharacterType): boolean => {
  return type === 'pet';
};

/**
 * Helper функція для перевірки чи є персонаж уявним другом
 */
export const isImaginaryType = (type: CharacterType): boolean => {
  return type === 'imaginary_friend';
};
