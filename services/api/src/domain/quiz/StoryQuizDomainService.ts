import crypto from 'node:crypto';
import type { StoryQuizActivityApi, StoryQuizPayloadApi } from '@wondertales/shared';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';
import { stripAllTags } from '../../utils/audioTags';
import { buildQuizPrompt, buildQuizSystemInstruction } from '../../prompts/text/QuizPrompt';
import {
  QUIZ_PROMPT_VERSION,
  collectStoryQuizQualityIssues,
  defaultDeliveryModeForBucket,
  normalizeQuizAgeBucket,
  storyQuizResponseSchema,
  validateStoryQuizPayload,
  type StoryQuizValidationError,
} from './schemas';
import type { StoryQuizAgeBucket } from '@wondertales/shared';

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

function localeText(language: string) {
  if (language.startsWith('ru')) {
    return {
      title: 'Подумать после сказки',
      checkTitle: 'Проверь себя и получи приз',
      checkSubtitle: 'Найди пару подсказок из сказки.',
      thinkTitle: 'Интересно, что ты думаешь',
      reward: 'Награда внимательного читателя',
      retryHint: 'Посмотри на подсказку в тексте и попробуй ещё раз.',
      hint: 'Вспомни, что произошло перед этим моментом.',
      scene: 'Сцена',
      firstQuestion: 'Что случилось перед этим моментом?',
      startQuestion: 'Что случилось в начале сказки?',
      secondQuestion: 'Какое событие лучше всего помогает вспомнить ответ?',
      colorQuestion: 'Какой цвет больше подходит настроению этой части?',
      orderQuestion: 'Расположи события в хронологическом порядке.',
      clueQuestion: 'Какая подсказка лучше объясняет, почему герой так поступил?',
      thinkQuestion: 'Что тебе больше всего захотелось обсудить после сказки?',
      thinkOptionA: 'Поступок героя',
      thinkOptionB: 'Самый удивительный момент',
    };
  }
  if (language.startsWith('uk')) {
    return {
      title: 'Подумати після казки',
      checkTitle: 'Перевір себе й отримай приз',
      checkSubtitle: 'Знайди кілька підказок із казки.',
      thinkTitle: 'Цікаво, що ти думаєш',
      reward: 'Відзнака уважного читача',
      retryHint: 'Подивися на підказку в тексті й спробуй ще раз.',
      hint: 'Згадай, що сталося перед цим моментом.',
      scene: 'Сцена',
      firstQuestion: 'Що сталося перед цим моментом?',
      startQuestion: 'Що сталося на початку казки?',
      secondQuestion: 'Яка подія найкраще допомагає згадати відповідь?',
      colorQuestion: 'Який колір більше пасує настрою цієї частини?',
      orderQuestion: 'Розташуй події в хронологічному порядку.',
      clueQuestion: 'Яка підказка краще пояснює, чому герой так учинив?',
      thinkQuestion: 'Що тобі найбільше хочеться обговорити після казки?',
      thinkOptionA: 'Вчинок героя',
      thinkOptionB: 'Найдивовижніший момент',
    };
  }
  return {
    title: 'Think After the Story',
    checkTitle: 'Check Yourself and Unlock a Prize',
    checkSubtitle: 'Find a few clues from the story.',
    thinkTitle: 'I Wonder What You Think',
    reward: 'Careful Reader Badge',
    retryHint: 'Look at the text clue and try once more.',
    hint: 'Remember what happened before this moment.',
    scene: 'Scene',
    firstQuestion: 'What happened before this moment?',
    startQuestion: 'What happened at the beginning of the story?',
    secondQuestion: 'Which event best helps you remember the answer?',
    colorQuestion: 'Which color best fits this part of the story?',
    orderQuestion: 'Put the events in chronological order.',
    clueQuestion: 'Which clue best explains why the hero acted that way?',
    thinkQuestion: 'What would you like to talk about after the story?',
    thinkOptionA: "The hero's choice",
    thinkOptionB: 'The most surprising moment',
  };
}

function sceneSummary(scene: StoryQuizSourceScene, maxLength = 88): string {
  const [firstSentence] = cleanText(scene.text).split(/(?<=[.!?…])\s+/);
  const summary = firstSentence || cleanText(scene.text);
  if (summary.length <= maxLength) return summary;
  const clipped = summary
    .slice(0, maxLength - 1)
    .replace(/\s+\S*$/, '')
    .trim();
  return `${clipped || summary.slice(0, maxLength - 1)}…`;
}

function isCyrillicLanguage(language: string): boolean {
  return language.startsWith('ru') || language.startsWith('uk');
}

function hasAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function compactEventLabel(value: string, maxWords: number): string {
  const cleaned = cleanText(value)
    .replace(/["“”«»]/g, '')
    .replace(/[.!?…]+$/u, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return cleaned;
  return words.slice(0, maxWords).join(' ');
}

function fallbackEventLabel(scene: StoryQuizSourceScene, language: string): string {
  const summary = sceneSummary(scene, 120);
  const lower = summary.toLocaleLowerCase(language);

  if (
    hasAny(lower, [/камін/u, /камень/u, /stone/u]) &&
    hasAny(lower, [/побач/u, /знайш/u, /увид/u, /нашл/u, /found/u, /saw/u])
  ) {
    if (language.startsWith('ru')) return 'Нашли синий камень';
    if (language.startsWith('uk')) return 'Знайшли синій камінь';
    return 'Found the blue stone';
  }

  if (
    hasAny(lower, [/поток/u, /струм/u, /руч/u, /stream/u, /creek/u]) &&
    hasAny(lower, [/зупини/u, /останов/u, /підійш/u, /подош/u, /went/u, /stopped/u])
  ) {
    if (language.startsWith('ru')) return 'Подошли к ручью';
    if (language.startsWith('uk')) return 'Підійшли до потоку';
    return 'Went to the stream';
  }

  if (hasAny(lower, [/дощ/u, /дожд/u, /rain/u]) && hasAny(lower, [/вщух/u, /утих/u, /stopped/u])) {
    if (language.startsWith('ru')) return 'Дождь утих';
    if (language.startsWith('uk')) return 'Дощ вщух';
    return 'The rain stopped';
  }

  if (hasAny(lower, [/шлях/u, /дорог/u, /путь/u, /path/u]) && hasAny(lower, [/крут/u, /steep/u])) {
    if (language.startsWith('ru')) return 'Путь стал круче';
    if (language.startsWith('uk')) return 'Шлях став крутішим';
    return 'The path got steeper';
  }

  if (
    hasAny(lower, [/зайчик/u, /кролик/u, /bunny/u, /rabbit/u]) &&
    hasAny(lower, [/з'яв/u, /появ/u, /appeared/u])
  ) {
    if (language.startsWith('ru')) return 'Появился незнакомец';
    if (language.startsWith('uk')) return "З'явився незнайомець";
    return 'A stranger appeared';
  }

  if (
    hasAny(lower, [/не ходимо/u, /не ходим/u, /незнайом/u, /незнаком/u, /stranger/u]) &&
    hasAny(lower, [/відмов/u, /отказ/u, /refused/u])
  ) {
    if (language.startsWith('ru')) return 'Отказались идти с незнакомцем';
    if (language.startsWith('uk')) return 'Відмовилися йти з незнайомцем';
    return 'Refused to go with a stranger';
  }

  if (
    hasAny(lower, [/водоспад/u, /водопад/u, /waterfall/u]) &&
    hasAny(lower, [/дістал/u, /добрал/u, /reached/u])
  ) {
    if (language.startsWith('ru')) return 'Добрались до водопада';
    if (language.startsWith('uk')) return 'Дісталися водоспаду';
    return 'Reached the waterfall';
  }

  if (
    hasAny(lower, [/батьк/u, /родител/u, /parents/u]) &&
    hasAny(lower, [/зустріч/u, /встреч/u, /met/u])
  ) {
    if (language.startsWith('ru')) return 'Встретились с родителями';
    if (language.startsWith('uk')) return 'Зустрілися з батьками';
    return 'Met the parents';
  }

  const clause = summary.split(/[,;:—-]\s+/u).find((part) => part.trim().length > 0) ?? summary;
  return compactEventLabel(clause, isCyrillicLanguage(language) ? 4 : 5);
}

function trimTerminalPunctuation(value: string): string {
  return value.replace(/[.!?…]+$/u, '').trim();
}

function lowercaseFirst(value: string, language: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleLowerCase(language) + value.slice(1);
}

function buildBeforeMomentQuestion(
  language: string,
  fallbackQuestion: string,
  targetScene: StoryQuizSourceScene
): string {
  const moment = lowercaseFirst(
    trimTerminalPunctuation(fallbackEventLabel(targetScene, language)),
    language
  );
  if (!moment) return fallbackQuestion;
  if (language.startsWith('ru')) return `Что произошло перед тем, как ${moment}?`;
  if (language.startsWith('uk')) return `Що сталося перед тим, як ${moment}?`;
  return `What happened before ${moment}?`;
}

function sceneEventOption(scene: StoryQuizSourceScene, language: string) {
  const label = fallbackEventLabel(scene, language);
  return {
    id: `scene_${scene.sceneId}`,
    label,
    sceneId: scene.sceneId,
  };
}

function convertUkrainianActionVerbToPresent(word: string): string | null {
  const lower = word.toLocaleLowerCase('uk');
  const replacements: Array<[RegExp, string]> = [
    [/^дав$|^дала$|^дало$|^дали$|^дати$/u, 'дає'],
    [/^взяв$|^взяла$|^взяло$|^взяли$|^взяти$/u, 'бере'],
    [/^пішов$|^пішла$|^пішло$|^пішли$|^піти$/u, 'іде'],
    [/^знайшов$|^знайшла$|^знайшло$|^знайшли$|^знайти$/u, 'знаходить'],
    [/^допоміг$|^допомогла$|^допомогло$|^допомогли$|^допомогти$/u, 'допомагає'],
    [/^відчув$|^відчула$|^відчуло$|^відчули$|^відчував$|^відчувала$|^відчувало$|^відчували$|^відчувати$/u, 'відчуває'],
    [/^показав$|^показала$|^показало$|^показали$|^показати$|^показував$|^показувала$|^показувало$|^показували$|^показувати$/u, 'показує'],
    [/^зав['’ʼ]язав$|^зав['’ʼ]язала$|^зав['’ʼ]язало$|^зав['’ʼ]язали$|^зав['’ʼ]язував$|^зав['’ʼ]язувала$|^зав['’ʼ]язувало$|^зав['’ʼ]язували$|^зав['’ʼ]язувати$/u, "зав'язує"],
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

function buildFallbackPayload(input: {
  title: string;
  language: string;
  sourceAgeGroup: string;
  quizAgeBucket: StoryQuizAgeBucket;
  scenes: StoryQuizSourceScene[];
}): StoryQuizPayloadApi {
  const copy = localeText(input.language);
  const deliveryMode = defaultDeliveryModeForBucket(input.quizAgeBucket);
  const usableScenes = input.scenes.slice(0, Math.max(2, Math.min(input.scenes.length, 4)));
  const first = usableScenes[0] ?? { sceneId: 1, text: input.title };
  const second = usableScenes[1] ?? first;
  const third = usableScenes[2] ?? second;
  const firstQuestion =
    usableScenes.length > 1 && input.quizAgeBucket !== '1y' && input.quizAgeBucket !== '2-3'
      ? buildBeforeMomentQuestion(input.language, copy.firstQuestion, second)
      : copy.startQuestion;
  const sceneOptions =
    usableScenes.length > 1
      ? usableScenes.map((scene) => sceneEventOption(scene, input.language))
      : [
          sceneEventOption(first, input.language),
          {
            id: 'story_memory',
            label: fallbackEventLabel(first, input.language),
            sceneId: first.sceneId,
          },
        ];
  const parentReadText = deliveryMode === 'self_read' ? undefined : firstQuestion;

  const activities: StoryQuizActivityApi[] = [
    {
      id: 'check_scene_memory',
      rubric: 'check_reward',
      kind:
        input.quizAgeBucket === '1y' || input.quizAgeBucket === '2-3'
          ? 'scene_pick'
          : input.quizAgeBucket === '4-5'
            ? 'simple_cause_effect'
            : 'find_evidence',
      interactionType:
        input.quizAgeBucket === '1y' ||
        input.quizAgeBucket === '2-3' ||
        input.quizAgeBucket === '4-5'
          ? 'single_choice'
          : 'evidence_choice',
      resultKind: 'text_supported',
      deliveryMode,
      question: firstQuestion,
      parentReadText,
      options: sceneOptions,
      correctOptionId: `scene_${first.sceneId}`,
      evidenceSceneIds:
        first.sceneId === second.sceneId ? [first.sceneId] : [first.sceneId, second.sceneId],
      hint: copy.hint,
      retryHint: copy.retryHint,
      rewardSpark: copy.reward,
    },
  ];

  if (input.quizAgeBucket === '2-3') {
    activities.push({
      id: 'check_color_mood',
      rubric: 'check_reward',
      kind: 'color_mood',
      interactionType: 'color_choice',
      resultKind: 'objective',
      deliveryMode,
      question: copy.colorQuestion,
      parentReadText: deliveryMode === 'self_read' ? undefined : copy.colorQuestion,
      options: [
        { id: 'warm_color', label: copy.thinkOptionB, colorHex: '#F59E0B' },
        { id: 'quiet_color', label: copy.thinkOptionA, colorHex: '#60A5FA' },
      ],
      correctOptionId: 'warm_color',
      hint: copy.hint,
      retryHint: copy.retryHint,
      rewardSpark: copy.reward,
    });
  } else if (input.quizAgeBucket === '4-5') {
    const sequenceScenes = [first, second, third].filter(
      (scene, index, list) =>
        list.findIndex((candidate) => candidate.sceneId === scene.sceneId) === index
    );
    const sequenceOptions = sequenceScenes.map((scene) => sceneEventOption(scene, input.language));
    if (sequenceOptions.length >= 2) {
      activities.push({
        id: 'check_event_order',
        rubric: 'check_reward',
        kind: 'sequence_three_events',
        interactionType: 'sequence_order',
        resultKind: 'text_supported',
        deliveryMode,
        question: copy.orderQuestion,
        parentReadText: copy.orderQuestion,
        options: sequenceOptions,
        preferredOrderIds: sequenceOptions.map((option) => option.id),
        evidenceSceneIds: sequenceScenes.map((scene) => scene.sceneId),
        hint: copy.hint,
        retryHint: copy.retryHint,
        rewardSpark: copy.reward,
      });
    } else {
      activities.push({
        id: 'check_color_mood',
        rubric: 'check_reward',
        kind: 'color_mood',
        interactionType: 'color_choice',
        resultKind: 'objective',
        deliveryMode,
        question: copy.colorQuestion,
        parentReadText: copy.colorQuestion,
        options: [
          { id: 'warm_color', label: copy.thinkOptionB, colorHex: '#F59E0B' },
          { id: 'quiet_color', label: copy.thinkOptionA, colorHex: '#60A5FA' },
        ],
        correctOptionId: 'warm_color',
        hint: copy.hint,
        retryHint: copy.retryHint,
        rewardSpark: copy.reward,
      });
    }
  } else if (input.quizAgeBucket === '6-8') {
    activities.push({
      id: 'check_second_clue',
      rubric: 'check_reward',
      kind: 'simple_cause_effect',
      interactionType: 'single_choice',
      resultKind: 'text_supported',
      deliveryMode,
      question: copy.secondQuestion,
      options: sceneOptions,
      correctOptionId: `scene_${second.sceneId}`,
      evidenceSceneIds: [second.sceneId],
      hint: copy.hint,
      retryHint: copy.retryHint,
      rewardSpark: copy.reward,
    });
    activities.push({
      id: 'check_third_clue',
      rubric: 'check_reward',
      kind: 'cause_effect_chain',
      interactionType: 'branch_choice',
      resultKind: 'text_supported',
      deliveryMode,
      question: copy.clueQuestion,
      options: sceneOptions,
      correctOptionId: `scene_${third.sceneId}`,
      evidenceSceneIds: [third.sceneId],
      hint: copy.hint,
      retryHint: copy.retryHint,
      rewardSpark: copy.reward,
    });
  } else if (input.quizAgeBucket === '9-12') {
    activities.push({
      id: 'check_motive_traits',
      rubric: 'check_reward',
      kind: 'compare_characters',
      interactionType: 'multi_select',
      resultKind: 'objective',
      deliveryMode,
      question: copy.clueQuestion,
      options: [
        { id: 'careful', label: copy.thinkOptionA },
        { id: 'surprised', label: copy.thinkOptionB },
        sceneEventOption(second, input.language),
      ],
      correctOptionIds: ['careful', `scene_${second.sceneId}`],
      hint: copy.hint,
      retryHint: copy.retryHint,
      rewardSpark: copy.reward,
    });
    activities.push({
      id: 'check_third_clue',
      rubric: 'check_reward',
      kind: 'motive_detective',
      interactionType: 'branch_choice',
      resultKind: 'text_supported',
      deliveryMode,
      question: copy.secondQuestion,
      options: sceneOptions,
      correctOptionId: `scene_${third.sceneId}`,
      evidenceSceneIds: [third.sceneId],
      hint: copy.hint,
      retryHint: copy.retryHint,
      rewardSpark: copy.reward,
    });
  }

  activities.push({
    id: 'talk_after_story',
    rubric: 'think_talk',
    kind:
      input.quizAgeBucket === '9-12'
        ? 'advice_from_story'
        : input.quizAgeBucket === '6-8'
          ? 'what_if'
          : input.quizAgeBucket === '4-5'
            ? 'helper_choice'
            : 'choose_emotion',
    interactionType:
      input.quizAgeBucket === '1y' || input.quizAgeBucket === '2-3'
        ? 'rating_scale'
        : 'single_choice',
    resultKind: 'reflective',
    deliveryMode,
    question: copy.thinkQuestion,
    parentReadText: deliveryMode === 'self_read' ? undefined : copy.thinkQuestion,
    options: [
      { id: 'talk_choice', label: copy.thinkOptionA },
      { id: 'talk_surprise', label: copy.thinkOptionB },
    ],
  });

  const checkActivityIds = activities
    .filter((activity) => activity.rubric === 'check_reward')
    .map((activity) => activity.id);
  const thinkActivityIds = activities
    .filter((activity) => activity.rubric === 'think_talk')
    .map((activity) => activity.id);

  return {
    title: copy.title,
    language: input.language,
    sourceAgeGroup: input.sourceAgeGroup,
    quizAgeBucket: input.quizAgeBucket,
    sections: [
      {
        rubric: 'check_reward',
        title: copy.checkTitle,
        subtitle: copy.checkSubtitle,
        activityIds: checkActivityIds,
      },
      {
        rubric: 'think_talk',
        title: copy.thinkTitle,
        activityIds: thinkActivityIds,
      },
    ],
    activities,
    reward: {
      label: copy.reward,
      unlockPolicy: 'complete_check_reward',
      bonusRules: ['first_attempt', 'used_evidence', 'retry_resolved', 'all_check_completed'],
    },
    createdAt: new Date().toISOString(),
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
