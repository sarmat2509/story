import type {
  CharacterAnalysisOptions,
  CharacterAnalysisService,
} from './characterAnalysisService';
import { sanitizeAnalysisAppearance } from '../utils/sanitizeChildProfile';
import { logger } from '../utils/logger';

export interface ChildAppearanceEnrichmentInput {
  referencePhotoUrls: string[];
  description?: string | null;
  descriptionLanguage?: string | null;
  appearanceTraits?: Record<string, unknown> | null;
}

export interface ChildAppearanceEnrichmentResult {
  appearanceTraits?: Record<string, unknown>;
  aiGeneratedDescription?: string;
}

function definedAppearanceTraits(
  appearance: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!appearance) return {};

  return Object.fromEntries(
    Object.entries(appearance).filter(([, value]) =>
      Array.isArray(value)
        ? value.length > 0
        : value !== null && value !== undefined && value !== ''
    )
  );
}

function mergeAppearanceTraits(
  existing: Record<string, unknown>,
  extracted: Record<string, unknown> | null | undefined,
  distinctiveFeatures: string[] | null | undefined
): Record<string, unknown> {
  const next = { ...existing };
  for (const [key, value] of Object.entries(definedAppearanceTraits(extracted))) {
    if (next[key] === undefined) next[key] = value;
  }
  if (
    next.distinctiveFeatures === undefined &&
    distinctiveFeatures &&
    distinctiveFeatures.length > 0
  ) {
    next.distinctiveFeatures = distinctiveFeatures;
  }
  return next;
}

/**
 * Derive profile appearance once at creation time. Submitted choices always
 * win; AI output only fills fields it can support from an uploaded photo or
 * text explicitly supplied by the parent.
 */
export async function enrichChildAppearanceOnCreate(
  input: ChildAppearanceEnrichmentInput,
  analysisService: CharacterAnalysisService,
  options?: CharacterAnalysisOptions
): Promise<ChildAppearanceEnrichmentResult> {
  const existing = definedAppearanceTraits(input.appearanceTraits);
  const photoUrls = input.referencePhotoUrls.filter(Boolean);
  const description = input.description?.trim() || '';

  if (photoUrls.length > 0) {
    const analysis = await analysisService.analyzeCharacter(
      {
        photos: photoUrls,
        characterType: 'person',
        language: input.descriptionLanguage || 'en',
        isChildProfile: true,
      },
      options
    );
    const appearanceTraits = mergeAppearanceTraits(
      existing,
      sanitizeAnalysisAppearance(analysis.appearanceTraits as Record<string, unknown>),
      analysis.distinctiveFeatures
    );

    logger.info(
      { source: 'photos', fieldCount: Object.keys(appearanceTraits).length },
      'Derived child appearance traits during profile creation'
    );
    return {
      ...(Object.keys(appearanceTraits).length > 0 ? { appearanceTraits } : {}),
      ...(!description && analysis.detailedDescription.trim()
        ? { aiGeneratedDescription: analysis.detailedDescription.trim() }
        : {}),
    };
  }

  if (!description) {
    return Object.keys(existing).length > 0 ? { appearanceTraits: existing } : {};
  }

  const extraction = await analysisService.extractChildAppearanceFromDescription(
    { description, language: input.descriptionLanguage || 'en' },
    options
  );
  const appearanceTraits = mergeAppearanceTraits(
    existing,
    sanitizeAnalysisAppearance(extraction.appearanceTraits as Record<string, unknown>),
    extraction.distinctiveFeatures
  );

  logger.info(
    { source: 'description', fieldCount: Object.keys(appearanceTraits).length },
    'Derived child appearance traits during profile creation'
  );
  return Object.keys(appearanceTraits).length > 0 ? { appearanceTraits } : {};
}
