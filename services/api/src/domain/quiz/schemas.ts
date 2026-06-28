import type {
  StoryQuizActivityApi,
  StoryQuizActivityKind,
  StoryQuizAgeBucket,
  StoryQuizDeliveryMode,
  StoryQuizInteractionType,
  StoryQuizPayloadApi,
  StoryQuizResultKind,
  StoryQuizRubric,
} from '@wondertales/shared';
import type { JsonSchema } from '../../providers/base/JsonSchema';

export const QUIZ_AGE_BUCKETS: StoryQuizAgeBucket[] = ['1y', '2-3', '4-5', '6-8', '9-12'];

export const QUIZ_PROMPT_VERSION = 'quiz-v21';

export const STORY_QUIZ_GENERATION_STALE_MS = 10 * 60 * 1000;

export const QUIZ_RUBRICS: StoryQuizRubric[] = ['check_reward', 'think_talk'];

export const QUIZ_DELIVERY_MODES: StoryQuizDeliveryMode[] = ['parent_led', 'assisted', 'self_read'];

export const QUIZ_RESULT_KINDS: StoryQuizResultKind[] = [
  'objective',
  'text_supported',
  'reflective',
];

export const QUIZ_INTERACTION_TYPES: StoryQuizInteractionType[] = [
  'single_choice',
  'multi_select',
  'match_pairs',
  'sequence_order',
  'evidence_choice',
  'categorize',
  'color_choice',
  'symbol_choice',
  'short_response',
  'hotspot_choice',
  'rating_scale',
  'rank_order',
  'branch_choice',
  'fill_blank',
];

export const QUIZ_ACTIVITY_KINDS: StoryQuizActivityKind[] = [
  'choose_character',
  'choose_object',
  'choose_emotion',
  'color_mood',
  'scene_pick',
  'repeat_phrase',
  'choose_trait',
  'match_character_action',
  'match_object_owner',
  'sequence_three_events',
  'simple_cause_effect',
  'story_true_false',
  'helper_choice',
  'safe_choice',
  'choose_three_traits',
  'fact_opinion_unknown',
  'find_evidence',
  'cause_effect_chain',
  'compare_characters',
  'sort_by_importance',
  'who_needs_artifact',
  'what_if',
  'emotion_change',
  'was_hero_right',
  'two_sides_argument',
  'motive_detective',
  'perspective_switch',
  'theme_detective',
  'consequence_tree',
  'symbol_analysis',
  'advice_from_story',
  'change_one_decision',
  'reliability_check',
];

const ALLOWED_KINDS_BY_BUCKET: Record<StoryQuizAgeBucket, Set<StoryQuizActivityKind>> = {
  '1y': new Set([
    'choose_character',
    'choose_object',
    'choose_emotion',
    'color_mood',
    'scene_pick',
  ]),
  '2-3': new Set([
    'choose_character',
    'choose_object',
    'choose_emotion',
    'color_mood',
    'scene_pick',
    'repeat_phrase',
  ]),
  '4-5': new Set([
    'choose_trait',
    'match_character_action',
    'match_object_owner',
    'sequence_three_events',
    'simple_cause_effect',
    'story_true_false',
    'helper_choice',
    'safe_choice',
    'choose_character',
    'choose_object',
    'choose_emotion',
    'emotion_change',
    'color_mood',
    'scene_pick',
  ]),
  '6-8': new Set([
    'choose_three_traits',
    'fact_opinion_unknown',
    'find_evidence',
    'cause_effect_chain',
    'compare_characters',
    'sort_by_importance',
    'who_needs_artifact',
    'what_if',
    'emotion_change',
    'choose_character',
    'choose_object',
    'choose_emotion',
    'choose_trait',
    'match_character_action',
    'match_object_owner',
    'sequence_three_events',
    'story_true_false',
    'simple_cause_effect',
    'helper_choice',
    'safe_choice',
    'color_mood',
    'scene_pick',
  ]),
  '9-12': new Set([
    'choose_character',
    'choose_object',
    'choose_emotion',
    'choose_trait',
    'match_character_action',
    'match_object_owner',
    'sequence_three_events',
    'simple_cause_effect',
    'story_true_false',
    'helper_choice',
    'safe_choice',
    'choose_three_traits',
    'fact_opinion_unknown',
    'find_evidence',
    'cause_effect_chain',
    'compare_characters',
    'sort_by_importance',
    'who_needs_artifact',
    'what_if',
    'emotion_change',
    'color_mood',
    'scene_pick',
    'was_hero_right',
    'two_sides_argument',
    'motive_detective',
    'perspective_switch',
    'theme_detective',
    'consequence_tree',
    'symbol_analysis',
    'advice_from_story',
    'change_one_decision',
    'reliability_check',
  ]),
};

const ALLOWED_INTERACTIONS_BY_BUCKET: Record<StoryQuizAgeBucket, Set<StoryQuizInteractionType>> = {
  '1y': new Set(['single_choice', 'color_choice', 'rating_scale']),
  '2-3': new Set(['single_choice', 'color_choice', 'rating_scale']),
  '4-5': new Set([
    'single_choice',
    'multi_select',
    'match_pairs',
    'sequence_order',
    'color_choice',
    'rating_scale',
  ]),
  '6-8': new Set([
    'single_choice',
    'multi_select',
    'match_pairs',
    'sequence_order',
    'evidence_choice',
    'color_choice',
    'rating_scale',
    'branch_choice',
    'short_response',
  ]),
  '9-12': new Set([
    'single_choice',
    'multi_select',
    'match_pairs',
    'sequence_order',
    'evidence_choice',
    'categorize',
    'color_choice',
    'symbol_choice',
    'short_response',
    'rating_scale',
    'rank_order',
    'branch_choice',
  ]),
};

const MIN_CHECK_BY_BUCKET: Record<StoryQuizAgeBucket, number> = {
  '1y': 2,
  '2-3': 3,
  '4-5': 4,
  '6-8': 6,
  '9-12': 7,
};

const MIN_TALK_BY_BUCKET: Record<StoryQuizAgeBucket, number> = {
  '1y': 3,
  '2-3': 3,
  '4-5': 3,
  '6-8': 3,
  '9-12': 3,
};

const MAX_ACTIVITIES_BY_BUCKET: Record<StoryQuizAgeBucket, number> = {
  '1y': 5,
  '2-3': 6,
  '4-5': 7,
  '6-8': 9,
  '9-12': 10,
};

const MIN_CHECK_INTERACTION_TYPES_BY_BUCKET: Record<StoryQuizAgeBucket, number> = {
  '1y': 1,
  '2-3': 2,
  '4-5': 3,
  '6-8': 4,
  '9-12': 4,
};

const ADVANCED_CHECK_KINDS_9_12 = new Set<StoryQuizActivityKind>([
  'choose_three_traits',
  'fact_opinion_unknown',
  'find_evidence',
  'cause_effect_chain',
  'compare_characters',
  'sort_by_importance',
  'was_hero_right',
  'two_sides_argument',
  'motive_detective',
  'perspective_switch',
  'theme_detective',
  'consequence_tree',
  'symbol_analysis',
  'advice_from_story',
  'change_one_decision',
  'reliability_check',
]);

const SIMPLE_CHECK_KINDS_9_12 = new Set<StoryQuizActivityKind>([
  'choose_character',
  'choose_object',
  'choose_emotion',
  'choose_trait',
  'match_character_action',
  'match_object_owner',
  'sequence_three_events',
  'simple_cause_effect',
  'story_true_false',
  'helper_choice',
  'safe_choice',
  'who_needs_artifact',
  'what_if',
  'emotion_change',
  'color_mood',
  'scene_pick',
]);

const VISUAL_RECALL_CHECK_KINDS_9_12 = new Set<StoryQuizActivityKind>([
  'choose_character',
  'choose_object',
  'color_mood',
  'scene_pick',
]);

function maxCheckedInteractionRepeat(
  bucket: StoryQuizAgeBucket,
  interactionType: StoryQuizInteractionType
): number {
  if (
    interactionType === 'single_choice' &&
    (bucket === '6-8' || bucket === '9-12')
  ) {
    return 3;
  }
  return 2;
}

export class StoryQuizValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Story quiz payload is invalid: ${issues.join('; ')}`);
  }
}

export function normalizeQuizAgeBucket(
  sourceAgeGroup: string | null | undefined
): StoryQuizAgeBucket {
  const slug = String(sourceAgeGroup || '').trim();
  if ((QUIZ_AGE_BUCKETS as string[]).includes(slug)) return slug as StoryQuizAgeBucket;
  if (slug === '0-1') return '1y';
  if (slug === '6-7') return '6-8';
  if (slug === '8-9') return '6-8';
  if (slug === '10-12') return '9-12';
  return '4-5';
}

export function defaultDeliveryModeForBucket(bucket: StoryQuizAgeBucket): StoryQuizDeliveryMode {
  if (bucket === '1y' || bucket === '2-3') return 'parent_led';
  if (bucket === '4-5') return 'assisted';
  return 'self_read';
}

function optionIds(activity: StoryQuizActivityApi): Set<string> {
  return new Set((activity.options ?? []).map((option) => option.id));
}

function hasCheckKey(activity: StoryQuizActivityApi): boolean {
  return Boolean(
    activity.correctOptionId ||
    (activity.correctOptionIds && activity.correctOptionIds.length > 0) ||
    (activity.preferredOrderIds && activity.preferredOrderIds.length > 0) ||
    (activity.pairs && activity.pairs.length > 0)
  );
}

function requiresOptions(interactionType: StoryQuizInteractionType): boolean {
  return [
    'single_choice',
    'multi_select',
    'evidence_choice',
    'color_choice',
    'rating_scale',
    'branch_choice',
    'sequence_order',
    'match_pairs',
  ].includes(interactionType);
}

function isSceneNumberAnswerLabel(label: string): boolean {
  return /^(scene|сцена)\s*\d+\b/iu.test(label.trim());
}

function isTooLongSceneAnswerLabel(label: string): boolean {
  const trimmed = label.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return trimmed.length > 80 || wordCount > 8;
}

function isHexColor(value: string | undefined): boolean {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value.trim());
}

export function validateStoryQuizPayload(
  payload: StoryQuizPayloadApi,
  context: {
    language: string;
    sourceAgeGroup: string;
    quizAgeBucket: StoryQuizAgeBucket;
    sceneIds: number[];
  }
): StoryQuizPayloadApi {
  const issues: string[] = [];
  const sceneIdSet = new Set(context.sceneIds);
  const activityIds = new Set<string>();
  const defaultDeliveryMode = defaultDeliveryModeForBucket(context.quizAgeBucket);

  if (!payload || typeof payload !== 'object') {
    throw new StoryQuizValidationError(['payload must be an object']);
  }
  if (payload.language !== context.language) {
    issues.push('payload.language must match story language');
  }
  if (payload.sourceAgeGroup !== context.sourceAgeGroup) {
    issues.push('payload.sourceAgeGroup must match story age group');
  }
  if (payload.quizAgeBucket !== context.quizAgeBucket) {
    issues.push('payload.quizAgeBucket must match normalized quiz bucket');
  }
  if (!payload.reward || payload.reward.unlockPolicy !== 'complete_check_reward') {
    issues.push('reward.unlockPolicy must be complete_check_reward');
  }
  if (!Array.isArray(payload.sections) || payload.sections.length !== 2) {
    issues.push('payload must contain exactly two sections');
  }
  if (!Array.isArray(payload.activities) || payload.activities.length === 0) {
    issues.push('payload.activities must not be empty');
  }
  if (payload.activities.length > MAX_ACTIVITIES_BY_BUCKET[context.quizAgeBucket]) {
    issues.push(`too many activities for ${context.quizAgeBucket}`);
  }

  const rubricCounts: Record<StoryQuizRubric, number> = { check_reward: 0, think_talk: 0 };

  for (const activity of payload.activities) {
    if (!activity.id || activityIds.has(activity.id)) {
      issues.push(`activity id must be unique and non-empty: ${activity.id || '<missing>'}`);
    }
    activityIds.add(activity.id);

    if (!QUIZ_RUBRICS.includes(activity.rubric)) {
      issues.push(`${activity.id}: invalid rubric`);
      continue;
    }
    rubricCounts[activity.rubric] += 1;

    if (!QUIZ_ACTIVITY_KINDS.includes(activity.kind)) {
      issues.push(`${activity.id}: invalid kind`);
    } else if (!ALLOWED_KINDS_BY_BUCKET[context.quizAgeBucket].has(activity.kind)) {
      issues.push(
        `${activity.id}: kind ${activity.kind} is not allowed for ${context.quizAgeBucket}`
      );
    }

    if (!QUIZ_INTERACTION_TYPES.includes(activity.interactionType)) {
      issues.push(`${activity.id}: invalid interactionType`);
    } else if (
      !ALLOWED_INTERACTIONS_BY_BUCKET[context.quizAgeBucket].has(activity.interactionType)
    ) {
      issues.push(
        `${activity.id}: interaction ${activity.interactionType} is not allowed for ${context.quizAgeBucket}`
      );
    }

    if (!QUIZ_RESULT_KINDS.includes(activity.resultKind)) {
      issues.push(`${activity.id}: invalid resultKind`);
    }
    if (!QUIZ_DELIVERY_MODES.includes(activity.deliveryMode)) {
      issues.push(`${activity.id}: invalid deliveryMode`);
    }
    if (
      (context.quizAgeBucket === '1y' || context.quizAgeBucket === '2-3') &&
      activity.deliveryMode !== 'parent_led'
    ) {
      issues.push(`${activity.id}: ${context.quizAgeBucket} requires parent_led delivery`);
    }
    if (context.quizAgeBucket === '4-5' && activity.deliveryMode === 'self_read') {
      issues.push(`${activity.id}: 4-5 should be assisted, not self_read`);
    }
    if (defaultDeliveryMode !== 'self_read' && !activity.parentReadText?.trim()) {
      issues.push(`${activity.id}: parentReadText is required for ${defaultDeliveryMode}`);
    }
    if (!activity.question || activity.question.trim().length < 3) {
      issues.push(`${activity.id}: question is required`);
    }

    if (requiresOptions(activity.interactionType)) {
      if (!Array.isArray(activity.options) || activity.options.length < 2) {
        issues.push(`${activity.id}: ${activity.interactionType} requires at least two options`);
      }
    }

    const ids = optionIds(activity);
    if (activity.correctOptionId && !ids.has(activity.correctOptionId)) {
      issues.push(`${activity.id}: correctOptionId must reference an option`);
    }
    if (activity.correctOptionIds?.some((id) => !ids.has(id))) {
      issues.push(`${activity.id}: all correctOptionIds must reference options`);
    }
    if (activity.preferredOrderIds?.some((id) => !ids.has(id))) {
      issues.push(`${activity.id}: all preferredOrderIds must reference options`);
    }
    if (activity.pairs?.some((pair) => !ids.has(pair.leftId) || !ids.has(pair.rightId))) {
      issues.push(`${activity.id}: all pairs must reference options`);
    }

    for (const option of activity.options ?? []) {
      if (activity.interactionType === 'color_choice' && !isHexColor(option.colorHex)) {
        issues.push(`${activity.id}: color option ${option.id} must include colorHex`);
      }
      if (isSceneNumberAnswerLabel(option.label)) {
        issues.push(
          `${activity.id}: option ${option.id} must describe an event, not a scene number`
        );
      }
      if (option.sceneId !== undefined && isTooLongSceneAnswerLabel(option.label)) {
        issues.push(
          `${activity.id}: option ${option.id} must use a short event label, not a full sentence`
        );
      }
      if (option.sceneId !== undefined && !sceneIdSet.has(option.sceneId)) {
        issues.push(
          `${activity.id}: option ${option.id} references unknown scene ${option.sceneId}`
        );
      }
    }
    for (const sceneId of activity.evidenceSceneIds ?? []) {
      if (!sceneIdSet.has(sceneId)) {
        issues.push(`${activity.id}: evidenceSceneIds references unknown scene ${sceneId}`);
      }
    }

    if (activity.rubric === 'think_talk') {
      if (activity.resultKind !== 'reflective') {
        issues.push(`${activity.id}: think_talk must be reflective`);
      }
      if (hasCheckKey(activity)) {
        issues.push(`${activity.id}: think_talk must not include answer keys`);
      }
    }

    if (activity.rubric === 'check_reward') {
      if (activity.resultKind === 'reflective') {
        issues.push(`${activity.id}: check_reward must not be reflective`);
      }
      if (!hasCheckKey(activity)) {
        issues.push(`${activity.id}: check_reward must include a checkable key`);
      }
      if (
        activity.resultKind === 'text_supported' &&
        (activity.evidenceSceneIds ?? []).length === 0
      ) {
        issues.push(`${activity.id}: text_supported check must include evidenceSceneIds`);
      }
    }
  }

  if (rubricCounts.check_reward < MIN_CHECK_BY_BUCKET[context.quizAgeBucket]) {
    issues.push(`not enough check_reward activities for ${context.quizAgeBucket}`);
  }
  if (rubricCounts.think_talk < MIN_TALK_BY_BUCKET[context.quizAgeBucket]) {
    issues.push(`not enough think_talk activities for ${context.quizAgeBucket}`);
  }

  const sectionRubrics = new Set((payload.sections ?? []).map((section) => section.rubric));
  for (const rubric of QUIZ_RUBRICS) {
    if (!sectionRubrics.has(rubric)) {
      issues.push(`missing section for ${rubric}`);
    }
  }
  for (const section of payload.sections ?? []) {
    for (const activityId of section.activityIds ?? []) {
      if (!activityIds.has(activityId)) {
        issues.push(`section ${section.rubric} references unknown activity ${activityId}`);
      }
    }
  }

  if (issues.length > 0) {
    throw new StoryQuizValidationError(issues);
  }

  return payload;
}

export function collectStoryQuizQualityIssues(
  payload: StoryQuizPayloadApi,
  context: { quizAgeBucket: StoryQuizAgeBucket }
): string[] {
  const issues: string[] = [];
  const checkedInteractionCounts = new Map<StoryQuizInteractionType, number>();
  let checkedTextSupportedCount = 0;
  let advancedCheckedCountNineTwelve = 0;
  let simpleCheckedCountNineTwelve = 0;
  let visualRecallCheckedCountNineTwelve = 0;

  for (const activity of payload.activities ?? []) {
    if (activity.rubric !== 'check_reward') continue;

    checkedInteractionCounts.set(
      activity.interactionType,
      (checkedInteractionCounts.get(activity.interactionType) ?? 0) + 1
    );
    if (
      activity.resultKind === 'text_supported' &&
      (activity.evidenceSceneIds ?? []).length > 0
    ) {
      checkedTextSupportedCount += 1;
    }
    if (context.quizAgeBucket === '9-12') {
      if (ADVANCED_CHECK_KINDS_9_12.has(activity.kind)) {
        advancedCheckedCountNineTwelve += 1;
      }
      if (SIMPLE_CHECK_KINDS_9_12.has(activity.kind)) {
        simpleCheckedCountNineTwelve += 1;
      }
      if (VISUAL_RECALL_CHECK_KINDS_9_12.has(activity.kind)) {
        visualRecallCheckedCountNineTwelve += 1;
      }
    }
  }

  for (const [interactionType, count] of checkedInteractionCounts.entries()) {
    const maxRepeat = maxCheckedInteractionRepeat(context.quizAgeBucket, interactionType);
    if (count > maxRepeat) {
      issues.push(
        `checked interaction ${interactionType} is repeated more than ${maxRepeat} times`
      );
    }
  }
  if (
    checkedInteractionCounts.size <
    MIN_CHECK_INTERACTION_TYPES_BY_BUCKET[context.quizAgeBucket]
  ) {
    issues.push(`not enough distinct checked interaction types for ${context.quizAgeBucket}`);
  }

  if (context.quizAgeBucket === '9-12') {
    if (advancedCheckedCountNineTwelve < 4) {
      issues.push('9-12 should include at least 4 advanced checked activities');
    }
    if (checkedTextSupportedCount < 3) {
      issues.push('9-12 should include at least 3 text-supported checked activities');
    }
    if (simpleCheckedCountNineTwelve > 2) {
      issues.push('9-12 should use at most 2 simple checked activities');
    }
    if (visualRecallCheckedCountNineTwelve > 1) {
      issues.push('9-12 should use at most 1 visual/detail recall checked activity');
    }
  }

  return issues;
}

export const storyQuizResponseSchema: JsonSchema = {
  type: 'object',
  required: [
    'title',
    'language',
    'sourceAgeGroup',
    'quizAgeBucket',
    'sections',
    'activities',
    'reward',
  ],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 2, maxLength: 120 },
    language: { type: 'string', minLength: 2, maxLength: 10 },
    sourceAgeGroup: { type: 'string', minLength: 1, maxLength: 20 },
    quizAgeBucket: { type: 'string', enum: QUIZ_AGE_BUCKETS },
    sections: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: {
        type: 'object',
        required: ['rubric', 'title', 'activityIds'],
        additionalProperties: false,
        properties: {
          rubric: { type: 'string', enum: QUIZ_RUBRICS },
          title: { type: 'string', minLength: 2, maxLength: 80 },
          subtitle: { type: 'string', maxLength: 160 },
          activityIds: {
            type: 'array',
            minItems: 1,
            maxItems: 7,
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    activities: {
      type: 'array',
      minItems: 2,
      maxItems: 10,
      items: {
        type: 'object',
        required: [
          'id',
          'rubric',
          'kind',
          'interactionType',
          'resultKind',
          'deliveryMode',
          'question',
          'parentReadText',
          'options',
        ],
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 80 },
          rubric: { type: 'string', enum: QUIZ_RUBRICS },
          kind: { type: 'string', enum: QUIZ_ACTIVITY_KINDS },
          interactionType: { type: 'string', enum: QUIZ_INTERACTION_TYPES },
          resultKind: { type: 'string', enum: QUIZ_RESULT_KINDS },
          deliveryMode: { type: 'string', enum: QUIZ_DELIVERY_MODES },
          question: { type: 'string', minLength: 3, maxLength: 220 },
          parentReadText: { type: 'string', maxLength: 220 },
          hint: { type: 'string', maxLength: 180 },
          retryHint: { type: 'string', maxLength: 180 },
          rewardSpark: { type: 'string', maxLength: 120 },
          correctOptionId: { type: 'string', maxLength: 80 },
          correctOptionIds: {
            type: 'array',
            maxItems: 5,
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
          preferredOrderIds: {
            type: 'array',
            maxItems: 6,
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
          pairs: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              required: ['leftId', 'rightId'],
              additionalProperties: false,
              properties: {
                leftId: { type: 'string', minLength: 1, maxLength: 80 },
                rightId: { type: 'string', minLength: 1, maxLength: 80 },
              },
            },
          },
          evidenceSceneIds: {
            type: 'array',
            maxItems: 4,
            items: { type: 'integer', minimum: 1, maximum: 100 },
          },
          options: {
            type: 'array',
            maxItems: 10,
            items: {
              type: 'object',
              required: ['id', 'label'],
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 80 },
                label: { type: 'string', minLength: 1, maxLength: 140 },
                sceneId: { type: 'integer', minimum: 1, maximum: 100 },
                colorHex: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
              },
            },
          },
        },
      },
    },
    reward: {
      type: 'object',
      required: ['label', 'unlockPolicy', 'bonusRules'],
      additionalProperties: false,
      properties: {
        label: { type: 'string', minLength: 2, maxLength: 80 },
        unlockPolicy: { type: 'string', enum: ['complete_check_reward'] },
        bonusRules: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'string',
            enum: ['first_attempt', 'used_evidence', 'retry_resolved', 'all_check_completed'],
          },
        },
      },
    },
  },
};
