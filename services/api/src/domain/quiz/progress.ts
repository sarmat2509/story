import type {
  SaveStoryQuizAnswerInputApi,
  StoryQuizAnswerApi,
  StoryQuizPayloadApi,
  StoryQuizPairApi,
} from '@wondertales/shared';

export class StoryQuizAnswerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryQuizAnswerValidationError';
  }
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function samePairs(a: StoryQuizPairApi[], b: StoryQuizPairApi[]): boolean {
  if (a.length !== b.length) return false;
  return b.every((pair) =>
    a.some((candidate) => candidate.leftId === pair.leftId && candidate.rightId === pair.rightId)
  );
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function normalizePairs(value: unknown): StoryQuizPairApi[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: StoryQuizPairApi[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const pair = item as Partial<StoryQuizPairApi>;
    if (typeof pair.leftId !== 'string' || typeof pair.rightId !== 'string') continue;
    if (!pair.leftId || !pair.rightId) continue;
    const key = `${pair.leftId}:${pair.rightId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ leftId: pair.leftId, rightId: pair.rightId });
  }
  return result;
}

function assertKnownOptionIds(
  optionIds: Set<string>,
  selectedIds: string[],
  matchedPairs: StoryQuizPairApi[]
): void {
  const unknownSelected = selectedIds.find((id) => !optionIds.has(id));
  if (unknownSelected) {
    throw new StoryQuizAnswerValidationError(`Unknown option id: ${unknownSelected}`);
  }

  const unknownPair = matchedPairs.find(
    (pair) => !optionIds.has(pair.leftId) || !optionIds.has(pair.rightId)
  );
  if (unknownPair) {
    throw new StoryQuizAnswerValidationError('Matched pairs must reference known options');
  }
}

export function normalizeStoryQuizAnswer(
  payload: StoryQuizPayloadApi,
  activityId: string,
  input: SaveStoryQuizAnswerInputApi,
  answeredAt = new Date()
): StoryQuizAnswerApi | null {
  const activity = payload.activities.find((candidate) => candidate.id === activityId);
  if (!activity) {
    throw new StoryQuizAnswerValidationError(`Unknown activity id: ${activityId}`);
  }

  const selectedIds = normalizeStringArray(input.selectedIds);
  const matchedPairs = normalizePairs(input.matchedPairs);
  if (selectedIds.length === 0 && matchedPairs.length === 0) {
    return null;
  }

  const optionIds = new Set((activity.options ?? []).map((option) => option.id));
  assertKnownOptionIds(optionIds, selectedIds, matchedPairs);

  if (activity.rubric === 'think_talk') {
    return {
      activityId,
      selectedIds,
      ...(matchedPairs.length > 0 ? { matchedPairs } : {}),
      result: 'reflective',
      answeredAt: answeredAt.toISOString(),
    };
  }

  let isCorrect = false;
  if (activity.correctOptionId) {
    isCorrect = selectedIds[0] === activity.correctOptionId;
  } else if (activity.correctOptionIds) {
    isCorrect = sameSet(selectedIds, activity.correctOptionIds);
  } else if (activity.preferredOrderIds) {
    isCorrect = sameOrder(selectedIds, activity.preferredOrderIds);
  } else if (activity.pairs) {
    isCorrect = samePairs(matchedPairs, activity.pairs);
  }

  return {
    activityId,
    selectedIds,
    ...(matchedPairs.length > 0 ? { matchedPairs } : {}),
    result: isCorrect ? 'correct' : 'retry',
    answeredAt: answeredAt.toISOString(),
  };
}

export function mergeStoryQuizAnswer(
  payload: StoryQuizPayloadApi,
  answers: Record<string, StoryQuizAnswerApi>,
  activityId: string,
  input: SaveStoryQuizAnswerInputApi,
  answeredAt = new Date()
): Record<string, StoryQuizAnswerApi> {
  const next = { ...answers };
  const answer = normalizeStoryQuizAnswer(payload, activityId, input, answeredAt);
  if (!answer) {
    delete next[activityId];
    return next;
  }
  next[activityId] = answer;
  return next;
}

export function isCheckRewardComplete(
  payload: StoryQuizPayloadApi,
  answers: Record<string, StoryQuizAnswerApi>
): boolean {
  const checked = payload.activities.filter((activity) => activity.rubric === 'check_reward');
  return (
    checked.length > 0 &&
    checked.every((activity) => answers[activity.id]?.result === 'correct')
  );
}
