import type { ImageData } from '../providers/base/JsonSchema';
import type { ITextProvider } from '../providers/base/ITextProvider';
import type { UsageMetadata } from '../providers/base/UsageMetadata';
import type { Character } from '../db/schema';
import type { CharacterAnalysisResult } from './characterAnalysisService';
import { config } from '../config';
import { getCharacterRepository } from '../repositories';
import { getTextProvider } from './aiService';
import { getAssetStorageService } from './assetStorageService';
import { cosineSimilarity, generateEmbedding } from './embeddingService';
import { getReferencePhotoUrls } from './photoInputSafetyService';
import { logger } from '../utils/logger';

export type CharacterIdentitySignal = 'strong' | 'partial' | 'mismatch' | 'unclear';

export interface CharacterIdentityValidation {
  sameCharacter: boolean;
  confidence: number;
  colorMatch: CharacterIdentitySignal;
  shapeMatch: CharacterIdentitySignal;
  recognizability: CharacterIdentitySignal;
  stableFeatureMatches: string[];
  differences: string[];
  reason: string;
}

export interface CharacterIdentityScore {
  accepted: boolean;
  score: number;
  blockingReasons: string[];
}

export interface CharacterIdentityMatchResult {
  matchedCharacter: Character | null;
  confidence: number;
  score: number;
  candidateCount: number;
  validation: CharacterIdentityValidation | null;
  descriptionEmbedding: number[] | null;
  diagnostics: CharacterIdentityMatchDiagnostics;
}

export interface CharacterIdentityCandidateSelection {
  characterId: string;
  characterName: string;
  similarity: number | null;
  abovePrefilterThreshold: boolean | null;
  selectedForVision: boolean;
  referenceCount: number;
  createdAt: string;
}

export interface CharacterIdentityCandidateEvaluation {
  characterId: string;
  characterName: string;
  similarity: number | null;
  validation: CharacterIdentityValidation | null;
  score: number | null;
  accepted: boolean;
  blockingReasons: string[];
  error: string | null;
}

export interface CharacterIdentityMatchDiagnostics {
  version: 1;
  thresholds: {
    descriptionPrefilter: number;
    minConfidence: number;
    minScore: number;
    maxExistingCharactersToScore: number;
    maxCandidatesForVision: number;
  };
  descriptionEmbeddingAvailable: boolean;
  candidateSelection: CharacterIdentityCandidateSelection[];
  candidateEvaluations: CharacterIdentityCandidateEvaluation[];
}

export interface CharacterIdentityMatchingOptions {
  userId: string;
  photoUrls: string[];
  characterType: string;
  analysis: CharacterAnalysisResult;
  language?: string | null;
  onUsage?: (usage: UsageMetadata) => void;
}

interface Candidate {
  character: Character;
  similarity: number | null;
}

interface CandidateSelectionResult {
  selected: Candidate[];
  diagnostics: CharacterIdentityCandidateSelection[];
}

const MAX_EXISTING_CHARACTERS_TO_SCORE = 30;
const MAX_CANDIDATES_FOR_VISION = 4;
const DESCRIPTION_PREFILTER_THRESHOLD = 0.58;
const MIN_ACCEPTED_CONFIDENCE = 0.82;
const MIN_ACCEPTED_SCORE = 0.8;

function identityThresholds(): CharacterIdentityMatchDiagnostics['thresholds'] {
  return {
    descriptionPrefilter: DESCRIPTION_PREFILTER_THRESHOLD,
    minConfidence: MIN_ACCEPTED_CONFIDENCE,
    minScore: MIN_ACCEPTED_SCORE,
    maxExistingCharactersToScore: MAX_EXISTING_CHARACTERS_TO_SCORE,
    maxCandidatesForVision: MAX_CANDIDATES_FOR_VISION,
  };
}

function isValidEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

function normalizeSignal(value: unknown): CharacterIdentitySignal {
  if (value === 'strong' || value === 'partial' || value === 'mismatch' || value === 'unclear') {
    return value;
  }
  return 'unclear';
}

function signalValue(signal: CharacterIdentitySignal): number {
  switch (signal) {
    case 'strong':
      return 1;
    case 'partial':
      return 0.68;
    case 'unclear':
      return 0.42;
    case 'mismatch':
      return 0;
  }
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function scoreIdentityValidation(validation: CharacterIdentityValidation): CharacterIdentityScore {
  const confidence = clampConfidence(validation.confidence);
  const colorMatch = normalizeSignal(validation.colorMatch);
  const shapeMatch = normalizeSignal(validation.shapeMatch);
  const recognizability = normalizeSignal(validation.recognizability);

  const visualScore =
    signalValue(colorMatch) * 0.25 +
    signalValue(shapeMatch) * 0.35 +
    signalValue(recognizability) * 0.4;
  const score = confidence * 0.52 + visualScore * 0.48;

  const blockingReasons: string[] = [];
  if (!validation.sameCharacter) blockingReasons.push('vision_declined_same_character');
  if (confidence < MIN_ACCEPTED_CONFIDENCE) blockingReasons.push('confidence_below_threshold');
  if (score < MIN_ACCEPTED_SCORE) blockingReasons.push('score_below_threshold');
  if (colorMatch === 'mismatch') blockingReasons.push('color_mismatch');
  if (shapeMatch === 'mismatch') blockingReasons.push('shape_mismatch');
  if (recognizability === 'mismatch') blockingReasons.push('recognizability_mismatch');
  if (shapeMatch === 'unclear') blockingReasons.push('shape_unclear');
  if (recognizability === 'unclear') blockingReasons.push('recognizability_unclear');

  return {
    accepted: blockingReasons.length === 0,
    score,
    blockingReasons,
  };
}

function buildIdentityText(
  analysis: CharacterAnalysisResult,
  characterType: string,
  language?: string | null
): string {
  return [
    `type: ${characterType}`,
    language ? `language: ${language}` : null,
    analysis.suggestedName ? `name: ${analysis.suggestedName}` : null,
    analysis.detailedDescription ? `description: ${analysis.detailedDescription}` : null,
    analysis.appearanceTraits ? `appearance: ${JSON.stringify(analysis.appearanceTraits)}` : null,
    analysis.clothing ? `clothing: ${JSON.stringify(analysis.clothing)}` : null,
    analysis.distinctiveFeatures?.length
      ? `distinctive features: ${analysis.distinctiveFeatures.join(', ')}`
      : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n');
}

function getCharacterDescriptionText(character: Character): string {
  const parts = [
    `type: ${character.type}`,
    character.name ? `name: ${character.name}` : null,
    character.descriptionEn ? `description en: ${character.descriptionEn}` : null,
    character.aiGeneratedDescription ? `ai description: ${character.aiGeneratedDescription}` : null,
    character.description ? `description: ${character.description}` : null,
    character.appearanceTraits ? `appearance: ${JSON.stringify(character.appearanceTraits)}` : null,
    character.clothing ? `clothing: ${JSON.stringify(character.clothing)}` : null,
    Array.isArray(character.distinctiveFeatures) && character.distinctiveFeatures.length
      ? `distinctive features: ${character.distinctiveFeatures.join(', ')}`
      : null,
  ];

  return parts.filter((part): part is string => Boolean(part)).join('\n');
}

function getTurnaroundPhotoUrls(turnaroundSheet: unknown): string[] {
  if (!turnaroundSheet || typeof turnaroundSheet !== 'object') {
    return [];
  }
  const sheet = turnaroundSheet as { frontUrl?: unknown; url?: unknown; sourcePhotoUrl?: unknown };
  return [sheet.frontUrl, sheet.url, sheet.sourcePhotoUrl]
    .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter((url) => url.trim().length > 0)));
}

function inferMimeType(url: string): ImageData['mimeType'] {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function extractStoragePath(url: string): string | null {
  const assetPrefix = '/api/v1/assets/';
  const assetIdx = url.indexOf(assetPrefix);
  if (assetIdx !== -1) {
    const pathWithQuery = url.substring(assetIdx + assetPrefix.length);
    return decodeURIComponent(pathWithQuery.split('?')[0]);
  }

  if (!/^https?:\/\//i.test(url)) {
    return url.split('?')[0];
  }

  return null;
}

function sortNewestFirst(a: Character, b: Character): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export class CharacterIdentityMatchingService {
  constructor(private readonly textProvider: ITextProvider) {}

  async findMatch(options: CharacterIdentityMatchingOptions): Promise<CharacterIdentityMatchResult> {
    const descriptionText = buildIdentityText(options.analysis, options.characterType, options.language);
    const descriptionEmbedding = await generateEmbedding(descriptionText).catch((err) => {
      logger.warn(
        { err, userId: options.userId, characterType: options.characterType },
        'Character identity description embedding failed; continuing without prefilter embedding'
      );
      return null;
    });

    const candidateSelection = await this.selectCandidates({
      userId: options.userId,
      characterType: options.characterType,
      descriptionEmbedding,
    });
    const candidates = candidateSelection.selected;
    const candidateEvaluations: CharacterIdentityCandidateEvaluation[] = [];

    let best:
      | {
          character: Character;
          validation: CharacterIdentityValidation;
          score: CharacterIdentityScore;
        }
      | null = null;

    for (const candidate of candidates) {
      let validationError: string | null = null;
      const validation = await this.validateCandidate({
        newPhotoUrls: options.photoUrls,
        candidate: candidate.character,
        newCharacterType: options.characterType,
        newDescription: options.analysis.detailedDescription,
        similarity: candidate.similarity,
        onUsage: options.onUsage,
      }).catch((err) => {
        validationError = err instanceof Error ? err.message : String(err);
        logger.warn(
          {
            err,
            userId: options.userId,
            candidateCharacterId: candidate.character.id,
            candidateName: candidate.character.name,
          },
          'Character identity visual validation failed for candidate'
        );
        return null;
      });

      if (!validation) {
        candidateEvaluations.push({
          characterId: candidate.character.id,
          characterName: candidate.character.name,
          similarity: candidate.similarity,
          validation: null,
          score: null,
          accepted: false,
          blockingReasons: ['vision_validation_failed'],
          error: validationError || 'Vision validation returned no result',
        });
        continue;
      }

      const score = scoreIdentityValidation(validation);
      candidateEvaluations.push({
        characterId: candidate.character.id,
        characterName: candidate.character.name,
        similarity: candidate.similarity,
        validation,
        score: score.score,
        accepted: score.accepted,
        blockingReasons: score.blockingReasons,
        error: null,
      });
      logger.info(
        {
          userId: options.userId,
          candidateCharacterId: candidate.character.id,
          candidateName: candidate.character.name,
          confidence: validation.confidence,
          score: score.score,
          accepted: score.accepted,
          blockingReasons: score.blockingReasons,
          similarity: candidate.similarity,
        },
        'Character identity candidate evaluated'
      );

      if (score.accepted && (!best || score.score > best.score.score)) {
        best = {
          character: candidate.character,
          validation,
          score,
        };
      }
    }

    if (!best) {
      return {
        matchedCharacter: null,
        confidence: 0,
        score: 0,
        candidateCount: candidates.length,
        validation: null,
        descriptionEmbedding,
        diagnostics: {
          version: 1,
          thresholds: identityThresholds(),
          descriptionEmbeddingAvailable: descriptionEmbedding !== null,
          candidateSelection: candidateSelection.diagnostics,
          candidateEvaluations,
        },
      };
    }

    return {
      matchedCharacter: best.character,
      confidence: clampConfidence(best.validation.confidence),
      score: best.score.score,
      candidateCount: candidates.length,
      validation: best.validation,
      descriptionEmbedding,
      diagnostics: {
        version: 1,
        thresholds: identityThresholds(),
        descriptionEmbeddingAvailable: descriptionEmbedding !== null,
        candidateSelection: candidateSelection.diagnostics,
        candidateEvaluations,
      },
    };
  }

  private async selectCandidates(params: {
    userId: string;
    characterType: string;
    descriptionEmbedding: number[] | null;
  }): Promise<CandidateSelectionResult> {
    const repo = getCharacterRepository();
    const characters = await repo.findByUserId(params.userId, params.characterType);
    const visibleCharacters = characters
      .filter((character) => !character.isHidden)
      .filter((character) => this.getReferenceUrlsForCandidate(character).length > 0)
      .sort(sortNewestFirst)
      .slice(0, MAX_EXISTING_CHARACTERS_TO_SCORE);

    if (visibleCharacters.length === 0) {
      return { selected: [], diagnostics: [] };
    }

    const scoredCandidates: Candidate[] = [];
    for (const character of visibleCharacters) {
      let similarity: number | null = null;
      if (params.descriptionEmbedding) {
        const existingEmbedding = await this.getOrCreateDescriptionEmbedding(character, params.userId);
        if (existingEmbedding && existingEmbedding.length === params.descriptionEmbedding.length) {
          similarity = cosineSimilarity(params.descriptionEmbedding, existingEmbedding);
        }
      }
      scoredCandidates.push({ character, similarity });
    }

    const sorted = scoredCandidates.sort((a, b) => {
      if (a.similarity == null && b.similarity == null) {
        return sortNewestFirst(a.character, b.character);
      }
      if (a.similarity == null) return 1;
      if (b.similarity == null) return -1;
      return b.similarity - a.similarity;
    });

    const aboveThreshold = sorted.filter(
      (candidate) =>
        candidate.similarity == null || candidate.similarity >= DESCRIPTION_PREFILTER_THRESHOLD
    );
    const fallback = sorted.slice(0, Math.min(2, sorted.length));
    const combined = [...aboveThreshold, ...fallback];
    const uniqueById = new Map<string, Candidate>();
    for (const candidate of combined) {
      uniqueById.set(candidate.character.id, candidate);
      if (uniqueById.size >= MAX_CANDIDATES_FOR_VISION) {
        break;
      }
    }

    const selected = Array.from(uniqueById.values());
    const selectedIds = new Set(selected.map((candidate) => candidate.character.id));
    return {
      selected,
      diagnostics: sorted.map((candidate) => ({
        characterId: candidate.character.id,
        characterName: candidate.character.name,
        similarity: candidate.similarity,
        abovePrefilterThreshold:
          candidate.similarity == null
            ? null
            : candidate.similarity >= DESCRIPTION_PREFILTER_THRESHOLD,
        selectedForVision: selectedIds.has(candidate.character.id),
        referenceCount: this.getReferenceUrlsForCandidate(candidate.character).length,
        createdAt: new Date(candidate.character.createdAt).toISOString(),
      })),
    };
  }

  private async getOrCreateDescriptionEmbedding(
    character: Character,
    userId: string
  ): Promise<number[] | null> {
    if (isValidEmbedding(character.descriptionEmbedding)) {
      return character.descriptionEmbedding;
    }

    const descriptionText = getCharacterDescriptionText(character);
    if (descriptionText.trim().length === 0) {
      return null;
    }

    const embedding = await generateEmbedding(descriptionText).catch((err) => {
      logger.warn(
        { err, characterId: character.id, userId },
        'Existing character identity embedding generation failed'
      );
      return null;
    });

    if (!embedding) {
      return null;
    }

    getCharacterRepository()
      .update(character.id, userId, { descriptionEmbedding: embedding } as any)
      .catch((err) => {
        logger.warn(
          { err, characterId: character.id, userId },
          'Failed to persist existing character identity embedding'
        );
      });

    return embedding;
  }

  private async validateCandidate(params: {
    newPhotoUrls: string[];
    candidate: Character;
    newCharacterType: string;
    newDescription: string;
    similarity: number | null;
    onUsage?: (usage: UsageMetadata) => void;
  }): Promise<CharacterIdentityValidation | null> {
    const candidateReferenceUrls = this.getReferenceUrlsForCandidate(params.candidate).slice(0, 3);
    if (candidateReferenceUrls.length === 0) {
      return null;
    }

    const newImages = await this.prepareImageData(params.newPhotoUrls.slice(0, 3), 'NEW_PHOTO');
    const candidateImages = await this.prepareImageData(candidateReferenceUrls, 'EXISTING_CHARACTER');
    if (newImages.length === 0 || candidateImages.length === 0) {
      return null;
    }

    const prompt = this.buildValidationPrompt({
      candidate: params.candidate,
      newCharacterType: params.newCharacterType,
      newDescription: params.newDescription,
      similarity: params.similarity,
      newImageCount: newImages.length,
      candidateImageCount: candidateImages.length,
    });

    const result = await this.textProvider.generateStructured<CharacterIdentityValidation>({
      model: config.ai?.geminiVisionModel || 'gemini-2.5-flash',
      prompt,
      imageData: [...newImages, ...candidateImages],
      schema: this.getValidationSchema(),
      temperature: 0.1,
      relaxedSafety: true,
      onUsage: params.onUsage,
      operation: 'character_identity_match',
    });

    return {
      sameCharacter: Boolean(result.sameCharacter),
      confidence: clampConfidence(result.confidence),
      colorMatch: normalizeSignal(result.colorMatch),
      shapeMatch: normalizeSignal(result.shapeMatch),
      recognizability: normalizeSignal(result.recognizability),
      stableFeatureMatches: Array.isArray(result.stableFeatureMatches)
        ? result.stableFeatureMatches.filter((value): value is string => typeof value === 'string').slice(0, 8)
        : [],
      differences: Array.isArray(result.differences)
        ? result.differences.filter((value): value is string => typeof value === 'string').slice(0, 8)
        : [],
      reason: typeof result.reason === 'string' ? result.reason : '',
    };
  }

  private getReferenceUrlsForCandidate(character: Character): string[] {
    return uniqueUrls([
      ...getReferencePhotoUrls(character.referencePhotos),
      ...getTurnaroundPhotoUrls(character.turnaroundSheet),
    ]);
  }

  private async prepareImageData(urls: string[], label: string): Promise<ImageData[]> {
    const images: ImageData[] = [];

    for (let index = 0; index < urls.length; index++) {
      const url = urls[index];
      try {
        const buffer = await this.downloadImage(url);
        images.push({
          mimeType: inferMimeType(url),
          data: buffer.toString('base64'),
          instructionText: `${label}_${index + 1}`,
        });
      } catch (err) {
        logger.warn({ err, url, label }, 'Failed to load image for character identity matching');
      }
    }

    return images;
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const storagePath = extractStoragePath(url);
    if (storagePath) {
      return getAssetStorageService().getAssetByPath(storagePath);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private buildValidationPrompt(params: {
    candidate: Character;
    newCharacterType: string;
    newDescription: string;
    similarity: number | null;
    newImageCount: number;
    candidateImageCount: number;
  }): string {
    return `LEGITIMATE USE CASE: Parents create recurring storybook characters from their own uploaded photos. Decide whether the NEW_PHOTO images and EXISTING_CHARACTER references show the same recurring character so the app can avoid duplicate character records.

Input order:
- First ${params.newImageCount} image(s): NEW_PHOTO, the character just photographed in instant mode.
- Next ${params.candidateImageCount} image(s): EXISTING_CHARACTER, an already saved character from this user's library.

Existing character:
- id: ${params.candidate.id}
- name: ${params.candidate.name}
- type: ${params.candidate.type}
- description: ${getCharacterDescriptionText(params.candidate) || 'none'}

New instant character:
- type: ${params.newCharacterType}
- description: ${params.newDescription || 'none'}
- text embedding similarity: ${params.similarity == null ? 'unavailable' : params.similarity.toFixed(3)}

Compare stable identity features and ignore lighting, camera angle, crop, pose, scale, background, and temporary clothing when appropriate. For toys, drawings, fantasy creatures, and objects, prioritize body/head shape, silhouette, color palette, markings, face/details, material/texture, and other recognizable features. For animals and people, prioritize stable physical identity cues without over-matching generic similar-looking subjects.

Return sameCharacter=true only when you would confidently reuse EXISTING_CHARACTER instead of creating a new character. Similar category is not enough. A generic brown teddy bear must not match another generic brown teddy bear unless shape, colors, markings, and recognizable details align.

Explicitly validate:
1. colorMatch: stable colors, markings, and palette, accounting for lighting and shadows.
2. shapeMatch: silhouette, body/head shape, proportions, and distinctive structural features.
3. recognizability: unique features that make this exact character recognizable across photos.

Use "mismatch" for any meaningful contradiction, "unclear" when the photos do not show enough evidence, "partial" for plausible but incomplete agreement, and "strong" for clear agreement.`;
  }

  private getValidationSchema(): any {
    return {
      type: 'object',
      properties: {
        sameCharacter: {
          type: 'boolean',
          description: 'True only if the new photos and existing references show the same recurring character.',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Overall confidence that this is the same character.',
        },
        colorMatch: {
          type: 'string',
          enum: ['strong', 'partial', 'mismatch', 'unclear'],
        },
        shapeMatch: {
          type: 'string',
          enum: ['strong', 'partial', 'mismatch', 'unclear'],
        },
        recognizability: {
          type: 'string',
          enum: ['strong', 'partial', 'mismatch', 'unclear'],
        },
        stableFeatureMatches: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 8,
        },
        differences: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 8,
        },
        reason: {
          type: 'string',
        },
      },
      required: [
        'sameCharacter',
        'confidence',
        'colorMatch',
        'shapeMatch',
        'recognizability',
        'stableFeatureMatches',
        'differences',
        'reason',
      ],
    };
  }
}

let singleton: CharacterIdentityMatchingService | null = null;
let singletonProvider: ITextProvider | null = null;

export function getCharacterIdentityMatchingService(): CharacterIdentityMatchingService {
  const provider = getTextProvider();
  if (!singleton || singletonProvider !== provider) {
    singleton = new CharacterIdentityMatchingService(provider);
    singletonProvider = provider;
  }
  return singleton;
}
