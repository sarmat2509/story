/**
 * Centralized art style definitions for both IMAGE and TEXT generation.
 * Single source of truth for all style-related prompts.
 */

import { getImageContentPolicy } from '../contentPolicy';

export interface StyleDefinition {
  /** Image generation: Full style prefix for image model */
  imagePrefix: string[];
  /** Text generation: Adaptive instructions for sceneVisual fields */
  textGuidance: {
    setting: string;
    composition: string;
    lighting: string;
  };
}

export const ART_STYLES: Record<string, StyleDefinition> = {
  clay: {
    imagePrefix: [
      'handcrafted plasticine claymation illustration',
      'visible fingerprints, small dents, seam lines, and hand-molded tool marks',
      'soft matte clay surface with slightly waxy highlights',
      'chunky solid shapes, simplified geometry, toy-like proportions',
      'miniature practical set look (handmade foliage and props, not photoreal)',
      'stop-motion studio lighting with gentle bounce and slight imperfections',
      'no CGI render look, keep it tactile and handmade',
    ],
    textGuidance: {
      setting: 'Describe as claymation miniature set: clay/felt/paper materials, visible seams/dents/tool marks, chunky toy-like shapes, miniature practical props. Avoid photoreal textures (e.g. "clay walls" not "painted walls").',
      composition: 'Frame as miniature diorama/dollhouse perspective. Describe character poses with chunky toy-like proportions, visible seam lines at joints (neck, limbs), simple geometry. Characters should feel like stop-motion puppets in mid-animation.',
      lighting: 'Describe as practical stop-motion studio setup with gentle bounce, slight unevenness, soft shadows typical of miniature sets. Avoid harsh or overly dramatic lighting.',
    },
  },
  
  soft_watercolor: {
    imagePrefix: [
      'ethereal storybook watercolor illustration',
      'wet-on-wet washes with soft color blooms and gentle backruns',
      'transparent layered glazing, delicate pastel light',
      'no ink outlines, minimal linework only if absolutely needed',
      'subtle watercolor paper texture (no visible page edges, no borders, no vignette)',
      'hand-painted look with slightly uneven pigment pooling and granulation',
      'classic vintage childrens book feel, cozy and warm',
    ],
    textGuidance: {
      setting: 'Describe with watercolor qualities: soft washes, translucent layers, paper texture, no harsh outlines. Materials and surfaces with paint-like quality, gentle color bleeding.',
      composition: 'Frame with soft, gentle composition. Describe character poses with flowing, painterly quality, no hard edges. Poses should feel organic and loose.',
      lighting: 'Describe as soft, diffused lighting with delicate pastel quality. Light washes over surfaces with translucent glow, gentle highlights, paper texture visible in lit areas.',
    },
  },
  
  colored_pencil: {
    imagePrefix: [
      'hand-drawn colored pencil illustration with tactile paper-grain texture',
      'full-bleed artwork extending past all four image edges; never show a paper sheet, page edge, blank margin, mat, border, frame, or vignette',
      'visible waxy pencil strokes and layered burnishing',
      'cross-hatching and gentle scribble shading',
      'paper grain clearly showing through lighter areas',
      'soft sketchy outlines, imperfect hand pressure variation',
      'warm nostalgic palette, storybook sketch feel',
      'no digital airbrush gradients, keep it tactile and handmade',
    ],
    textGuidance: {
      setting: 'Describe with colored pencil drawing qualities: visible strokes, paper grain, cross-hatching, tactile sketch quality. Hand-drawn imperfections.',
      composition: 'Frame as sketch composition. Describe character poses with visible stroke direction, sketch-like quality, imperfect hand-drawn feel.',
      lighting: 'Describe through cross-hatching and shading strokes. Shadows built with layered pencil marks, paper grain visible in highlights.',
    },
  },
  
  comic_line: {
    imagePrefix: [
      'bold ink-line comic illustration',
      'clean confident black outlines with varied line weight',
      'flat spot colors with limited shading',
      'simple graphic shadows, occasional halftone dots in shadow areas',
      'crisp poster-like contrast, high readability shapes',
      'minimal texture, no painterly brushwork',
      'print-like finish, sharp edges and clear silhouettes',
    ],
    textGuidance: {
      setting: 'Describe with bold comic illustration qualities: flat colors, graphic shadows, crisp shapes, minimal texture.',
      composition: 'Frame with clear silhouettes and poster-like composition. Describe character poses with bold, readable shapes and graphic clarity.',
      lighting: 'Describe as simple graphic shadows with clear separation between light/shadow. Occasional halftone dots in shadow areas, flat lighting overall.',
    },
  },
  
  anime_light: {
    imagePrefix: [
      'retro hand-drawn cel animation aesthetic',
      'hard-edged cel shading with 2-3 distinct shadow layers (no soft gradients on characters)',
      'flat saturated colors, clean animation-style linework',
      'subtle film grain and slight analog softness (no UI, no subtitles, no frame borders)',
      'backgrounds: hand-painted look with visible brushstrokes and simplified shapes',
      'expressive faces, clear readable posing',
      'overall look: animated frame, not photoreal',
    ],
    textGuidance: {
      setting: 'Describe as cel animation background: hand-painted look, simplified shapes, visible brushstrokes.',
      composition: 'Frame as animation frame. Describe character poses with expressive clarity, clean readable silhouettes, animation-style posing.',
      lighting: 'Describe as cel-shading with 2-3 distinct hard-edged shadow layers. NO soft gradients. Flat saturated colors in lit areas, clear shadow boundaries.',
    },
  },
  
  retro_shojo_fantasy: {
    imagePrefix: [
      'retro shojo anime fantasy illustration',
      'cel-shaded characters with bright saturated colors',
      'big expressive sparkling eyes with starburst highlights',
      'glossy hair with clean highlight bands',
      'soft sunbeams (god rays), subtle lens flare, a few floating petals, gentle sparkle accents',
      'romantic airy atmosphere, dreamy background glow',
    ],
    textGuidance: {
      setting: 'Describe with dreamy, romantic qualities: soft glows, floating petals, sparkle accents.',
      composition: 'Frame with dreamy, fantasy composition. Describe character poses with sparkling eyes, glossy hair highlights, romantic expressiveness.',
      lighting: 'Describe as soft sunbeams (god rays), subtle lens flare, gentle sparkle accents, dreamy background glow. Warm romantic lighting.',
    },
  },
  
  warm_3d: {
    imagePrefix: [
      'high-quality modern 3D animated film render',
      'rounded appealing character forms',
      'soft subsurface scattering on skin, physically based materials',
      'highly detailed fabrics with visible weave and stitching',
      'warm cinematic lighting with gentle volumetric rays',
      'soft depth of field, clean ray-traced shadows and reflections',
      'polished studio render, 4k-like clarity',
    ],
    textGuidance: {
      setting: 'Describe as 3D animated render: rounded forms, detailed materials with physical properties, clean geometry.',
      composition: 'Frame with cinematic depth and soft focus. Describe character poses with rounded appealing forms, detailed fabric folds, and proportions preserved from character references.',
      lighting: 'Describe as warm cinematic lighting with volumetric rays, soft depth of field, ray-traced shadows and reflections. Gentle subsurface scattering on skin/fabrics.',
    },
  },
  
  night_calm: {
    imagePrefix: [
      'calm nocturnal storybook illustration',
      'deep indigo and violet palette with warm golden highlights',
      'soft atmospheric haze, gentle bloom around light sources',
      'quiet cozy mood, peaceful and safe for children',
      'subtle stippling or fine grain texture in shadows',
      'high contrast between light and dark, but not scary',
      'smooth readable shapes, minimal harsh edges',
    ],
    textGuidance: {
      setting: 'Describe with nocturnal calm palette: deep indigo/violet tones, warm golden highlights in lit areas, soft atmospheric haze.',
      composition: 'Frame with high contrast silhouettes. Describe character poses against light sources, emphasizing shape contrast between dark and light.',
      lighting: 'Describe as deep shadows with soft bloom around light sources (candles, lamps, moon). Warm golden glow in lit areas, peaceful nocturnal atmosphere.',
    },
  },
  
  felt_craft: {
    imagePrefix: [
      'handmade felt craft illustration, stop-motion puppet feel',
      'visible embroidery stitches, seams, and layered fabric edges',
      'fuzzy wool fibers and soft felt texture',
      'slight thickness and shadow between fabric layers',
      'hand-cut shapes with tiny imperfections',
      'soft studio lighting like a miniature set',
      'cozy handcrafted diorama look',
    ],
    textGuidance: {
      setting: 'Describe as handmade felt diorama: visible stitches, fabric layers, fuzzy fibers, hand-cut shapes. Tactile handcrafted quality.',
      composition: 'Frame as miniature diorama. Describe character poses with fabric-layered appearance, soft edges, handcrafted feel.',
      lighting: 'Describe as soft studio lighting like miniature set, with gentle shadows between fabric layers. Cozy, warm illumination.',
    },
  },
};

/**
 * Get image style prefix with age-appropriate enhancements.
 * For night_calm style, uses imageStyleNightModifier from contentPolicy when scenarioCardId provided.
 */
export function getImageStylePrefix(style: string, ageGroup: string, scenarioCardId?: string): string {
  const styleDef = ART_STYLES[style] || ART_STYLES['soft_watercolor'];
  let baseStyle = styleDef.imagePrefix.join(', ');

  // For night_calm: replace "but not scary" with scenario-aware modifier when scenarioCardId provided
  if (style === 'night_calm' && scenarioCardId != null) {
    const { imageStyleNightModifier } = getImageContentPolicy({ ageGroup, scenarioCardId });
    if (imageStyleNightModifier) {
      baseStyle = baseStyle.replace('high contrast between light and dark, but not scary', `high contrast between light and dark, ${imageStyleNightModifier}`);
    }
  }

  if (ageGroup === '0-1' || ageGroup === '1y') {
    return `${baseStyle}, very simple shapes, minimal details, extremely soft and gentle`;
  } else if (ageGroup === '2-3' || ageGroup === '4-5') {
    return `${baseStyle}, simple clear shapes, bright friendly colors, child-friendly`;
  }

  return baseStyle;
}

/**
 * Get text generation guidance for a style
 */
export function getTextStyleGuidance(style?: string | null): StyleDefinition['textGuidance'] | null {
  if (!style) return null;
  return ART_STYLES[style]?.textGuidance || null;
}
