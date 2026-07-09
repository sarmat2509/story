/**
 * Image Prompt Engineering
 * Functions for building prompts for image generation with character consistency
 */

import { stripCharacterIdFromName } from '@wondertales/shared';
import anyAscii from 'any-ascii';
import { stripAllTags } from '../../utils/audioTags';
import { logger } from '../../utils/logger';
import { flattenCameraComposition, type SceneVisual } from '../../services/types';
import { buildPlaceholderReferenceNameMap } from '../../services/referenceImageBuckets';
import {
  findCharacterReferenceBinding,
  referenceBindingLabel,
  referenceBindingKind,
  type ReferenceBindingInput,
} from '../../services/referenceBinding';
import type { StoryEnvironment } from '../../ai/types';
import { getImageStylePrefix } from './styles';
import { getImageContentPolicy } from '../contentPolicy';
import { config } from '../../config';
import { crossScriptIdentityKey, toPhoneticKey } from '../../utils/characterNormalization';
import { formatCharacterLocationLine } from './compositionFormatter';

export const ENVIRONMENT_REFERENCE_PROMPT_VERSION = 'env_ref_plate_v3_color';
export const ENVIRONMENT_REFERENCE_CACHE_PREFIX = `[${ENVIRONMENT_REFERENCE_PROMPT_VERSION}]`;
export const NO_VISIBLE_TEXT_OR_REFERENCE_LABELS_RULE =
  'MUST AVOID any kind of text.';

function resolveCharacterImageIndex(
  characterName: string,
  imageIndexMap?: Map<string, number>,
): number | undefined {
  if (!imageIndexMap || imageIndexMap.size === 0) return undefined;
  if (imageIndexMap.has(characterName)) return imageIndexMap.get(characterName);
  const base = stripCharacterIdFromName(characterName).trim();
  if (base && imageIndexMap.has(base)) return imageIndexMap.get(base);
  const lower = base.toLowerCase();
  for (const [k, v] of imageIndexMap) {
    if (stripCharacterIdFromName(k).trim().toLowerCase() === lower) return v;
  }
  return undefined;
}

type PromptNameContext = {
  byNormalizedName: Map<string, string>;
  byImageIndex: Map<number, string>;
  replacementAliases: Array<{ alias: string; label: string }>;
};

function normalizedPromptName(name: string): string {
  return stripCharacterIdFromName(name).trim().toLowerCase();
}

function fallbackPromptLabel(name: string, imageIdx?: number): string {
  if (imageIdx !== undefined) return `REF_IMAGE_${imageIdx}`;
  return stripCharacterIdFromName(name).trim() || name.trim() || 'CHARACTER';
}

const USER_PROMPT_TEXT_BAN_NEGATIVE_TERMS = new Set([
  'text',
  'letters',
  'words',
  'writing',
  'typography',
  'font',
  'watermark',
  'logo',
  'signature',
  'label',
  'sign',
  'banner',
  'speech bubbles',
  'dialogue bubbles',
  'text bubbles',
  'captions',
  'character captions',
  'character name labels',
  'name labels',
  'subtitles',
  'written text',
  'words on image',
  'text on screen',
  'text on objects',
  'text on clothing',
  'text on buildings',
  'numbers',
  'digits',
  'symbols on image',
  'written symbols',
  'alphabet',
  'characters',
  'glyphs',
  'inscriptions',
]);

function removeUserPromptTextBanNegativeTerms(negativePrompt: string | undefined): string {
  if (!negativePrompt) return '';
  return negativePrompt
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term && !USER_PROMPT_TEXT_BAN_NEGATIVE_TERMS.has(term.toLowerCase()))
    .join(', ');
}

function nameAliasVariants(name: string): string[] {
  const full = name.trim();
  const base = stripCharacterIdFromName(name).trim();
  const variants = new Set<string>();
  for (const value of [full, base]) {
    if (!value || value.length < 2) continue;
    variants.add(value);
    const ascii = anyAscii(value).trim();
    if (ascii && ascii.length >= 2) {
      variants.add(ascii);
      variants.add(ascii.replace(/ii/g, 'i'));
      variants.add(ascii.replace(/iya$/i, 'ia'));
      variants.add(ascii.replace(/^ie/i, 'e'));
      variants.add(ascii.replace(/^ye/i, 'e'));
    }
    const phonetic = toPhoneticKey(value);
    if (phonetic && phonetic.length >= 2) {
      variants.add(phonetic);
      variants.add(phonetic.replace(/^ie/i, 'e'));
      variants.add(phonetic.replace(/^ye/i, 'e'));
    }
    const crossScript = crossScriptIdentityKey(value);
    if (crossScript && crossScript.length >= 2) {
      variants.add(crossScript);
      variants.add(crossScript.replace(/^ie/i, 'e'));
      variants.add(crossScript.replace(/^ye/i, 'e'));
    }
  }
  return [...variants].filter((value) => value.length >= 2);
}

function addPromptName(
  context: PromptNameContext,
  name: string,
  label: string,
): void {
  const normalized = normalizedPromptName(name);
  if (normalized) context.byNormalizedName.set(normalized, label);
  for (const variant of nameAliasVariants(name)) {
    context.replacementAliases.push({ alias: variant, label });
  }
}

function normalizeReplacementAliases(context: PromptNameContext): void {
  context.replacementAliases = context.replacementAliases
    .filter((entry, index, list) =>
      list.findIndex((other) =>
        other.alias.toLowerCase() === entry.alias.toLowerCase() && other.label === entry.label,
      ) === index,
    )
    .sort((a, b) => b.alias.length - a.alias.length);
}

function applyReferenceBindingAliases(
  context: PromptNameContext,
  referenceImages?: ReferenceBindingInput[],
): void {
  for (const ref of referenceImages ?? []) {
    if (referenceBindingKind(ref) !== 'character' || !ref.characterName) continue;

    const bindingLabel = referenceBindingLabel(ref, ref.imageIndex);
    const normalized = normalizedPromptName(ref.characterName);
    const previousLabel = normalized ? context.byNormalizedName.get(normalized) : undefined;

    if (previousLabel && previousLabel !== bindingLabel) {
      for (const entry of context.replacementAliases) {
        if (entry.label === previousLabel) entry.label = bindingLabel;
      }
      for (const [key, value] of context.byNormalizedName) {
        if (value === previousLabel) context.byNormalizedName.set(key, bindingLabel);
      }
      for (const [key, value] of context.byImageIndex) {
        if (value === previousLabel) context.byImageIndex.set(key, bindingLabel);
      }
    }

    addPromptName(context, ref.characterName, bindingLabel);
    if (ref.imageIndex !== undefined && ref.imageIndex !== null) {
      context.byImageIndex.set(ref.imageIndex, bindingLabel);
    }
  }

  normalizeReplacementAliases(context);
}

function buildPromptNameContext(params: {
  sceneVisual: SceneVisual;
  imageIndexMap?: Map<string, number>;
  referenceCharacterNames?: Array<string | { name: string; isTurnaround?: boolean; nameAliases?: string[] }>;
  realWorldCharacters?: Array<{ name: string; description: string; nameAliases?: string[] }>;
  referenceImages?: ReferenceBindingInput[];
}): PromptNameContext {
  const context: PromptNameContext = {
    byNormalizedName: new Map(),
    byImageIndex: new Map(),
    replacementAliases: [],
  };

  const sceneCharacterNames =
    typeof params.sceneVisual.cameraComposition === 'string'
      ? []
      : params.sceneVisual.cameraComposition.characters.map((char) => char.name);
  const rawReferenceEntries =
    (params.referenceCharacterNames ?? []).map((entry) => ({
      name: typeof entry === 'string' ? entry : entry.name,
      nameAliases: typeof entry === 'string' ? [] : (entry.nameAliases ?? []),
    }));
  const rawReferenceNames = rawReferenceEntries.map((entry) => entry.name);
  const placeholderMap = buildPlaceholderReferenceNameMap(rawReferenceNames, sceneCharacterNames);

  const addCandidate = (
    name: string | undefined,
    imageIdx?: number,
    originalName?: string,
    nameAliases?: string[],
  ) => {
    if (!name) return;
    const normalized = normalizedPromptName(name);
    if (!normalized) return;
    const label = context.byNormalizedName.get(normalized) ?? fallbackPromptLabel(name, imageIdx);
    addPromptName(context, name, label);
    if (originalName && originalName !== name) {
      addPromptName(context, originalName, label);
    }
    for (const nameAlias of nameAliases ?? []) {
      addPromptName(context, nameAlias, label);
    }
    if (imageIdx !== undefined) {
      context.byImageIndex.set(imageIdx, label);
    }
  };

  const referenceCandidates = rawReferenceEntries
    .map((entry) => {
      const originalName = entry.name;
      const resolvedName = placeholderMap.get(originalName) ?? originalName;
      return {
        originalName,
        resolvedName,
        nameAliases: entry.nameAliases,
        imageIdx:
          resolveCharacterImageIndex(originalName, params.imageIndexMap) ??
          resolveCharacterImageIndex(resolvedName, params.imageIndexMap),
      };
    })
    .sort((a, b) => (a.imageIdx ?? Number.MAX_SAFE_INTEGER) - (b.imageIdx ?? Number.MAX_SAFE_INTEGER));

  for (const candidate of referenceCandidates) {
    addCandidate(
      candidate.resolvedName,
      candidate.imageIdx,
      candidate.originalName,
      candidate.nameAliases,
    );
  }

  for (const name of sceneCharacterNames) {
    addCandidate(name, resolveCharacterImageIndex(name, params.imageIndexMap));
  }

  for (const char of params.realWorldCharacters ?? []) {
    addCandidate(
      char.name,
      resolveCharacterImageIndex(char.name, params.imageIndexMap),
      undefined,
      char.nameAliases,
    );
  }

  normalizeReplacementAliases(context);
  applyReferenceBindingAliases(context, params.referenceImages);

  return context;
}

function replacePromptNames(text: string, nameContext?: PromptNameContext): string {
  if (!nameContext || !text.trim()) return text;
  let result = text;
  for (const { alias, label } of nameContext.replacementAliases) {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_])(${escapeRegExp(alias)})(?=$|[^\\p{L}\\p{N}_])`,
      'giu',
    );
    result = result.replace(pattern, `$1${label}`);
  }
  return cleanupPromptText(result);
}

function getPromptLabelForName(
  name: string,
  nameContext?: PromptNameContext,
  imageIdx?: number,
): string {
  if (imageIdx !== undefined) {
    const byImage = nameContext?.byImageIndex.get(imageIdx);
    if (byImage) return byImage;
  }
  const normalized = normalizedPromptName(name);
  return nameContext?.byNormalizedName.get(normalized) ?? fallbackPromptLabel(name, imageIdx);
}

function promptReferenceLabel(
  label: string,
  imageIdx?: number,
  ref?: ReferenceBindingInput,
): string {
  if (ref) {
    return referenceBindingLabel(ref, imageIdx);
  }
  void imageIdx;
  return label;
}

function sanitizeSettingForImagePrompt(setting: string): string {
  if (!setting.trim()) return setting;
  let sanitized = setting;
  sanitized = sanitized.replace(/\[\s*(?:STYLE|PROMPT|NOTE|INSTRUCTION|CAMERA|LIGHTING)\s*:[^\]]*\]/gi, '');
  const inlineStyleClauses = [
    /\b(?:a|an)\s+watercolor\s+children[’'`]s-book\s+look\b[^.?!;]*/gi,
    /\b(?:a|an)\s+storybook\s+look\b[^.?!;]*/gi,
    /\b(?:with|showing)\s+soft\s+washes\b[^.?!;]*/gi,
    /\bwith\s+paper\s+texture\b[^.?!;]*/gi,
    /\bhand-painted\s+look\b[^.?!;]*/gi,
  ];
  for (const pattern of inlineStyleClauses) {
    sanitized = sanitized.replace(pattern, '');
  }
  const stylePatterns = [
    /watercolor/i,
    /paper texture/i,
    /children[’'`]s-book look/i,
    /children[’'`]s book look/i,
    /storybook look/i,
    /hand-painted look/i,
    /colored pencil/i,
    /comic illustration/i,
    /anime/i,
    /\b3d\b/i,
    /claymation/i,
    /felt craft/i,
    /cel[- ]shaded/i,
    /line art/i,
  ];

  const filtered = sanitized
    .split(/(?<=[.!?;])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !stylePatterns.some((pattern) => pattern.test(part)));

  return cleanupPromptText(filtered.join(' '));
}

function sanitizeEnvironmentDescriptionForReferenceImage(description: string): string {
  if (!description.trim()) return description;
  let sanitized = stripAllTags(description);

  sanitized = sanitized.replace(/\s*\[ID:\s*[0-9a-f-]{8,}\]/giu, '');

  // Treat character-owned body/location names as inert terrain for environment plates.
  sanitized = sanitized.replace(
    /\bon top of\s+[\p{Lu}][\p{L}'’`-]*[’'`]\s*s\s+shell\b/giu,
    'on top of a large inert shell-shaped landform',
  );
  sanitized = sanitized.replace(
    /\bthe rounded rise of\s+(?!shell[’'`]\s*s\b)[\p{L}][\p{L}'’`-]*[’'`]\s*s\s+shell\s+pushing up from under/giu,
    'the rounded rise of a large inert shell-shaped mound under',
  );
  sanitized = sanitized.replace(
    /\b(?!shell[’'`]\s*s\b)[\p{L}][\p{L}'’`-]*[’'`]\s*s\s+shell\b/giu,
    'a large inert shell-shaped landform',
  );
  sanitized = sanitized.replace(
    /\b(?!shell[’'`]\s*s\b)[\p{L}][\p{L}'’`-]*[’'`]\s*s\s+([a-z][\p{L}-]*)\b/giu,
    'the $1',
  );
  sanitized = sanitized.replace(/\bthe\s+the\b/gi, 'the');

  // Scale comparisons must not invite the character into the environment image.
  sanitized = sanitized.replace(
    /\(\s*(?:to|for|relative to|compared to)\s+[\p{Lu}][\p{L}'’`-]*(?:\s+[A-Z][\p{L}'’`-]*)?\s*\)/gu,
    '(small-story scale)',
  );
  sanitized = sanitized.replace(
    /\b(?:waist|knee|ankle|shoulder|head)[-\s]high\s+\(small-story scale\)/gi,
    'small-story-scale height',
  );
  sanitized = sanitized.replace(
    /\b(?:waist|knee|ankle|shoulder|head)[-\s]high\s+to\s+[\p{Lu}][\p{L}'’`-]*\b/gu,
    'small-story-scale height',
  );

  // Environment references are reusable plates, so living extras become static traces.
  const creatureWords =
    '(?:people|persons|children|kids|boys|girls|adults|characters|animals|creatures|snails|birds|mice|rabbits|dogs|cats|insects|butterflies|bees)';
  sanitized = sanitized.replace(
    new RegExp(`\\bwhere\\s+${creatureWords}\\s+(?:gather|stand|sit|wait|rest|sleep|hide|play|walk|move)\\b`, 'giu'),
    'where small static traces remain',
  );
  sanitized = sanitized.replace(
    new RegExp(`\\b${creatureWords}\\s+(?:gather|stand|sit|wait|rest|sleep|hide|play|walk|move)\\b`, 'giu'),
    'small static traces remain',
  );

  return cleanupPromptText(sanitized);
}

export function buildEnvironmentImageCacheDescription(description: string): string {
  return `${ENVIRONMENT_REFERENCE_CACHE_PREFIX} ${sanitizeEnvironmentDescriptionForReferenceImage(description)}`;
}

export function isCurrentEnvironmentImageCacheDescription(description: string | null | undefined): boolean {
  return !!description?.startsWith(ENVIRONMENT_REFERENCE_CACHE_PREFIX);
}

function canonicalizeReferenceNameMentions(text: string, canonicalNames: string[]): string {
  let result = text;
  for (const canonicalName of canonicalNames) {
    const base = stripCharacterIdFromName(canonicalName).trim();
    if (!base) continue;
    const ascii = anyAscii(base).trim();
    const phonetic = toPhoneticKey(base);
    const crossScript = crossScriptIdentityKey(base);
    const aliases = new Set<string>([base]);
    if (ascii) {
      aliases.add(ascii);
      aliases.add(ascii.replace(/ii/g, 'i'));
      aliases.add(ascii.replace(/iya$/i, 'ia'));
      aliases.add(ascii.replace(/^ie/i, 'e'));
      aliases.add(ascii.replace(/^ye/i, 'e'));
    }
    if (phonetic) {
      aliases.add(phonetic);
      aliases.add(phonetic.replace(/^ie/i, 'e'));
      aliases.add(phonetic.replace(/^ye/i, 'e'));
    }
    if (crossScript) {
      aliases.add(crossScript);
      aliases.add(crossScript.replace(/^ie/i, 'e'));
      aliases.add(crossScript.replace(/^ye/i, 'e'));
    }
    for (const alias of aliases) {
      if (!alias || alias.toLowerCase() === base.toLowerCase()) continue;
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi');
      result = result.replace(pattern, base);
    }
  }
  return result;
}

function sanitizeCharacterDescriptionForImagePrompt(
  description: string,
  opts: { canonicalNames: string[] },
): string {
  let result = canonicalizeReferenceNameMentions(description, opts.canonicalNames);
  result = result.replace(/\bas if [^.;,]+/gi, '');
  result = result.replace(/\bas though [^.;,]+/gi, '');
  result = result.replace(/\bto help [^.;,]+/gi, '');
  return cleanupPromptText(result);
}

function stripWardrobeTextForFinalScene(text: string): string {
  if (!text.trim()) return text;
  const garmentTerms =
    'outfit|clothes|clothing|wardrobe|shirt|t-shirt|tee|blouse|jacket|coat|raincoat|poncho|vest|sweater|hoodie|pants|trousers|jeans|shorts|skirt|dress|uniform|costume|cape|armor|apron|pajamas|pyjamas|swimsuit|boots|shoes|sneakers|sandals|slippers|hat|cap|helmet|hood|scarf|gloves|mittens|belt|collar|sleeve|hem|zipper';
  const garmentPattern = new RegExp(`\\b(?:${garmentTerms})\\b`, 'i');
  let result = text;

  const wardrobeClauses = [
    /\b(?:wearing|dressed in|clad in|outfitted in|costumed in)\b[^.;,]*/gi,
    new RegExp(`\\b(?:in|with)\\s+(?:a|an|the)?\\s*[^.;,]*(?:${garmentTerms})\\b[^.;,]*`, 'gi'),
    new RegExp(`\\b(?:toward|towards|at|on|onto|into)\\s+(?:the\\s+)?(?:${garmentTerms})\\b[^.;,]*`, 'gi'),
  ];
  for (const pattern of wardrobeClauses) {
    result = result.replace(pattern, '');
  }

  result = result
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !garmentPattern.test(part))
    .join(', ');

  return cleanupPromptText(result);
}

function sanitizeSceneCharacterDescriptionForImagePrompt(
  description: string,
  opts: { canonicalNames: string[] },
): string {
  return stripWardrobeTextForFinalScene(
    sanitizeCharacterDescriptionForImagePrompt(description, opts),
  );
}

function cleanupPromptText(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([.])\1+/g, '.')
    .replace(/;\s*;/g, '; ')
    .replace(/,\s*,/g, ', ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function buildCompositionText(params: {
  sceneVisual: SceneVisual;
  imageIndexMap?: Map<string, number>;
  referenceCharacterNames?: Array<string | { name: string; isTurnaround?: boolean; nameAliases?: string[] }>;
  realWorldCharacters?: Array<{ name: string; description: string; nameAliases?: string[] }>;
  referenceImages?: ReferenceBindingInput[];
  nameContext?: PromptNameContext;
}): string {
  const cam = params.sceneVisual.cameraComposition;
  if (typeof cam === 'string') {
    const canonical = canonicalizeReferenceNameMentions(cleanupPromptText(cam), [
      ...(params.referenceCharacterNames ?? []).map((entry) => typeof entry === 'string' ? entry : entry.name),
      ...(params.realWorldCharacters ?? []).map((char) => char.name),
    ]);
    return replacePromptNames(stripWardrobeTextForFinalScene(canonical), params.nameContext);
  }

  const canonicalNames = [
    ...(params.referenceCharacterNames ?? []).map((entry) => typeof entry === 'string' ? entry : entry.name),
    ...(params.realWorldCharacters ?? []).map((char) => char.name),
  ];
  const shot = replacePromptNames(
    stripWardrobeTextForFinalScene(
      cleanupPromptText(canonicalizeReferenceNameMentions(cam.shot, canonicalNames)),
    ),
    params.nameContext,
  );
  const characterLines = cam.characters.map((character) => {
    const description = replacePromptNames(
      sanitizeSceneCharacterDescriptionForImagePrompt(character.description, {
        canonicalNames,
      }),
      params.nameContext,
    );
    const imageIdx = resolveCharacterImageIndex(character.name, params.imageIndexMap);
    const promptLabel = getPromptLabelForName(character.name, params.nameContext, imageIdx);
    const ref = findCharacterReferenceBinding(character.name, params.referenceImages);
    const label = promptReferenceLabel(promptLabel, imageIdx, ref);
    return formatCharacterLocationLine({ label, description });
  });

  return cleanupPromptText(`${shot}. ${characterLines.join(' ')}`);
}

export interface CharacterReference {
  name: string;
  referencePhotos?: Array<{ url: string; purpose?: string }>;
  appearanceTraits?: any;
  appearance?: string; // LLM-generated description
  description?: string;
}

/**
 * Build complete image prompt for a scene.
 *
 * New structured format (Google Asset Graph pattern):
 *   Image labels + SETTING + CAMERA (with Image N refs) + CHARACTERS (with Image N refs) + LIGHTING
 *   STYLE, FORMAT, and QUALITY are in systemInstruction (not repeated here).
 *
 * Supports two character types:
 *   - Real-world characters (people, animals): text description from Gemini Vision
 *   - Imaginary creatures (child's drawings): reference drawing attached as image
 */
export function buildSceneImagePrompt(params: {
  sceneVisual?: SceneVisual; // New structured visual (preferred)
  visualPrompt?: string; // Deprecated fallback for old stories
  ageGroup: string;
  style: string;
  // Imaginary creatures with reference drawings attached as images
  referenceCharacterNames?: Array<string | { name: string; isTurnaround?: boolean; nameAliases?: string[] }>;
  // Real-world characters (people, animals) with text descriptions from Gemini Vision
  realWorldCharacters?: Array<{ name: string; description: string; nameAliases?: string[] }>;
  hasReferences?: boolean;
  // Google Asset Graph pattern: maps normalized character name -> Image index
  imageIndexMap?: Map<string, number>;
  referenceImages?: ReferenceBindingInput[];
  // Current scene's environment (moved from system instruction to user prompt)
  currentEnvironment?: StoryEnvironment;
  // Legacy params kept for non-reference (Imagen 3) path
  characters?: CharacterReference[];
  negativePrompt?: string;
  scenarioCardId?: string;
  // When true: SETTING uses only scene-specific delta (env image provides layout)
  hasEnvironmentImageRef?: boolean;
}): string {
  const imagePolicy = getImageContentPolicy({ ageGroup: params.ageGroup, scenarioCardId: params.scenarioCardId });
  const stylePrefix = getImageStylePrefix(params.style, params.ageGroup, params.scenarioCardId);
  const safetyAdditions = imagePolicy.imageSafetyAdditions;

  // --- New structured path (sceneVisual available) ---
  if (params.sceneVisual) {
    return buildStructuredPrompt({
      sceneVisual: params.sceneVisual,
      stylePrefix,
      safetyAdditions,
      referenceCharacterNames: params.referenceCharacterNames,
      realWorldCharacters: params.realWorldCharacters,
      hasReferences: params.hasReferences,
      imageIndexMap: params.imageIndexMap,
      referenceImages: params.referenceImages,
      currentEnvironment: params.currentEnvironment,
      hasEnvironmentImageRef: params.hasEnvironmentImageRef,
    });
  }

  // --- Legacy fallback (old stories with string visualPrompt) ---
  const cleanVisualPrompt = stripAllTags(params.visualPrompt || '');

  if (params.hasReferences) {
    const legacyNameContext = buildPromptNameContext({
      sceneVisual: {
        setting: cleanVisualPrompt,
        cameraComposition: {
          shot: cleanVisualPrompt,
          characters: [
            ...(params.referenceCharacterNames ?? []).map((entry) => ({
              name: typeof entry === 'string' ? entry : entry.name,
              description: '',
            })),
            ...(params.realWorldCharacters ?? []).map((char) => ({
              name: char.name,
              description: '',
            })),
          ],
        },
        lighting: '',
      } as SceneVisual,
      imageIndexMap: params.imageIndexMap,
      referenceCharacterNames: params.referenceCharacterNames,
      realWorldCharacters: params.realWorldCharacters,
      referenceImages: params.referenceImages,
    });
    const characterLines = buildCharacterSection(
      params.realWorldCharacters,
      params.referenceCharacterNames,
      true,
      params.imageIndexMap,
      params.referenceImages,
      legacyNameContext,
    );
    const charSection = characterLines ? `\n\n${characterLines}` : '';
    return `${stylePrefix}, ${replacePromptNames(cleanVisualPrompt, legacyNameContext)}${charSection}, ${safetyAdditions}.`;
  }

  // Non-reference legacy path (Imagen 3)
  let characterPart = '';
  if (params.characters && params.characters.length > 0) {
    const characterDescriptions = buildCharacterDescriptions(params.characters);
    if (characterDescriptions) characterPart = `, ${characterDescriptions}`;
  }
  const negativeToUse = removeUserPromptTextBanNegativeTerms(
    params.negativePrompt ?? imagePolicy.imageNegativePrompt,
  );
  const negativeGuidance = negativeToUse ? `, avoid: ${negativeToUse}` : '';

  const fullPrompt = `${stylePrefix}${characterPart}, ${cleanVisualPrompt}, ${safetyAdditions}${negativeGuidance}`;
  return optimizePromptLength(fullPrompt, 2000);
}

/**
 * Build new structured prompt from sceneVisual fields.
 * Google Asset Graph pattern: scene-specific SETTING, CAMERA, CHARACTERS, LIGHTING.
 * Also includes per-scene CHARACTER ROSTER and ENVIRONMENT (moved from system instruction
 * to reduce token overhead — each API call is independent, no multi-turn context).
 */
function buildStructuredPrompt(params: {
  sceneVisual: SceneVisual;
  stylePrefix: string;
  safetyAdditions: string;
  referenceCharacterNames?: Array<string | { name: string; isTurnaround?: boolean; nameAliases?: string[] }>;
  realWorldCharacters?: Array<{ name: string; description: string; nameAliases?: string[] }>;
  hasReferences?: boolean;
  imageIndexMap?: Map<string, number>;
  referenceImages?: ReferenceBindingInput[];
  currentEnvironment?: StoryEnvironment;
  hasEnvironmentImageRef?: boolean;
}): string {
  const { sceneVisual, hasEnvironmentImageRef } = params;
  const nameContext = buildPromptNameContext({
    sceneVisual,
    imageIndexMap: params.imageIndexMap,
    referenceCharacterNames: params.referenceCharacterNames,
    realWorldCharacters: params.realWorldCharacters,
    referenceImages: params.referenceImages,
  });

  const sections: string[] = [];

  // SETTING (scene-specific). When env image ref: only delta, labeled "Scene-specific"
  if (sceneVisual.setting) {
    const settingLabel = hasEnvironmentImageRef ? 'Scene-specific' : 'Scene';
    const sanitizedSetting = replacePromptNames(
      sanitizeSettingForImagePrompt(sceneVisual.setting),
      nameContext,
    );
    if (sanitizedSetting) {
      sections.push(`- ${settingLabel}: ${sanitizedSetting}`);
    }
  }

  // CHARACTERS — with Image N back-references and inline descriptions
  const characterLines = buildCharacterSection(
    params.realWorldCharacters,
    params.referenceCharacterNames,
    params.hasReferences,
    params.imageIndexMap,
    params.referenceImages,
    nameContext,
  );
  if (characterLines) {
    sections.push(characterLines);
  }

  // CAMERA / COMPOSITION (may contain character positions with Image N refs)
  if (sceneVisual.cameraComposition) {
    const composition = buildCompositionText({
      sceneVisual,
      imageIndexMap: params.imageIndexMap,
      referenceCharacterNames: params.referenceCharacterNames,
      realWorldCharacters: params.realWorldCharacters,
      referenceImages: params.referenceImages,
      nameContext,
    });
    sections.push(`- Composition: ${composition}`);
  }

  // LIGHTING (scene-specific)
  if (sceneVisual.lighting) {
    sections.push(`- Lighting: ${replacePromptNames(cleanupPromptText(sceneVisual.lighting), nameContext)}`);
  }

  // Safety: keep concise and at the end. Format/text bans live in systemInstruction.
  sections.push(`- ${params.safetyAdditions}`);

  return sections.join('\n');
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build unified CHARACTERS section with per-character instructions.
 * Uses Google's "Image N" back-references for characters with visual references.
 * Real-world characters get their description inline (no longer in system instruction).
 * Scene wardrobe is already baked into dressed character references; text outfit
 * descriptions are intentionally not sent to the final scene generator.
 */
function buildCharacterSection(
  realWorldCharacters?: Array<{ name: string; description: string; nameAliases?: string[] }>,
  referenceCharacterNames?: Array<string | { name: string; isTurnaround?: boolean; nameAliases?: string[] }>,
  _hasReferences?: boolean,
  imageIndexMap?: Map<string, number>,
  referenceImages?: ReferenceBindingInput[],
  nameContext?: PromptNameContext,
): string {
  const lines: string[] = [];
  const referenceBackedNames = new Set<string>();
  const resolvedReferenceNames = new Map<string, string>();

  const placeholderMap = buildPlaceholderReferenceNameMap(
    (referenceCharacterNames ?? []).map((entry) => typeof entry === 'string' ? entry : entry.name),
    (realWorldCharacters ?? []).map((char) => char.name),
  );
  for (const [placeholderName, resolvedName] of placeholderMap) {
    resolvedReferenceNames.set(placeholderName, resolvedName);
  }

  // Reference-backed characters are described by their adjacent image labels.
  // Keep them out of text descriptions so prompt text cannot compete with the
  // visual source of truth.
  if (referenceCharacterNames) {
    for (const entry of referenceCharacterNames) {
      const originalName = typeof entry === 'string' ? entry : entry.name;
      const name = resolvedReferenceNames.get(originalName) ?? originalName;
      referenceBackedNames.add(stripCharacterIdFromName(name).trim().toLowerCase());
    }
  }

  // Real-world characters: inline description (moved from system instruction)
  if (realWorldCharacters) {
    for (const char of realWorldCharacters) {
      const normalized = stripCharacterIdFromName(char.name).trim().toLowerCase();
      if (referenceBackedNames.has(normalized)) {
        continue;
      }
      const imgIdx = resolveCharacterImageIndex(char.name, imageIndexMap);
      const promptLabel = getPromptLabelForName(char.name, nameContext, imgIdx);
      const identityRef = findCharacterReferenceBinding(char.name, referenceImages);
      const desc = replacePromptNames(stripWardrobeTextForFinalScene(char.description), nameContext);
      if (imgIdx) {
        lines.push(`- ${promptReferenceLabel(promptLabel, imgIdx, identityRef)}: ${desc}`);
      } else {
        lines.push(`- ${promptReferenceLabel(promptLabel, undefined, identityRef)}: ${desc}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Build character descriptions for inclusion in prompt
 */
function buildCharacterDescriptions(characters?: CharacterReference[]): string {
  if (!characters || characters.length === 0) return '';
  
  const descriptions = characters.map(char => {
    // Priority: appearance (LLM-generated) > description > appearanceTraits
    if (char.appearance) {
      return char.appearance;
    }
    
    if (char.description) {
      return `${char.name}: ${char.description}`;
    }
    
    // Build from appearanceTraits if available
    if (char.appearanceTraits) {
      const traits = char.appearanceTraits;
      const parts: string[] = [char.name];
      
      if (traits.hairColor) parts.push(`${traits.hairColor} hair`);
      if (traits.hairStyle) parts.push(`${traits.hairStyle} hairstyle`);
      if (traits.eyeColor) parts.push(`${traits.eyeColor} eyes`);
      if (traits.skinTone) parts.push(`${traits.skinTone} skin`);
      if (traits.height) parts.push(traits.height);
      if (traits.build) parts.push(traits.build);
      if (traits.clothingStyle) parts.push(traits.clothingStyle); // NEW: Add clothing style
      
      return parts.join(', ');
    }
    
    return char.name;
  });
  
  return descriptions.length > 0 ? `Characters: ${descriptions.join('; ')}` : '';
}

/**
 * Build prompt for environment reference image (Gemini Flash Image).
 * Style-neutral full-color reference with stable layout, palette, lighting, and material cues.
 */
export function buildEnvironmentImagePrompt(params: {
  environment: StoryEnvironment;
  scenarioCardId?: string;
}): string {
  const imagePolicy = getImageContentPolicy({
    ageGroup: '4-5',
    scenarioCardId: params.scenarioCardId,
  });
  const stylePrefix =
    config.image.environmentImageStyle ||
    'style-neutral full-color location design plate, clean readable shapes, natural color blocking, soft directional light, visible form shading, material identity cues, atmospheric depth, clear spatial layout';
  const safetyAdditions = imagePolicy.imageSafetyAdditions;
  const environmentDescription = sanitizeEnvironmentDescriptionForReferenceImage(
    params.environment.description,
  );

  const parts = [
    'ENVIRONMENT REFERENCE PLATE ONLY: draw a reusable empty location/terrain plate, not a story moment',
    stylePrefix,
    environmentDescription,
    'Make this a finished color establishing background reference, not a sketch, not a blueprint, not a coloring page, not line art. Use filled colors, soft shadows, ambient occlusion, foreground/midground/background separation, and readable depth.',
    'Do not lock the final art medium. Avoid strong watercolor paper texture, plasticine fingerprints, felt fibers, colored-pencil strokes, comic ink styling, cel-animation linework, or glossy 3D render cues unless explicitly requested by ENVIRONMENT_IMAGE_STYLE.',
    'Show object material identity and volume in a medium-neutral way: stone blocks have warm/cool color variation and shaded sides, wood has grain direction and thickness, fabric has folds, foliage has layered greens, roads and paths have textured surfaces.',
    'Add small non-story incidental details that naturally belong to this specific location and material world. Use secondary local texture, tiny surface variation, small props, color accents, and age/wear/weather traces to make the place feel rich and lived-in, without creating new landmarks, story objects, or competing focal points.',
    'Keep functional architectural elements physically anchored and usable: doors, windows, hatches, stairwells, handles, gates, bridges, shelves, rails, pipes, controls, and openings belong in clear walls, floors, frames, hinges, supports, or paths. Show enough surrounding structure to make where they lead or how they work visually clear; avoid freestanding doors, floating handles, decorative false openings, or impossible access unless explicitly described.',
    'Use a coherent palette and lighting mood that later scene images can reuse. Avoid blank white interiors, flat white skies, empty white ground, or thin grey outlines as the main look.',
    'Key objects must be in fixed positions relative to each other. Maintain consistent spatial layout: left, center, right. Show relationships clearly (path beside tree, bushes left of path, house behind trees).',
    'Empty location, no people, no characters, no animals, no creatures, no faces, no eyes, no limbs, no silhouettes, no living figures, wide 16:9 establishing shot.',
    'If a character name appears as a place owner, scale cue, or location name, treat it only as non-visual metadata and do not draw that character.',
    'If a shell, den, nest, or animal body is used as terrain, render only an inert landform or prop with no head, legs, eyes, face, skin, motion, or creature anatomy.',
    'If the source description mentions animals or insects gathering, omit the living creatures and show only static environmental traces if needed.',
    safetyAdditions,
  ];

  return parts
    .filter(Boolean)
    .map((part) => cleanupPromptText(part).replace(/[.?!]+$/g, ''))
    .filter(Boolean)
    .join('. ') + '.';
}

/**
 * Build prompt for generating a character portrait
 * Used for creating reference images when user hasn't provided any
 */
export function buildCharacterPortraitPrompt(params: {
  characterName: string;
  description: string;
  style: string;
  ageGroup: string;
  characterType?: string;
  negativePrompt?: string; // Negative prompt to include as text
  scenarioCardId?: string;
}): string {
  const imagePolicy = getImageContentPolicy({ ageGroup: params.ageGroup, scenarioCardId: params.scenarioCardId });
  const stylePrefix = getImageStylePrefix(params.style, params.ageGroup, params.scenarioCardId);
  const safetyAdditions = imagePolicy.imageSafetyAdditions;

  // Build negative guidance as text (since API doesn't support negativePrompt parameter)
  const negativeToUse = removeUserPromptTextBanNegativeTerms(
    params.negativePrompt ?? imagePolicy.imageNegativePrompt,
  );
  const negativeGuidance = negativeToUse
    ? `, avoid: ${negativeToUse}`
    : '';

  return `${stylePrefix}, character portrait, close-up view, ${params.description}, clear details, front-facing, ${safetyAdditions}${negativeGuidance}`;
}

/**
 * Text-to-image prompt for a canonical outfit plate (Gemini Flash Image).
 * Minimal prompt: centered mannequin + `characterOutfits` string does the work (long rules tended to leak as fake UI).
 */
export function buildOutfitPlatePrompt(params: {
  outfitDescription: string;
  imageStyle: string;
  ageGroup: string;
  scenarioCardId?: string;
}): string {
  const imagePolicy = getImageContentPolicy({
    ageGroup: params.ageGroup,
    scenarioCardId: params.scenarioCardId,
  });
  const safetyAdditions = imagePolicy.imageSafetyAdditions;
  const spec = params.outfitDescription.trim().replace(/\.+$/, '').trim();

  return [
    `Children's book illustration, ${params.imageStyle}: one smooth display mannequin stands in the center, full length, facing forward, blank smooth head, wearing ${spec}. The mannequin is a clean clothing display only: smooth continuous limbs, no visible mechanical hinge joints, no peg joints, no segmented elbows, no segmented knees, no articulated wrists or ankles.`,
    'Plain soft background. No letters or words in the image. Only this one mannequin. Keep the mannequin neutral and non-mechanical so the image reads as wardrobe reference only.',
    safetyAdditions,
  ]
    .filter(Boolean)
    .join(' ');
}

// buildReferenceInstruction() removed — per-character instructions are now part of buildCharacterSection()

/**
 * Build a system instruction that contains the static parts of the image
 * generation context (style, character descriptions, quality rules).
 *
 * This is set once per story and reused across all scenes via the
 * `systemInstruction` field in GenerateContentConfig, keeping the per-scene
 * user prompt lean (only dynamic scene-specific content).
 *
 * The model treats system instructions as persistent context with higher
 * priority than user messages, and Google may cache repeated system
 * instructions internally for reduced latency / cost.
 */
export function buildImageSystemInstruction(params: {
  style: string;
  ageGroup: string;
  hasReferences?: boolean;
  hasEnvironmentReference?: boolean;
  scenarioCardId?: string;
}): string {
  const stylePrefix = getImageStylePrefix(params.style, params.ageGroup, params.scenarioCardId);
  const sections: string[] = [];

  // Role
  sections.push('You are a professional children\'s book illustrator.');

  // Art style
  sections.push(`ART STYLE: ${stylePrefix}`);

  // Format rules
  sections.push(
    `FORMAT: Single full-bleed illustration filling the frame edge-to-edge. ${NO_VISIBLE_TEXT_OR_REFERENCE_LABELS_RULE} Pure visual storytelling only.`,
  );

  // Reference image rules (only when turnaround sheets are attached)
  if (params.hasReferences) {
    sections.push(
      'REFERENCES: Character sheets establish locked IDENTITY: face, age, body proportions, silhouette, exact hairstyle structure, hair placement, skin/hair palette, distinctive marks, and visible wardrobe when present in the attached reference. Keep those traits exactly recognizable while rendering them in the scene art style. Preserve hair and facial identity faithfully; avoid redesigning, re-braiding, re-styling, simplifying, beautifying, or reinterpreting them.',
    );
  }

  // Environment reference rules (when env image is attached)
  if (params.hasEnvironmentReference) {
    sections.push(
      'ENVIRONMENT REFERENCE: The provided location image defines reusable layout, spatial structure, key objects, material identity, palette family, and lighting mood. Keep the same location and spatial relationships while rendering it in the selected scene art style. Preserve object positions, color-family continuity, depth cues, and the placement of key objects such as trees, buildings, and furniture. Character positions are relative to these fixed objects.',
    );
  }

  return sections.join('\n\n');
}

/**
 * Optimize prompt length to stay within recommended limits
 * Truncates at word boundary if prompt exceeds maxLength
 */
function optimizePromptLength(prompt: string, maxLength: number = 2000): string {
  if (prompt.length <= maxLength) {
    return prompt;
  }
  
  logger.warn({
    originalLength: prompt.length,
    maxLength,
    excess: prompt.length - maxLength
  }, 'Prompt exceeds recommended length, truncating');
  
  // Truncate at word boundary
  const truncated = prompt.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return lastSpace > 0 
    ? truncated.substring(0, lastSpace) + '...' 
    : truncated + '...';
}

/**
 * Extract scene characters from scene text
 * Simple implementation that looks for character names in the text
 */
export function extractSceneCharacters(
  sceneText: string,
  allCharacters: CharacterReference[]
): CharacterReference[] {
  const sceneLower = sceneText.toLowerCase();
  
  return allCharacters.filter(char => {
    const nameLower = char.name.toLowerCase();
    return sceneLower.includes(nameLower);
  });
}
