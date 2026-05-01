import crypto from 'crypto';
import { logger } from '../utils/logger';

export type PromptSafetyCategory =
  | 'child_exploitation'
  | 'sexual_content'
  | 'self_harm'
  | 'graphic_violence'
  | 'dangerous_instructions'
  | 'hate_or_extremism';

export type PromptSafetySource =
  | 'story_goal'
  | 'story_user_notes'
  | 'instant_story_goal'
  | 'instant_story_notes'
  | 'child_mode_story_goal'
  | 'child_mode_story_notes'
  | 'story_continuation_notes'
  | 'scene_regeneration_prompt';

export type PromptSafetyDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: 'PROMPT_SAFETY_BLOCKED';
      category: PromptSafetyCategory;
      ruleId: string;
      message: string;
    };

interface PromptSafetyRule {
  id: string;
  category: PromptSafetyCategory;
  patterns: RegExp[];
}

const PROMPT_SAFETY_BLOCK_MESSAGE =
  'This prompt cannot be used for a children story. Please choose a safer idea.';

const PROMPT_SAFETY_RULES: PromptSafetyRule[] = [
  {
    id: 'child-sexualization',
    category: 'child_exploitation',
    patterns: [
      /\b(?:child|kid|minor|baby|toddler|teen|teenager)\b.{0,60}\b(?:nude|naked|sex|sexual|erotic|porn|strip)\b/iu,
      /\b(?:nude|naked|sex|sexual|erotic|porn|strip)\b.{0,60}\b(?:child|kid|minor|baby|toddler|teen|teenager)\b/iu,
      /(?:дет|реб[её]н|малолет|подрост|дитин|підлітк).{0,60}(?:секс|сексу|гол[а-яіїєґ]*|эрот|ерот|порн|раздев|роздяг)/iu,
    ],
  },
  {
    id: 'explicit-sexual-content',
    category: 'sexual_content',
    patterns: [
      /\b(?:porn|erotic|fetish|sexual assault|rape|incest)\b/iu,
      /(?:порн|эротик|еротик|фетиш|изнасил|зґвалт|инцест|інцест)/iu,
    ],
  },
  {
    id: 'self-harm',
    category: 'self_harm',
    patterns: [
      /\b(?:suicide|self[-\s]?harm|kill myself|hurt myself)\b/iu,
      /(?:самоуб|суицид|суїцид|самоповрежд|самоушкодж)/iu,
    ],
  },
  {
    id: 'graphic-violence',
    category: 'graphic_violence',
    patterns: [
      /\b(?:gore|dismember|behead|decapitat|torture|murder|massacre|bloodbath|graphic violence)\b/iu,
      /\bkill(?:ing)?\b.{0,40}\b(?:child|kid|minor|people|everyone|him|her|them|myself)\b/iu,
      /(?:расчлен|обезглав|пытк|катуван|тортур|кровав|убийств|вбивств|р[іи]занин)/iu,
    ],
  },
  {
    id: 'dangerous-instructions',
    category: 'dangerous_instructions',
    patterns: [
      /\b(?:how to|instructions?|recipe|make|build|create)\b.{0,80}\b(?:bomb|explosive|gun|weapon|poison|meth|cocaine|heroin|drugs?)\b/iu,
      /\b(?:bomb|explosive|poison|meth|cocaine|heroin)\b/iu,
      /(?:бомб|взрывчат|вибух[а-яіїєґ]*|отрав|отрут|наркотик|метамфет|кокаин|кокаїн|героин|героїн)/iu,
    ],
  },
  {
    id: 'hate-extremism',
    category: 'hate_or_extremism',
    patterns: [
      /\b(?:heil hitler|white supremac|nazi propaganda|genocide)\b/iu,
      /(?:нацистск[а-я]* пропаганд|геноцид)/iu,
    ],
  },
];

export class PromptSafetyError extends Error {
  readonly statusCode = 400;
  readonly code = 'PROMPT_SAFETY_BLOCKED';
  readonly category: PromptSafetyCategory;
  readonly ruleId: string;
  readonly source: PromptSafetySource;

  constructor(decision: Exclude<PromptSafetyDecision, { allowed: true }>, source: PromptSafetySource) {
    super(decision.message);
    this.name = 'PromptSafetyError';
    this.category = decision.category;
    this.ruleId = decision.ruleId;
    this.source = source;
  }
}

export function isPromptSafetyError(error: unknown): error is PromptSafetyError {
  return error instanceof PromptSafetyError;
}

function normalizePromptText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function hashPromptForSupport(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function evaluatePromptSafety(text: string | null | undefined): PromptSafetyDecision {
  if (!text || text.trim().length === 0) {
    return { allowed: true };
  }

  const normalizedText = normalizePromptText(text);
  for (const rule of PROMPT_SAFETY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalizedText))) {
      return {
        allowed: false,
        code: 'PROMPT_SAFETY_BLOCKED',
        category: rule.category,
        ruleId: rule.id,
        message: PROMPT_SAFETY_BLOCK_MESSAGE,
      };
    }
  }

  return { allowed: true };
}

export function assertPromptSafety(input: {
  text: string | null | undefined;
  source: PromptSafetySource;
  userId?: string;
}): void {
  const decision = evaluatePromptSafety(input.text);
  if (decision.allowed === true) {
    return;
  }

  const normalizedText = normalizePromptText(input.text || '');
  logger.warn(
    {
      userId: input.userId,
      source: input.source,
      category: decision.category,
      ruleId: decision.ruleId,
      promptLength: normalizedText.length,
      promptHash: hashPromptForSupport(normalizedText),
    },
    'Unsafe prompt blocked before queueing'
  );

  throw new PromptSafetyError(decision, input.source);
}

export function assertStoryPromptSafety(input: {
  userId?: string;
  goal?: string | null;
  userNotes?: string | null;
  goalSource?: Extract<PromptSafetySource, 'story_goal' | 'instant_story_goal' | 'child_mode_story_goal'>;
  notesSource?: Extract<
    PromptSafetySource,
    'story_user_notes' | 'instant_story_notes' | 'child_mode_story_notes' | 'story_continuation_notes'
  >;
}): void {
  assertPromptSafety({
    text: input.goal,
    source: input.goalSource ?? 'story_goal',
    userId: input.userId,
  });
  assertPromptSafety({
    text: input.userNotes,
    source: input.notesSource ?? 'story_user_notes',
    userId: input.userId,
  });
}
