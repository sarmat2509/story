import crypto from 'crypto';
import type { ModerationDecisionEvent, NewModerationDecisionEvent } from '../db/schema';
import type { ModerationDecisionRepository } from '../repositories/ModerationDecisionRepository';
import { logger } from '../utils/logger';

export type ModerationDecisionValue =
  | 'allowed'
  | 'blocked'
  | 'failed'
  | 'regenerated'
  | 'needs_review';

export interface RecordModerationDecisionInput {
  userId?: string;
  storyId?: string;
  storyRequestId?: string;
  childProfileId?: string;
  stage: string;
  source: string;
  subjectType: string;
  subjectRefHash?: string;
  decision: ModerationDecisionValue;
  code?: string;
  category?: string;
  ruleId?: string;
  metadata?: unknown;
}

export interface ListAdminModerationDecisionEventsInput {
  limit: number;
  offset: number;
  decision?: string;
  stage?: string;
  userId?: string;
  storyId?: string;
}

const SENSITIVE_METADATA_TOKENS = new Set([
  'prompt',
  'text',
  'message',
  'email',
  'url',
  'path',
  'token',
  'secret',
  'raw',
  'photo',
  'image',
  'name',
]);
const SAFE_METADATA_SUFFIX_RE = /(hash|count|length|type|types|code|category|categories|ruleid|stage|source|status|decision|provider|index)$/iu;
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_KEYS = 30;
const MAX_METADATA_ARRAY_ITEMS = 20;
const MAX_METADATA_STRING_LENGTH = 160;

export function hashModerationSubject(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function shouldRedactMetadataKey(key: string): boolean {
  if (SAFE_METADATA_SUFFIX_RE.test(key)) {
    return false;
  }

  const tokens = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);

  return tokens.some((token) => SENSITIVE_METADATA_TOKENS.has(token));
}

export function sanitizeModerationMetadata(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > MAX_METADATA_STRING_LENGTH
      ? `${value.slice(0, MAX_METADATA_STRING_LENGTH)}...`
      : value;
  }

  if (depth >= MAX_METADATA_DEPTH) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ARRAY_ITEMS)
      .map((item) => sanitizeModerationMetadata(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_METADATA_KEYS)
        .map(([key, entry]) => [
          key,
          shouldRedactMetadataKey(key)
            ? '[redacted]'
            : sanitizeModerationMetadata(entry, depth + 1),
        ])
    );
  }

  return String(value);
}

function shouldPersistModerationDecisionEvents(): boolean {
  if (process.env.MODERATION_DECISION_EVENTS_ENABLED === 'false') {
    return false;
  }
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  if (process.argv.some((arg) => arg.includes('/__tests__/') || arg.includes('\\__tests__\\'))) {
    return false;
  }
  return true;
}

function toInsert(input: RecordModerationDecisionInput): NewModerationDecisionEvent {
  return {
    userId: input.userId ?? null,
    storyId: input.storyId ?? null,
    storyRequestId: input.storyRequestId ?? null,
    childProfileId: input.childProfileId ?? null,
    stage: input.stage,
    source: input.source,
    subjectType: input.subjectType,
    subjectRefHash: input.subjectRefHash ?? null,
    decision: input.decision,
    code: input.code ?? null,
    category: input.category ?? null,
    ruleId: input.ruleId ?? null,
    metadata: sanitizeModerationMetadata(input.metadata ?? {}),
  };
}

export async function recordModerationDecision(
  input: RecordModerationDecisionInput,
  repository?: Pick<ModerationDecisionRepository, 'create'>
): Promise<void> {
  if (!shouldPersistModerationDecisionEvents() && !repository) {
    return;
  }

  try {
    const repo = repository ?? (await import('../repositories')).getModerationDecisionRepository();
    await repo.create(toInsert(input));
  } catch (error) {
    logger.warn(
      {
        err: error,
        userId: input.userId,
        storyId: input.storyId,
        storyRequestId: input.storyRequestId,
        stage: input.stage,
        source: input.source,
        decision: input.decision,
        code: input.code,
        category: input.category,
      },
      'Failed to persist moderation decision event'
    );
  }
}

function serializeEvent(event: ModerationDecisionEvent) {
  return {
    ...event,
    createdAt: event.createdAt.toISOString(),
  };
}

export async function listAdminModerationDecisionEvents(
  input: ListAdminModerationDecisionEventsInput,
  repository?: Pick<ModerationDecisionRepository, 'listRecent' | 'countRecent'>
) {
  const repo = repository ?? (await import('../repositories')).getModerationDecisionRepository();
  const [items, total] = await Promise.all([
    repo.listRecent(input),
    repo.countRecent(input),
  ]);

  return {
    items: items.map(serializeEvent),
    meta: {
      limit: input.limit,
      offset: input.offset,
      total,
    },
  };
}
