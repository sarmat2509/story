/**
 * Image Prompt Engineering
 * Functions for building prompts for image generation with character consistency
 */

import { stripCharacterIdFromName } from '@wondertales/shared';
import anyAscii from 'any-ascii';
import { stripAllTags } from '../../utils/audioTags';
import { logger } from '../../utils/logger';
import { flattenCameraComposition, type SceneVisual } from '../../services/types';
import { buildPlaceholderReferenceNameMap, isPlaceholderReferenceName } from '../../services/referenceImageBuckets';
import type { StoryEnvironment } from '../../ai/types';
import { getImageStylePrefix } from './styles';
import { getImageContentPolicy } from '../contentPolicy';
import { config } from '../../config';
import { crossScriptIdentityKey, toPhoneticKey } from '../../utils/characterNormalization';
import {
  isNaturalAppearanceOutfit,
  lookupOutfitForCharacterName,
} from '../../utils/characterOutfits';

/**
 * Resolve outfit plate "Image N" index for a character (map keys may be full or base names).
 */
function resolveOutfitPlateImageIndex(
  characterName: string,
  plateMap?: Map<string, number>,
): number | undefined {
  if (!plateMap || plateMap.size === 0) return undefined;
  if (plateMap.has(characterName)) return plateMap.get(characterName);
  const base = stripCharacterIdFromName(characterName).trim();
  if (base && plateMap.has(base)) return plateMap.get(base);
  const lower = base.toLowerCase();
  for (const [k, v] of plateMap) {
    if (stripCharacterIdFromName(k).trim().toLowerCase() === lower) return v;
  }
  return undefined;
}

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

function aliasSuffix(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function subjectAlias(index: number): string {
  return `Subject ${aliasSuffix(index)}`;
}

function clothesAliasForSubject(alias?: string): string | undefined {
  return alias ? alias.replace(/^Subject\b/, 'Clothes') : undefined;
}

type SubjectAliasContext = {
  byNormalizedName: Map<string, string>;
  byImageIndex: Map<number, string>;
  replacementAliases: Array<{ alias: string; subject: string }>;
};

function normalizedSubjectName(name: string): string {
  return stripCharacterIdFromName(name).trim().toLowerCase();
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

function addSubjectAliasName(
  context: SubjectAliasContext,
  name: string,
  alias: string,
): void {
  const normalized = normalizedSubjectName(name);
  if (normalized) context.byNormalizedName.set(normalized, alias);
  for (const variant of nameAliasVariants(name)) {
    context.replacementAliases.push({ alias: variant, subject: alias });
  }
}

function buildSubjectAliasContext(params: {
  sceneVisual: SceneVisual;
  imageIndexMap?: Map<string, number>;
  referenceCharacterNames?: Array<string | { name: string; isTurnaround?: boolean; nameAliases?: string[] }>;
  realWorldCharacters?: Array<{ name: string; description: string; nameAliases?: string[] }>;
}): SubjectAliasContext {
  const context: SubjectAliasContext = {
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
  let nextAliasIndex = 0;

  const addCandidate = (
    name: string | undefined,
    imageIdx?: number,
    originalName?: string,
    nameAliases?: string[],
  ) => {
    if (!name) return;
    const normalized = normalizedSubjectName(name);
    if (!normalized) return;
    let alias = context.byNormalizedName.get(normalized);
    if (!alias) {
      alias = subjectAlias(nextAliasIndex);
      nextAliasIndex += 1;
    }
    addSubjectAliasName(context, name, alias);
    if (originalName && originalName !== name) {
      addSubjectAliasName(context, originalName, alias);
    }
    for (const nameAlias of nameAliases ?? []) {
      addSubjectAliasName(context, nameAlias, alias);
    }
    if (imageIdx !== undefined) {
      context.byImageIndex.set(imageIdx, alias);
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

  context.replacementAliases = context.replacementAliases
    .filter((entry, index, list) =>
      list.findIndex((other) =>
        other.alias.toLowerCase() === entry.alias.toLowerCase() && other.subject === entry.subject,
      ) === index,
    )
    .sort((a, b) => b.alias.length - a.alias.length);

  return context;
}

function replaceSubjectNames(text: string, aliasContext?: SubjectAliasContext): string {
  if (!aliasContext || !text.trim()) return text;
  let result = text;
  for (const { alias, subject } of aliasContext.replacementAliases) {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_])(${escapeRegExp(alias)})(?=$|[^\\p{L}\\p{N}_])`,
      'giu',
    );
    result = result.replace(pattern, `$1${subject}`);
  }
  return cleanupPromptText(result);
}

function getSubjectAliasForName(
  name: string,
  aliasContext?: SubjectAliasContext,
  imageIdx?: number,
): string {
  if (imageIdx !== undefined) {
    const byImage = aliasContext?.byImageIndex.get(imageIdx);
    if (byImage) return byImage;
  }
  const normalized = normalizedSubjectName(name);
  return aliasContext?.byNormalizedName.get(normalized) ?? 'Subject';
}

function formatOutfitPlateCrossRef(
  plateIdx: number,
  identityImageIdx?: number,
  subject?: string,
): string {
  const subjectLabel = subject ?? 'the matching subject';
  const clothesLabel = clothesAliasForSubject(subject) ?? 'the clothing/accessories';
  if (identityImageIdx !== undefined && identityImageIdx !== plateIdx) {
    return ` Draw ${subjectLabel} from Image ${identityImageIdx} wearing ${clothesLabel} from Image ${plateIdx}. Image ${identityImageIdx} is PERSON SOURCE; Image ${plateIdx} is CLOTHES SOURCE only.`;
  }
  return ` ${subjectLabel} is wearing ${clothesLabel} from Image ${plateIdx}. Image ${plateIdx} is CLOTHES SOURCE only; do not let it change face, hair, body identity, or silhouette.`;
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
  aliasContext?: SubjectAliasContext;
}): string {
  const cam = params.sceneVisual.cameraComposition;
  if (typeof cam === 'string') {
    const canonical = canonicalizeReferenceNameMentions(cleanupPromptText(cam), [
      ...(params.referenceCharacterNames ?? []).map((entry) => typeof entry === 'string' ? entry : entry.name),
      ...(params.realWorldCharacters ?? []).map((char) => char.name),
    ]);
    return replaceSubjectNames(canonical, params.aliasContext);
  }

  const canonicalNames = [
    ...(params.referenceCharacterNames ?? []).map((entry) => typeof entry === 'string' ? entry : entry.name),
    ...(params.realWorldCharacters ?? []).map((char) => char.name),
  ];
  const shot = replaceSubjectNames(
    cleanupPromptText(canonicalizeReferenceNameMentions(cam.shot, canonicalNames)),
    params.aliasContext,
  );
  const characterLines = cam.characters.map((character) => {
    const description = replaceSubjectNames(
      sanitizeCharacterDescriptionForImagePrompt(character.description, {
        canonicalNames,
      }),
      params.aliasContext,
    );
    const imageIdx = resolveCharacterImageIndex(character.name, params.imageIndexMap);
    const alias = getSubjectAliasForName(character.name, params.aliasContext, imageIdx);
    const label = imageIdx ? `${alias} (Image ${imageIdx})` : alias;
    return `${label}: ${description}`;
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
  // Outfit plate indices (Image N) per character — must match reference interleave order
  outfitPlateImageIndexByCharacter?: Map<string, number>;
  // Current scene's environment (moved from system instruction to user prompt)
  currentEnvironment?: StoryEnvironment;
  // Scene-specific outfit overrides from text generation
  characterOutfits?: Record<string, string>;
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
      outfitPlateImageIndexByCharacter: params.outfitPlateImageIndexByCharacter,
      currentEnvironment: params.currentEnvironment,
      characterOutfits: params.characterOutfits,
      hasEnvironmentImageRef: params.hasEnvironmentImageRef,
    });
  }

  // --- Legacy fallback (old stories with string visualPrompt) ---
  const cleanVisualPrompt = stripAllTags(params.visualPrompt || '');

  if (params.hasReferences) {
    const legacyAliasContext = buildSubjectAliasContext({
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
    });
    const characterLines = buildCharacterSection(
      params.realWorldCharacters,
      params.referenceCharacterNames,
      true,
      params.imageIndexMap,
      params.characterOutfits,
      params.outfitPlateImageIndexByCharacter,
      legacyAliasContext,
    );
    const charSection = characterLines ? `\n\n${characterLines}` : '';
    return `${stylePrefix}, ${replaceSubjectNames(cleanVisualPrompt, legacyAliasContext)}${charSection}, ${safetyAdditions}. Do not include any text, letters, captions, or character name labels in the image.`;
  }

  // Non-reference legacy path (Imagen 3)
  let characterPart = '';
  if (params.characters && params.characters.length > 0) {
    const characterDescriptions = buildCharacterDescriptions(params.characters);
    if (characterDescriptions) characterPart = `, ${characterDescriptions}`;
  }
  const noTextPrefix = 'CRITICAL RULE: ABSOLUTELY NO TEXT OR LETTERS anywhere on the image. ';
  const noTextSuffix = '. STRICTLY FORBIDDEN: No text, no letters, no words, no numbers, no symbols, no writing, no typography, no captions, no subtitles, no labels, no signs, no banners, no speech bubbles, no thought bubbles, no text on screens, no text on objects, no text on clothing, no text on buildings, no text on vehicles, no text anywhere. Pure visual storytelling ONLY';
  const negativeToUse = params.negativePrompt ?? imagePolicy.imageNegativePrompt;
  const negativeGuidance = negativeToUse ? `, avoid: ${negativeToUse}` : '';
  const aggressiveTextBlocking = ', NO TEXT, NO LETTERS, NO WORDS, NO WRITING, NO TYPOGRAPHY, NO CAPTIONS, NO LABELS, NO SIGNS';

  const fullPrompt = `${noTextPrefix}${stylePrefix}${characterPart}, ${cleanVisualPrompt}, ${safetyAdditions}${noTextSuffix}${aggressiveTextBlocking}${negativeGuidance}`;
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
  outfitPlateImageIndexByCharacter?: Map<string, number>;
  currentEnvironment?: StoryEnvironment;
  characterOutfits?: Record<string, string>;
  hasEnvironmentImageRef?: boolean;
}): string {
  const { sceneVisual, hasEnvironmentImageRef } = params;
  const aliasContext = buildSubjectAliasContext({
    sceneVisual,
    imageIndexMap: params.imageIndexMap,
    referenceCharacterNames: params.referenceCharacterNames,
    realWorldCharacters: params.realWorldCharacters,
  });

  const sections: string[] = [];

  // SETTING (scene-specific). When env image ref: only delta, labeled "Scene-specific"
  if (sceneVisual.setting) {
    const settingLabel = hasEnvironmentImageRef ? 'Scene-specific' : 'Scene';
    const sanitizedSetting = replaceSubjectNames(
      sanitizeSettingForImagePrompt(sceneVisual.setting),
      aliasContext,
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
    params.characterOutfits,
    params.outfitPlateImageIndexByCharacter,
    aliasContext,
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
      aliasContext,
    });
    sections.push(`- Composition: ${composition}`);
  }

  // LIGHTING (scene-specific)
  if (sceneVisual.lighting) {
    sections.push(`- Lighting: ${replaceSubjectNames(cleanupPromptText(sceneVisual.lighting), aliasContext)}`);
  }

  // Safety and format: keep concise and at the end
  sections.push(`- No text, labels, or captions anywhere in the image. ${params.safetyAdditions}`);

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
 * If characterOutfits are provided, appends scene-specific outfit only for text-only
 * characters. Reference-backed characters keep their reference clothes unless an
 * outfit plate is attached.
 */
function structuralOutfitHint(outfitText: string): string {
  const t = outfitText.trim();
  if (!t) return '';
  return ` STRUCTURAL MATCH: Reproduce garment type, length, sleeves, footwear, and named accessories from the outfit text (${t.slice(0, 200)}${t.length > 200 ? '…' : ''}) — not a generic same-color substitute.`;
}

function formatOutfitOverrideForPrompt(outfitText: string): string {
  if (isNaturalAppearanceOutfit(outfitText)) {
    return ' Keep the character in their default/reference clothes for this scene. Do not invent a wardrobe change.';
  }
  const structural = structuralOutfitHint(outfitText);
  return ` Outfit in this scene: ${outfitText}.${structural}`;
}

function shouldAppendTextOutfitOverride(params: {
  hasCharacterReference: boolean;
  outfitPlateImageIndex?: number;
}): boolean {
  if (params.outfitPlateImageIndex !== undefined) return false;
  return !params.hasCharacterReference;
}

function buildCharacterSection(
  realWorldCharacters?: Array<{ name: string; description: string; nameAliases?: string[] }>,
  referenceCharacterNames?: Array<string | { name: string; isTurnaround?: boolean; nameAliases?: string[] }>,
  _hasReferences?: boolean,
  imageIndexMap?: Map<string, number>,
  characterOutfits?: Record<string, string>,
  outfitPlateImageIndexByCharacter?: Map<string, number>,
  aliasContext?: SubjectAliasContext,
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

  // Imaginary creatures: short back-reference with Image N
  if (referenceCharacterNames) {
    for (const entry of referenceCharacterNames) {
      const originalName = typeof entry === 'string' ? entry : entry.name;
      const name = resolvedReferenceNames.get(originalName) ?? originalName;
      referenceBackedNames.add(stripCharacterIdFromName(name).trim().toLowerCase());
      const imgIdx =
        resolveCharacterImageIndex(originalName, imageIndexMap) ??
        resolveCharacterImageIndex(name, imageIndexMap);
      const alias = getSubjectAliasForName(name, aliasContext, imgIdx);
      const plateIdx =
        resolveOutfitPlateImageIndex(name, outfitPlateImageIndexByCharacter) ??
        resolveOutfitPlateImageIndex(originalName, outfitPlateImageIndexByCharacter);
      // When an outfit plate is attached, wardrobe must come from that image only — no text mix.
      const outfitOverride = shouldAppendTextOutfitOverride({
        hasCharacterReference: true,
        outfitPlateImageIndex: plateIdx,
      })
        ? lookupOutfitForCharacterName(name, characterOutfits)
        : undefined;
      const outfitSuffix = outfitOverride ? formatOutfitOverrideForPrompt(outfitOverride) : '';
      const plateSuffix =
        plateIdx !== undefined ? formatOutfitPlateCrossRef(plateIdx, imgIdx, alias) : '';
      if (imgIdx) {
        const sheetType = (typeof entry !== 'string' && entry.isTurnaround) ? 'character design from the sheet' : 'reference photo';
        lines.push(`- ${alias} (Image ${imgIdx}): match the ${sheetType}.${outfitSuffix}${plateSuffix}`);
      } else if (!isPlaceholderReferenceName(originalName)) {
        lines.push(`- ${alias}: match the attached reference image.${outfitSuffix}${plateSuffix}`);
      }
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
      const alias = getSubjectAliasForName(char.name, aliasContext, imgIdx);
      const plateIdx = resolveOutfitPlateImageIndex(char.name, outfitPlateImageIndexByCharacter);
      const outfitOverride = shouldAppendTextOutfitOverride({
        hasCharacterReference: imgIdx !== undefined,
        outfitPlateImageIndex: plateIdx,
      })
        ? lookupOutfitForCharacterName(char.name, characterOutfits)
        : undefined;
      const desc = replaceSubjectNames(
        outfitOverride
          ? `${char.description}.${formatOutfitOverrideForPrompt(outfitOverride)}`
          : char.description,
        aliasContext,
      );
      const plateSuffix =
        plateIdx !== undefined ? formatOutfitPlateCrossRef(plateIdx, imgIdx, alias) : '';
      if (imgIdx) {
        lines.push(`- ${alias} (Image ${imgIdx}): ${desc}${plateSuffix}`);
      } else {
        lines.push(`- ${alias}: ${desc}${plateSuffix}`);
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
 * Fixed neutral style for easy re-drawing under any scene art style.
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
    'clean line art, simple shapes, clear spatial layout';
  const safetyAdditions = imagePolicy.imageSafetyAdditions;

  const parts = [
    stylePrefix,
    params.environment.description,
    'Key objects must be in fixed positions relative to each other. Maintain consistent spatial layout: left, center, right. Describe relationships (path beside tree, bushes left of path, house behind trees).',
    'Empty location, no people or animals, wide establishing shot.',
    safetyAdditions,
    'No text or letters in the image.',
  ];

  return parts.filter(Boolean).join('. ');
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
  
  // ULTRA-STRONG no text instruction for portraits
  const noTextPrefixInstruction = 'CRITICAL: ABSOLUTELY NO TEXT OR LETTERS. ';
  const noTextSuffixInstruction = ', STRICTLY NO text, NO letters, NO words, NO writing, NO speech bubbles, NO captions, NO labels, NO text on clothing';
  
  // Build negative guidance as text (since API doesn't support negativePrompt parameter)
  const negativeGuidance = (params.negativePrompt ?? imagePolicy.imageNegativePrompt)
    ? `, avoid: ${params.negativePrompt ?? imagePolicy.imageNegativePrompt}`
    : '';
  
  // Aggressive text blocking
  const aggressiveTextBlocking = ', NO TEXT, NO LETTERS, NO WORDS ANYWHERE';
  
  return `${noTextPrefixInstruction}${stylePrefix}, character portrait, close-up view, ${params.description}, clear details, front-facing${noTextSuffixInstruction}, ${safetyAdditions}${aggressiveTextBlocking}${negativeGuidance}`;
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
  const imagePolicy = getImageContentPolicy({ ageGroup: params.ageGroup, scenarioCardId: params.scenarioCardId });
  const stylePrefix = getImageStylePrefix(params.style, params.ageGroup, params.scenarioCardId);
  const safetyAdditions = imagePolicy.imageSafetyAdditions;

  const sections: string[] = [];

  // Role
  sections.push('You are a professional children\'s book illustrator.');

  // Art style
  sections.push(`ART STYLE: ${stylePrefix}`);

  // Format rules
  sections.push(
    'FORMAT: Single full-bleed illustration filling the frame edge-to-edge. No text, no speech bubbles, no character name labels, no captions under characters, no written words anywhere. Pure visual storytelling only.',
  );

  // Reference image rules (only when turnaround sheets are attached)
  if (params.hasReferences) {
    sections.push(
      'REFERENCES: Character sheets establish locked IDENTITY: face, age, body proportions, silhouette, exact hairstyle structure, hair placement, skin/hair palette, and distinctive marks. Keep those traits exactly recognizable while rendering them in the scene art style. Do not redesign, re-braid, re-style, simplify, beautify, or reinterpret hair or facial identity. ' +
      'When the prompt pairs identity Image M with outfit plate Image N, follow this declarative command exactly: draw the person from Image M wearing the clothing/accessories from Image N. Image M is PERSON SOURCE. Image N is CLOTHES SOURCE only. Only the clothes should change. ' +
      'If there is no outfit plate and no scene outfit text for a character, keep their default/reference clothes. Do not draw the mannequin from an outfit plate in the final scene.',
    );
  }

  // Environment reference rules (when env image is attached)
  if (params.hasEnvironmentReference) {
    sections.push(
      'ENVIRONMENT REFERENCE: The provided location image is for CONTENT only (layout, spatial structure, composition, objects, furniture, atmosphere) — NOT for style. Re-draw everything in the scene\'s art style. Ignore the reference\'s rendering style completely. Key objects (tree, building, furniture) must stay in the SAME positions as in the reference. Character positions are relative to these fixed objects.',
    );
  }

  // Clothing: outfit comes from environment.characterOutfits (per-environment, consistent within location)
  sections.push(
    'CLOTHING: If a character has an outfit plate, that image defines only the clothing/accessories for the scene. Applying an outfit plate must not alter the character\'s locked face, exact hairstyle, age read, body proportions, or silhouette. If a text-only character has characterOutfits text in the prompt, that text is wardrobe-only. If no outfit plate or outfit text is supplied for a referenced character, keep that character in their default/reference clothes for the scene.',
  );

  // Tone / safety
  sections.push(`TONE: ${safetyAdditions}.`);

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
