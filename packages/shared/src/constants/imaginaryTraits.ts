// Imaginary species (UI suggestions for inspiration, NOT validation enums)
export const IMAGINARY_SPECIES_SUGGESTIONS = [
  'dragon', 'fairy', 'unicorn', 'robot', 'monster', 'alien',
  'ghost', 'angel', 'elf', 'dwarf', 'troll', 'goblin',
  'mermaid', 'merman', 'superhero', 'wizard', 'witch',
  'talking_object', 'living_toy', 'cloud_creature', 'star_being',
  'phoenix', 'griffin', 'pegasus', 'chimera', 'sphinx'
] as const;

// Color suggestions (UI only, free text stored)
export const COLOR_SUGGESTIONS = [
  'rainbow', 'gold', 'silver', 'sparkly', 'transparent',
  'glowing', 'changing', 'purple', 'pink', 'blue', 'green',
  'red', 'yellow', 'orange', 'multicolor', 'pastel'
] as const;

// Size suggestions (UI only, free text stored)
export const SIZE_SUGGESTIONS = [
  'tiny', 'small', 'medium', 'large', 'giant', 'changes_size',
  'fits_in_pocket', 'as_tall_as_tree', 'microscopic'
] as const;

// Magical features suggestions (UI only, free text stored)
export const MAGICAL_FEATURES_SUGGESTIONS = [
  'wings', 'horns', 'tail', 'sparkles', 'glow', 'invisibility',
  'flight', 'magic_powers', 'shape_shifting', 'teleportation',
  'fire_breath', 'ice_breath', 'super_strength', 'healing',
  'mind_reading', 'time_travel', 'color_changing', 'size_changing',
  'rainbow_mane', 'golden_hooves', 'crystal_scales'
] as const;

// NO type exports - these are suggestions, not enums!
// Validation is pure z.string() for all fields
