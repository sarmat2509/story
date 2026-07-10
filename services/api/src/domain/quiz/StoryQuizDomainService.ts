import crypto from 'node:crypto';
import type { StoryQuizPayloadApi } from '@wondertales/shared';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';
import { stripAllTags } from '../../utils/audioTags';
import { buildQuizPrompt, buildQuizSystemInstruction } from '../../prompts/text/QuizPrompt';
import {
  QUIZ_PROMPT_VERSION,
  collectStoryQuizQualityIssues,
  normalizeQuizAgeBucket,
  storyQuizResponseSchema,
  validateStoryQuizPayload,
  type StoryQuizValidationError,
} from './schemas';

const QUIZ_MAX_OUTPUT_TOKENS = 6000;

export interface StoryQuizSourceScene {
  sceneId: number;
  text: string;
}

export interface StoryQuizGenerationInput {
  title: string;
  language: string;
  sourceAgeGroup: string;
  scenes: StoryQuizSourceScene[];
  characters?: string[];
  closingKeepsakeLabel?: string | null;
  scenarioCardName?: string | null;
  onUsage?: (usage: UsageMetadata) => void;
}

export interface StoryQuizGenerationResult {
  payload: StoryQuizPayloadApi;
  qualityIssues: string[];
}

function cleanText(value: string | null | undefined): string {
  return stripAllTags(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeQuizScenes(
  scenes: Array<{ sceneId?: number; text?: string }>
): StoryQuizSourceScene[] {
  return scenes
    .map((scene, index) => ({
      sceneId: typeof scene.sceneId === 'number' ? scene.sceneId : index + 1,
      text: cleanText(scene.text),
    }))
    .filter((scene) => scene.text.length > 0)
    .sort((a, b) => a.sceneId - b.sceneId);
}

export function buildStoryQuizSourceFingerprint(input: {
  title: string;
  language: string;
  sourceAgeGroup: string;
  scenes: StoryQuizSourceScene[];
  closingKeepsakeLabel?: string | null;
  promptVersion?: string;
}): string {
  const source = {
    promptVersion: input.promptVersion ?? QUIZ_PROMPT_VERSION,
    title: cleanText(input.title),
    language: input.language,
    sourceAgeGroup: input.sourceAgeGroup,
    closingKeepsakeLabel: cleanText(input.closingKeepsakeLabel),
    scenes: input.scenes.map((scene) => ({ sceneId: scene.sceneId, text: scene.text })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

function convertUkrainianActionVerbToPresent(word: string): string | null {
  const lower = word.toLocaleLowerCase('uk');
  const replacements: Array<[RegExp, string]> = [
    [/^дав$|^дала$|^дало$|^дали$|^дати$/u, 'дає'],
    [/^взяв$|^взяла$|^взяло$|^взяли$|^взяти$/u, 'бере'],
    [/^пішов$|^пішла$|^пішло$|^пішли$|^піти$/u, 'іде'],
    [/^знайшов$|^знайшла$|^знайшло$|^знайшли$|^знайти$/u, 'знаходить'],
    [/^допоміг$|^допомогла$|^допомогло$|^допомогли$|^допомогти$/u, 'допомагає'],
    [
      /^відчув$|^відчула$|^відчуло$|^відчули$|^відчував$|^відчувала$|^відчувало$|^відчували$|^відчувати$/u,
      'відчуває',
    ],
    [
      /^показав$|^показала$|^показало$|^показали$|^показати$|^показував$|^показувала$|^показувало$|^показували$|^показувати$/u,
      'показує',
    ],
    [
      /^зав['’ʼ]язав$|^зав['’ʼ]язала$|^зав['’ʼ]язало$|^зав['’ʼ]язали$|^зав['’ʼ]язував$|^зав['’ʼ]язувала$|^зав['’ʼ]язувало$|^зав['’ʼ]язували$|^зав['’ʼ]язувати$/u,
      "зав'язує",
    ],
    [/^заблокував$|^заблокувала$|^заблокувало$|^заблокували$|^заблокувати$/u, 'блокує'],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(lower)) return replacement;
  }

  const suffixRules: Array<[RegExp, string]> = [
    [/(ював|ювала|ювало|ювали|ювати)$/u, 'ює'],
    [/(ував|увала|увало|ували|увати)$/u, 'ує'],
    [/(ав|ала|ало|али|ати)$/u, 'ає'],
    [/(ив|ила|ило|или|ити)$/u, 'ить'],
    [/(нув|нула|нуло|нули|нути)$/u, 'ає'],
  ];

  for (const [suffix, presentEnding] of suffixRules) {
    if (suffix.test(lower)) return lower.replace(suffix, presentEnding);
  }

  return null;
}

function presentTenseMatchActionLabel(label: string, language: string): string {
  if (!language.startsWith('uk')) return label;
  const words = label.split(/(\s+)/);
  let converted = false;

  const nextWords = words.map((part) => {
    if (converted || !/[а-яіїєґ]/iu.test(part)) return part;
    const match = part.match(/^([^\p{L}]*)([\p{L}'’ʼ-]+)([^\p{L}]*)$/u);
    if (!match) return part;
    const [, prefix, core, suffix] = match;
    const present = convertUkrainianActionVerbToPresent(core);
    if (!present) return part;
    converted = true;
    return `${prefix}${present}${suffix}`;
  });

  return converted ? nextWords.join('') : label;
}

function repairGeneratedQuizPayload(
  payload: StoryQuizPayloadApi,
  language: string
): StoryQuizPayloadApi {
  return {
    ...payload,
    activities: (payload.activities ?? []).map((activity) => {
      if (
        activity.kind !== 'match_character_action' ||
        activity.interactionType !== 'match_pairs'
      ) {
        return activity;
      }

      const rightIds = new Set((activity.pairs ?? []).map((pair) => pair.rightId));
      return {
        ...activity,
        options: (activity.options ?? []).map((option) =>
          rightIds.has(option.id)
            ? { ...option, label: presentTenseMatchActionLabel(option.label, language) }
            : option
        ),
      };
    }),
  };
}

export class StoryQuizDomainService {
  constructor(private textProvider: ITextProvider) {}

  async generateQuiz(input: StoryQuizGenerationInput): Promise<StoryQuizGenerationResult> {
    const scenes = normalizeQuizScenes(input.scenes);
    const sourceAgeGroup = input.sourceAgeGroup;
    const quizAgeBucket = normalizeQuizAgeBucket(sourceAgeGroup);
    const validationContext = {
      language: input.language,
      sourceAgeGroup,
      quizAgeBucket,
      sceneIds: scenes.map((scene) => scene.sceneId),
    };

    if (scenes.length < 2) {
      throw new Error('Story quiz generation requires at least two ordered scenes');
    }

    const prompt = buildQuizPrompt({
      title: input.title,
      language: input.language,
      sourceAgeGroup,
      quizAgeBucket,
      scenes,
      characters: input.characters ?? [],
      closingKeepsakeLabel: input.closingKeepsakeLabel,
      scenarioCardName: input.scenarioCardName,
    });
    const systemInstruction = buildQuizSystemInstruction({
      language: input.language,
      sourceAgeGroup,
      quizAgeBucket,
    });

    try {
      const generated = await this.textProvider.generateStructured<StoryQuizPayloadApi>({
        prompt,
        systemInstruction,
        schema: storyQuizResponseSchema,
        temperature: 0.7,
        maxTokens: QUIZ_MAX_OUTPUT_TOKENS,
        operation: 'text_quiz_generate',
        onUsage: input.onUsage,
      });
      const repaired = repairGeneratedQuizPayload(
        { ...generated, createdAt: generated.createdAt || new Date().toISOString() },
        input.language
      );
      const payload = validateStoryQuizPayload(repaired, validationContext);
      return {
        payload,
        qualityIssues: collectStoryQuizQualityIssues(payload, validationContext),
      };
    } catch (error) {
      const issues =
        error && typeof error === 'object' && 'issues' in error
          ? (error as StoryQuizValidationError).issues
          : [error instanceof Error ? error.message : 'unknown quiz generation error'];
      throw new Error(`Story quiz generation failed validation: ${issues.join('; ')}`);
    }
  }
}
