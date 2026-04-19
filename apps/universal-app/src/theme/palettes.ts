import { THEME_PALETTE_IDS, type ThemePaletteId } from '@wondertales/shared';

/**
 * One palette definition — exactly the shape consumed by `colors.ts`.
 * All ~70 screens keep importing `theme.colors.*` / `theme.semanticColors.*`
 * unchanged; only the values behind those keys change per palette.
 */
export interface PaletteDefinition {
  // Primary 50→900 ramp
  primary: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
  // Semantic overrides
  background: {
    primary: string;
    secondary: string;
    hero: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  border: {
    light: string;
  };
}

/** Metadata used by the palette picker UI. */
export interface PaletteMeta {
  /** i18n key for the human-readable palette name */
  labelKey: string;
  /** Three swatches to preview the palette on a card */
  swatches: [string, string, string];
}

// ---------------------------------------------------------------------------
// Palette registry
// ---------------------------------------------------------------------------

export const PALETTE_REGISTRY: Record<ThemePaletteId, PaletteDefinition> = {
  // 1. Dusk Lavender — current default, matches Welcome hero dreamscape
  dusk_lavender: {
    primary: {
      50: '#F6F1FC',
      100: '#E9DFFA',
      200: '#D8C7F2',
      300: '#C7B6EC',
      400: '#A99CE0',
      500: '#7B66C7',
      600: '#5A45A3',
      700: '#3B2E6E',
      800: '#2A2054',
      900: '#1B1340',
    },
    background: { primary: '#FFFFFF', secondary: '#F4EEFB', hero: '#FDF5E6' },
    text: { primary: '#1B1340', secondary: '#574B7C', tertiary: '#64748B' },
    border: { light: '#ECE4F5' },
  },

  // 2. Sunset Peach — warm coral / peach + cream
  sunset_peach: {
    primary: {
      50: '#FFF5EE',
      100: '#FFE5D4',
      200: '#FFCAA8',
      300: '#FFAC7D',
      400: '#FF8E55',
      500: '#F16A3A',
      600: '#D14E24',
      700: '#9E3A1A',
      800: '#702712',
      900: '#441508',
    },
    background: { primary: '#FFFDFB', secondary: '#FFF1E6', hero: '#FFE6D1' },
    text: { primary: '#3D1A0C', secondary: '#7A4632', tertiary: '#8C5A47' },
    border: { light: '#FADBC4' },
  },

  // 3. Forest Mint — sage / mint + ivory
  forest_mint: {
    primary: {
      50: '#F1F9F4',
      100: '#DBEFDF',
      200: '#B5DFBE',
      300: '#8BCB9A',
      400: '#63B478',
      500: '#3F9958',
      600: '#2F7A44',
      700: '#225931',
      800: '#173E22',
      900: '#0C2615',
    },
    background: { primary: '#FFFFFD', secondary: '#ECF5EE', hero: '#F7F3E4' },
    text: { primary: '#15331F', secondary: '#3F6A4B', tertiary: '#6B7F72' },
    border: { light: '#D5E7D9' },
  },

  // 4. Ocean Breeze — aqua / teal + off-white
  ocean_breeze: {
    primary: {
      50: '#EEF8FB',
      100: '#D1EEF5',
      200: '#A3DDEA',
      300: '#6FC6D8',
      400: '#3FABC0',
      500: '#1E8DA3',
      600: '#166F82',
      700: '#0F5361',
      800: '#093843',
      900: '#052128',
    },
    background: { primary: '#FBFEFF', secondary: '#E8F4F7', hero: '#F3FAFB' },
    text: { primary: '#072F39', secondary: '#2B5E6B', tertiary: '#5A7A82' },
    border: { light: '#CEE6EC' },
  },

  // 5. Berry Wine — deep rose / wine + blush
  berry_wine: {
    primary: {
      50: '#FCF0F4',
      100: '#F6D8E1',
      200: '#ECAFC1',
      300: '#DE829E',
      400: '#C85878',
      500: '#A83D5C',
      600: '#832D46',
      700: '#5D1F32',
      800: '#3E1522',
      900: '#230C14',
    },
    background: { primary: '#FFFBFD', secondary: '#FBEFF3', hero: '#FAE4EC' },
    text: { primary: '#2E0D18', secondary: '#6B2E42', tertiary: '#8C5869' },
    border: { light: '#F0D4DD' },
  },

  // 6. Vanilla Cream — muted mocha / caramel + ivory
  vanilla_cream: {
    primary: {
      50: '#F8F3EC',
      100: '#EEE2D1',
      200: '#DFCAAD',
      300: '#CDAE86',
      400: '#B68F5E',
      500: '#9A7442',
      600: '#7B5A33',
      700: '#5B4124',
      800: '#3E2C18',
      900: '#25190D',
    },
    background: { primary: '#FFFDF8', secondary: '#F5ECDD', hero: '#F3E8D1' },
    text: { primary: '#2A1F10', secondary: '#5E4A31', tertiary: '#7F6C55' },
    border: { light: '#E8DCC4' },
  },

  // 7. Midnight Blue — deep indigo + soft sky
  midnight_blue: {
    primary: {
      50: '#EEF1F9',
      100: '#D3DAEF',
      200: '#A8B5DF',
      300: '#7D8ECD',
      400: '#566BB8',
      500: '#3A4E9E',
      600: '#2C3C7A',
      700: '#1E2B5A',
      800: '#141D3E',
      900: '#0A1025',
    },
    background: { primary: '#FCFDFF', secondary: '#E9EEF8', hero: '#DCE4F3' },
    text: { primary: '#0A1428', secondary: '#374363', tertiary: '#5C6885' },
    border: { light: '#D2DAE9' },
  },

  // 8. Storybook Watercolor — pastel rainbow on warm white
  storybook_watercolor: {
    primary: {
      50: '#FAF1F8',
      100: '#F2DEEE',
      200: '#E4BCDD',
      300: '#CF96C6',
      400: '#B578AE',
      500: '#995B92',
      600: '#7A4874',
      700: '#5A3555',
      800: '#3E233A',
      900: '#251522',
    },
    background: { primary: '#FFFBF6', secondary: '#F9EEF3', hero: '#FBF0E4' },
    text: { primary: '#2C1A28', secondary: '#6A4763', tertiary: '#8A6B82' },
    border: { light: '#EBDAE2' },
  },

  // 9. Candy Pop — vivid fuchsia / magenta + cool white
  candy_pop: {
    primary: {
      50: '#FDEAF6',
      100: '#F9C6E6',
      200: '#F28DCC',
      300: '#E958B1',
      400: '#D9319A',
      500: '#B91B82',
      600: '#901564',
      700: '#680F48',
      800: '#430930',
      900: '#23051A',
    },
    background: { primary: '#FFFFFF', secondary: '#FEF1F8', hero: '#FDE4F1' },
    text: { primary: '#26051C', secondary: '#6B1C4E', tertiary: '#8A4F72' },
    border: { light: '#F5D3E5' },
  },

  // 10. Slate Modern — neutral graphite + crisp white
  slate_modern: {
    primary: {
      50: '#F2F4F7',
      100: '#DEE3EB',
      200: '#BDC6D3',
      300: '#97A3B5',
      400: '#707E93',
      500: '#4F5D73',
      600: '#3B485B',
      700: '#2A3342',
      800: '#1C222C',
      900: '#0F131A',
    },
    background: { primary: '#FFFFFF', secondary: '#F2F4F7', hero: '#E9ECF1' },
    text: { primary: '#0F131A', secondary: '#3B485B', tertiary: '#707E93' },
    border: { light: '#DBE0E7' },
  },

  // 11. Dino Jungle — moss green + sand / amber (prehistoric jungle)
  dino_jungle: {
    primary: {
      50: '#F4FAF1',
      100: '#E4F0DC',
      200: '#C8E2B8',
      300: '#A3CF8E',
      400: '#7CB563',
      500: '#5A943F',
      600: '#457A32',
      700: '#365E29',
      800: '#2A4A21',
      900: '#1E3318',
    },
    background: { primary: '#FFFCF7', secondary: '#F3EDE3', hero: '#FFF1D6' },
    text: { primary: '#1E2B16', secondary: '#4A5C3C', tertiary: '#6B7565' },
    border: { light: '#D8E5CE' },
  },

  // 12. Cyber Hack — electric green / cyan “terminal” energy on soft mint-gray
  cyber_hack: {
    primary: {
      50: '#ECFDF8',
      100: '#CFFAE8',
      200: '#9AF0D1',
      300: '#5EE0B5',
      400: '#2DD4A3',
      500: '#14B891',
      600: '#0D9A78',
      700: '#0F7664',
      800: '#115E52',
      900: '#0A3D36',
    },
    background: { primary: '#FAFDFC', secondary: '#ECFDF5', hero: '#E0FFF4' },
    text: { primary: '#052E28', secondary: '#14532D', tertiary: '#3F6B5E' },
    border: { light: '#A7F3D0' },
  },

  // 13. Sports Arena — bold stadium blue + crisp light (jersey / pitch energy)
  sports_arena: {
    primary: {
      50: '#EFF6FF',
      100: '#DBEAFE',
      200: '#BFDBFE',
      300: '#93C5FD',
      400: '#60A5FA',
      500: '#2563EB',
      600: '#1D4ED8',
      700: '#1E40AF',
      800: '#1E3A8A',
      900: '#172554',
    },
    background: { primary: '#FFFFFF', secondary: '#F0F7FF', hero: '#DBEAFE' },
    text: { primary: '#0F172A', secondary: '#1E3A5F', tertiary: '#64748B' },
    border: { light: '#BFDBFE' },
  },
};

export const PALETTE_META: Record<ThemePaletteId, PaletteMeta> = {
  dusk_lavender: {
    labelKey: 'theme.palette_names.dusk_lavender',
    swatches: ['#7B66C7', '#A99CE0', '#FDF5E6'],
  },
  sunset_peach: {
    labelKey: 'theme.palette_names.sunset_peach',
    swatches: ['#F16A3A', '#FF8E55', '#FFE6D1'],
  },
  forest_mint: {
    labelKey: 'theme.palette_names.forest_mint',
    swatches: ['#3F9958', '#8BCB9A', '#F7F3E4'],
  },
  ocean_breeze: {
    labelKey: 'theme.palette_names.ocean_breeze',
    swatches: ['#1E8DA3', '#6FC6D8', '#F3FAFB'],
  },
  berry_wine: {
    labelKey: 'theme.palette_names.berry_wine',
    swatches: ['#A83D5C', '#DE829E', '#FAE4EC'],
  },
  vanilla_cream: {
    labelKey: 'theme.palette_names.vanilla_cream',
    swatches: ['#9A7442', '#CDAE86', '#F3E8D1'],
  },
  midnight_blue: {
    labelKey: 'theme.palette_names.midnight_blue',
    swatches: ['#3A4E9E', '#7D8ECD', '#DCE4F3'],
  },
  storybook_watercolor: {
    labelKey: 'theme.palette_names.storybook_watercolor',
    swatches: ['#995B92', '#CF96C6', '#FBF0E4'],
  },
  candy_pop: {
    labelKey: 'theme.palette_names.candy_pop',
    swatches: ['#B91B82', '#E958B1', '#FDE4F1'],
  },
  slate_modern: {
    labelKey: 'theme.palette_names.slate_modern',
    swatches: ['#4F5D73', '#97A3B5', '#E9ECF1'],
  },
  dino_jungle: {
    labelKey: 'theme.palette_names.dino_jungle',
    swatches: ['#5A943F', '#A3CF8E', '#FFF1D6'],
  },
  cyber_hack: {
    labelKey: 'theme.palette_names.cyber_hack',
    swatches: ['#14B891', '#5EE0B5', '#E0FFF4'],
  },
  sports_arena: {
    labelKey: 'theme.palette_names.sports_arena',
    swatches: ['#2563EB', '#60A5FA', '#DBEAFE'],
  },
};

export const ORDERED_PALETTE_IDS: ReadonlyArray<ThemePaletteId> = THEME_PALETTE_IDS;
