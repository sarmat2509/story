import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type {
  StoryQuizApi,
  StoryQuizAnswerApi,
  StoryQuizActivityApi,
  StoryQuizOptionApi,
  StoryQuizRubric,
} from '@wondertales/shared';
import { useGenerateStoryQuiz, useSaveStoryQuizAnswer, useStoryQuiz } from '@/api/stories';
import { AppButton } from '@/components/AppButton';
import { theme } from '@/theme';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import { useResponsive } from '@/hooks/useResponsive';

type AnswerState = {
  selectedIds: string[];
  result?: 'correct' | 'retry' | 'reflective';
  matchedPairs?: Array<{ leftId: string; rightId: string }>;
  pendingLeftId?: string;
};

type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MatchColumnSide = 'left' | 'right';

type MatchLayoutState = {
  board?: LayoutRect;
  columns: Partial<Record<MatchColumnSide, LayoutRect>>;
  items: Record<string, LayoutRect>;
};

const MATCH_LINE_CARD_GAP = 8;
const MATCH_LINE_LANE_START_GAP = 15;
const MATCH_LINE_LANE_END_GAP = 14;
const MATCH_LINE_LANE_WINDOW_RATIO = 0.45;
const MATCH_LINE_SECOND_CROSS_LANE_OFFSET = -3;

const MATCH_LINE_COLORS = [
  theme.colors.interactive.primary,
  theme.colors.status.success,
  theme.colors.status.warning,
  theme.colors.error[500],
  theme.colors.primary[700],
];

interface StoryReflectionSectionProps {
  storyId: string;
  enabled: boolean;
  /** Lets component previews render a completed quiz without requesting it from the API. */
  initialQuiz?: StoryQuizApi | null;
  onScenePress?: (sceneId: number) => void;
  rewardAction?: React.ReactNode;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function isPairCorrect(
  activity: StoryQuizActivityApi,
  pairs: Array<{ leftId: string; rightId: string }>
): boolean {
  const expected = activity.pairs ?? [];
  if (pairs.length !== expected.length) return false;
  return expected.every((pair) =>
    pairs.some(
      (candidate) => candidate.leftId === pair.leftId && candidate.rightId === pair.rightId
    )
  );
}

function isActivityCorrect(
  activity: StoryQuizActivityApi,
  state: AnswerState | undefined
): boolean {
  if (!state) return false;
  if (activity.correctOptionId) return state.selectedIds[0] === activity.correctOptionId;
  if (activity.correctOptionIds) return sameSet(state.selectedIds, activity.correctOptionIds);
  if (activity.preferredOrderIds) return sameOrder(state.selectedIds, activity.preferredOrderIds);
  if (activity.pairs) return isPairCorrect(activity, state.matchedPairs ?? []);
  return false;
}

function uniqueOptionsByIds(options: StoryQuizOptionApi[], ids: string[]): StoryQuizOptionApi[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  const seen = new Set<string>();
  const result: StoryQuizOptionApi[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const option = byId.get(id);
    if (!option) continue;
    seen.add(id);
    result.push(option);
  }
  return result;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function stableShuffleOptions(
  options: StoryQuizOptionApi[],
  seedValue: string
): StoryQuizOptionApi[] {
  const result = [...options];
  let seed = hashString(seedValue);
  for (let index = result.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed);
    const swapIndex = seed % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function rotateOptions(options: StoryQuizOptionApi[], offset: number): StoryQuizOptionApi[] {
  return options.map((_, index) => options[(index + offset) % options.length]);
}

function hasAlignedMatchAnswer(
  leftOptions: StoryQuizOptionApi[],
  rightOptions: StoryQuizOptionApi[],
  pairs: NonNullable<StoryQuizActivityApi['pairs']>
): boolean {
  return rightOptions.some((rightOption, index) => {
    const leftOption = leftOptions[index];
    if (!leftOption) return false;
    return pairs.some((pair) => pair.leftId === leftOption.id && pair.rightId === rightOption.id);
  });
}

function shuffledMatchRightOptions(
  leftOptions: StoryQuizOptionApi[],
  rightOptions: StoryQuizOptionApi[],
  pairs: NonNullable<StoryQuizActivityApi['pairs']>,
  seedValue: string
): StoryQuizOptionApi[] {
  if (rightOptions.length < 2) return rightOptions;
  const shuffled = stableShuffleOptions(rightOptions, seedValue);
  if (!hasAlignedMatchAnswer(leftOptions, shuffled, pairs)) return shuffled;

  for (let offset = 1; offset < shuffled.length; offset += 1) {
    const rotated = rotateOptions(shuffled, offset);
    if (!hasAlignedMatchAnswer(leftOptions, rotated, pairs)) return rotated;
  }

  return rotateOptions(rightOptions, 1);
}

function localizedStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function correctFeedbackForActivity(
  activity: StoryQuizActivityApi,
  t: (key: string, options?: Record<string, unknown>) => unknown
): string {
  const feedbacks = localizedStringArray(
    t('story_quiz.correct_feedbacks', {
      returnObjects: true,
      defaultValue: [],
    })
  );
  const fallback = String(
    t('story_quiz.correct_feedback', {
      defaultValue: 'Yes! You noticed the story clue.',
    })
  );
  const options = feedbacks.length > 0 ? feedbacks : [fallback];
  return options[hashString(activity.id) % options.length];
}

function answerStateFromSaved(answer: StoryQuizAnswerApi): AnswerState {
  return {
    selectedIds: answer.selectedIds ?? [],
    result: answer.result,
    matchedPairs: answer.matchedPairs,
  };
}

function answerStateByActivityId(
  answers: Record<string, StoryQuizAnswerApi> | undefined
): Record<string, AnswerState> {
  if (!answers) return {};
  return Object.fromEntries(
    Object.entries(answers).map(([activityId, answer]) => [
      activityId,
      answerStateFromSaved(answer),
    ])
  );
}

function getArrowPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  laneX?: number
): string {
  if (Math.abs(end.y - start.y) < 10) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }
  const midX = laneX ?? (start.x + end.x) / 2;
  return [
    `M ${start.x} ${start.y}`,
    `L ${midX} ${start.y}`,
    `L ${midX} ${end.y}`,
    `L ${end.x} ${end.y}`,
  ].join(' ');
}

function getArrowHeadPath(end: { x: number; y: number }, size = 8): string {
  return [
    `M ${end.x} ${end.y}`,
    `L ${end.x - size} ${end.y - size * 0.58}`,
    `M ${end.x} ${end.y}`,
    `L ${end.x - size} ${end.y + size * 0.58}`,
  ].join(' ');
}

function getMatchLaneX(startX: number, endX: number, laneIndex: number, laneCount: number): number {
  const span = Math.max(endX - startX, 1);
  const laneWindow = span * MATCH_LINE_LANE_WINDOW_RATIO;
  const laneStep = laneCount > 1 ? laneWindow / (laneCount - 1) : 0;
  const laneOffset = laneIndex === 1 ? MATCH_LINE_SECOND_CROSS_LANE_OFFSET : 0;
  const rawLaneX = startX + MATCH_LINE_LANE_START_GAP + laneStep * laneIndex;
  const laneX = Math.min(rawLaneX, endX - MATCH_LINE_LANE_END_GAP);
  return Math.max(startX + MATCH_LINE_LANE_START_GAP, laneX + laneOffset);
}

function ActivityCard({
  activity,
  state,
  onStateChange,
  onScenePress,
}: {
  activity: StoryQuizActivityApi;
  state: AnswerState | undefined;
  onStateChange: (next: AnswerState, persist?: boolean) => void;
  onScenePress?: (sceneId: number) => void;
}) {
  const { t } = useTranslation();
  const selectedIds = state?.selectedIds ?? [];
  const result = state?.result;
  const options = activity.options ?? [];
  const pairs = activity.pairs ?? [];
  const displayOptions =
    activity.interactionType === 'match_pairs'
      ? options
      : stableShuffleOptions(
          options,
          `${activity.id}:${activity.interactionType}:${options.map((option) => option.id).join('|')}`
        );
  const isReflective = activity.rubric === 'think_talk';
  const [matchLayout, setMatchLayout] = useState<MatchLayoutState>({
    columns: {},
    items: {},
  });
  const canSubmit =
    activity.interactionType === 'multi_select' ||
    activity.interactionType === 'sequence_order' ||
    activity.interactionType === 'match_pairs';

  const chooseSingle = (optionId: string) => {
    if (isReflective) {
      onStateChange({ selectedIds: [optionId], result: 'reflective' }, true);
      return;
    }
    const next: AnswerState = { selectedIds: [optionId] };
    next.result = isActivityCorrect(activity, next) ? 'correct' : 'retry';
    onStateChange(next, true);
  };

  const toggleMulti = (optionId: string) => {
    const nextIds = selectedIds.includes(optionId)
      ? selectedIds.filter((id) => id !== optionId)
      : [...selectedIds, optionId];
    onStateChange({ ...state, selectedIds: nextIds });
  };

  const toggleSequence = (optionId: string) => {
    const nextIds = selectedIds.includes(optionId)
      ? selectedIds.filter((id) => id !== optionId)
      : [...selectedIds, optionId];
    onStateChange({ ...state, selectedIds: nextIds, result: undefined });
  };

  const handlePairLeftTap = (leftId: string) => {
    if (state?.pendingLeftId === leftId) {
      onStateChange({ ...state, selectedIds, pendingLeftId: undefined, result: undefined });
      return;
    }
    onStateChange({
      ...state,
      selectedIds,
      result: undefined,
      pendingLeftId: leftId,
      matchedPairs: (state?.matchedPairs ?? []).filter((pair) => pair.leftId !== leftId),
    });
  };

  const handlePairRightTap = (rightId: string) => {
    if (!state?.pendingLeftId) {
      const existingPair = (state?.matchedPairs ?? []).find((pair) => pair.rightId === rightId);
      if (!existingPair) return;
      onStateChange({
        ...state,
        selectedIds,
        result: undefined,
        matchedPairs: (state?.matchedPairs ?? []).filter((pair) => pair.rightId !== rightId),
      });
      return;
    }
    onStateChange({
      ...state,
      selectedIds,
      result: undefined,
      pendingLeftId: undefined,
      matchedPairs: [
        ...(state.matchedPairs ?? []).filter(
          (pair) => pair.leftId !== state.pendingLeftId && pair.rightId !== rightId
        ),
        { leftId: state.pendingLeftId, rightId },
      ],
    });
  };

  const submit = () => {
    const next: AnswerState = { ...state, selectedIds };
    next.result = isActivityCorrect(activity, next) ? 'correct' : 'retry';
    onStateChange(next, true);
  };

  const reset = () => onStateChange({ selectedIds: [] }, true);

  const renderOption = (option: StoryQuizOptionApi) => {
    const isSelected = selectedIds.includes(option.id) || state?.pendingLeftId === option.id;
    const sequencePosition =
      activity.interactionType === 'sequence_order' ? selectedIds.indexOf(option.id) : -1;
    const onPress =
      activity.interactionType === 'multi_select'
        ? () => toggleMulti(option.id)
        : activity.interactionType === 'sequence_order'
          ? () => toggleSequence(option.id)
          : activity.interactionType === 'match_pairs'
            ? () => handlePairLeftTap(option.id)
            : () => chooseSingle(option.id);

    return (
      <TouchableOpacity
        key={option.id}
        testID={`story-quiz-option-${activity.id}-${option.id}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
        activeOpacity={0.82}
        onPress={onPress}
      >
        <View style={styles.optionContent}>
          {option.colorHex ? (
            <View style={[styles.optionColorSwatch, { backgroundColor: option.colorHex }]} />
          ) : null}
          <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
            {option.label}
          </Text>
          {sequencePosition >= 0 ? (
            <View style={styles.sequenceBadge}>
              <Text style={styles.sequenceBadgeText}>{sequencePosition + 1}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const updateMatchBoardLayout = (event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setMatchLayout((current) => ({ ...current, board: { x, y, width, height } }));
  };

  const updateMatchColumnLayout = (side: MatchColumnSide) => (event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setMatchLayout((current) => ({
      ...current,
      columns: {
        ...current.columns,
        [side]: { x, y, width, height },
      },
    }));
  };

  const updateMatchItemLayout = (optionId: string) => (event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setMatchLayout((current) => ({
      ...current,
      items: {
        ...current.items,
        [optionId]: { x, y, width, height },
      },
    }));
  };

  const getMatchPairColor = (leftId: string) => {
    const pairIndex = Math.max(
      pairs.findIndex((expectedPair) => expectedPair.leftId === leftId),
      0
    );
    return MATCH_LINE_COLORS[pairIndex % MATCH_LINE_COLORS.length];
  };

  const renderMatchOption = (option: StoryQuizOptionApi, side: MatchColumnSide) => {
    const matchedPair = (state?.matchedPairs ?? []).find((pair) =>
      side === 'left' ? pair.leftId === option.id : pair.rightId === option.id
    );
    const isPending = side === 'left' && state?.pendingLeftId === option.id;
    const isConnected = Boolean(matchedPair);
    const connectedColor = matchedPair ? getMatchPairColor(matchedPair.leftId) : undefined;

    return (
      <TouchableOpacity
        key={option.id}
        testID={`story-quiz-option-${activity.id}-${option.id}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isPending || isConnected }}
        style={[
          styles.matchOptionButton,
          side === 'left' ? styles.matchOptionLeft : styles.matchOptionRight,
          isConnected && styles.matchOptionConnected,
          connectedColor ? { borderColor: connectedColor, borderWidth: 2 } : null,
          isPending && styles.matchOptionPending,
        ]}
        activeOpacity={0.82}
        onLayout={updateMatchItemLayout(option.id)}
        onPress={() =>
          side === 'left' ? handlePairLeftTap(option.id) : handlePairRightTap(option.id)
        }
      >
        <Text
          style={[styles.matchOptionText, (isPending || isConnected) && styles.optionTextSelected]}
        >
          {option.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderMatchLines = () => {
    if (!matchLayout.board) return null;
    const lineOpacity = result === 'retry' ? 0.72 : 0.9;
    let nextCrossLaneIndex = 0;
    const lineModels = (state?.matchedPairs ?? [])
      .map((pair) => {
        const leftColumn = matchLayout.columns.left;
        const rightColumn = matchLayout.columns.right;
        const left = matchLayout.items[pair.leftId];
        const right = matchLayout.items[pair.rightId];
        if (!leftColumn || !rightColumn || !left || !right) return null;
        const pairIndex = Math.max(
          pairs.findIndex((expectedPair) => expectedPair.leftId === pair.leftId),
          0
        );
        const start = {
          x: leftColumn.x + left.x + left.width + MATCH_LINE_CARD_GAP,
          y: leftColumn.y + left.y + left.height / 2,
        };
        const end = {
          x: rightColumn.x + right.x - MATCH_LINE_CARD_GAP,
          y: rightColumn.y + right.y + right.height / 2,
        };
        const isCrossRow = Math.abs(end.y - start.y) >= 10;
        const crossLaneIndex = isCrossRow ? nextCrossLaneIndex++ : 0;
        return { pair, pairIndex, start, end, isCrossRow, crossLaneIndex };
      })
      .filter((model): model is NonNullable<typeof model> => Boolean(model));
    const crossLaneCount = lineModels.filter((model) => model.isCrossRow).length;

    return (
      <Svg
        width={matchLayout.board.width}
        height={matchLayout.board.height}
        style={styles.matchLinesLayer}
      >
        {lineModels.map(({ pair, pairIndex, start, end, isCrossRow, crossLaneIndex }) => {
          const lineColor = MATCH_LINE_COLORS[pairIndex % MATCH_LINE_COLORS.length];
          const laneX = isCrossRow
            ? getMatchLaneX(start.x, end.x, crossLaneIndex, crossLaneCount)
            : undefined;
          const arrowPath = getArrowPath(start, end, laneX);
          const arrowHeadPath = getArrowHeadPath(end);
          return (
            <React.Fragment key={`${pair.leftId}:${pair.rightId}`}>
              <Path
                d={arrowPath}
                stroke={theme.colors.background.primary}
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={0.96}
              />
              <Path
                d={arrowHeadPath}
                stroke={theme.colors.background.primary}
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={0.96}
              />
              <Path
                d={arrowPath}
                stroke={lineColor}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={lineOpacity}
              />
              <Path
                d={arrowHeadPath}
                stroke={lineColor}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={lineOpacity}
              />
              <Circle cx={start.x} cy={start.y} r={4} fill={lineColor} opacity={lineOpacity} />
            </React.Fragment>
          );
        })}
      </Svg>
    );
  };

  const renderMatchPairs = () => {
    const leftOptions = uniqueOptionsByIds(
      options,
      pairs.map((pair) => pair.leftId)
    );
    const rightOptions = shuffledMatchRightOptions(
      leftOptions,
      uniqueOptionsByIds(
        options,
        pairs.map((pair) => pair.rightId)
      ),
      pairs,
      `${activity.id}:${pairs.map((pair) => `${pair.leftId}-${pair.rightId}`).join('|')}`
    );

    return (
      <View
        style={styles.matchBoard}
        testID={`story-quiz-match-board-${activity.id}`}
        onLayout={updateMatchBoardLayout}
      >
        {renderMatchLines()}
        <View
          style={[styles.matchColumn, styles.matchColumnLeft]}
          onLayout={updateMatchColumnLayout('left')}
        >
          <Text style={styles.matchColumnTitle}>
            {t('story_quiz.match_left_title', { defaultValue: 'Герой' })}
          </Text>
          {leftOptions.map((option) => renderMatchOption(option, 'left'))}
        </View>
        <View
          style={[styles.matchColumn, styles.matchColumnRight]}
          onLayout={updateMatchColumnLayout('right')}
        >
          <Text style={styles.matchColumnTitle}>
            {t('story_quiz.match_right_title', { defaultValue: 'Дія' })}
          </Text>
          {rightOptions.map((option) => renderMatchOption(option, 'right'))}
        </View>
      </View>
    );
  };

  const submitDisabled =
    activity.interactionType === 'sequence_order'
      ? selectedIds.length !== displayOptions.length
      : activity.interactionType === 'match_pairs'
        ? (state?.matchedPairs?.length ?? 0) !== pairs.length
        : selectedIds.length === 0 && (state?.matchedPairs?.length ?? 0) === 0;

  return (
    <View style={styles.activityCard} testID={`story-quiz-activity-${activity.id}`}>
      <Text style={styles.questionText}>{activity.question}</Text>

      {activity.interactionType === 'match_pairs' ? (
        renderMatchPairs()
      ) : (
        <View style={styles.optionsGrid}>{displayOptions.map(renderOption)}</View>
      )}

      {activity.interactionType === 'sequence_order' && selectedIds.length > 0 ? (
        <Text style={styles.helperText}>
          {t('story_quiz.sequence_helper', {
            defaultValue: 'Хронологический порядок:',
          })}{' '}
          {selectedIds
            .map((id) => displayOptions.find((option) => option.id === id)?.label)
            .filter(Boolean)
            .join(' → ')}
        </Text>
      ) : null}

      {activity.interactionType === 'match_pairs' && (state?.matchedPairs?.length ?? 0) > 0 ? (
        <Text style={styles.helperText}>
          {t('story_quiz.pairs_helper', { defaultValue: 'Пары выбраны' })}:{' '}
          {state?.matchedPairs?.length}
        </Text>
      ) : null}

      {canSubmit ? (
        <View style={styles.cardActions}>
          <AppButton
            label={t('story_quiz.check_answer', { defaultValue: 'Проверить' })}
            onPress={submit}
            size="sm"
            disabled={submitDisabled}
          />
        </View>
      ) : null}

      {activity.evidenceSceneIds?.length ? (
        <View style={styles.sceneChips}>
          {activity.evidenceSceneIds.map((sceneId, index) => (
            <TouchableOpacity
              key={sceneId}
              testID={`story-quiz-scene-${activity.id}-${sceneId}`}
              accessibilityRole="button"
              accessibilityLabel={t('story_quiz.scene_hint_accessibility', {
                defaultValue: 'Подсказка в тексте {{index}}',
                index: index + 1,
              })}
              style={styles.sceneChip}
              onPress={() => onScenePress?.(sceneId)}
            >
              <Ionicons
                name="bookmark-outline"
                size={13}
                color={theme.colors.interactive.primary}
              />
              <Text style={styles.sceneChipText}>
                {t('story_quiz.scene_hint', { defaultValue: 'Подсказка в тексте' })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {result === 'correct' ? (
        <View style={styles.feedbackGood}>
          <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.status.success} />
          <Text style={styles.feedbackGoodText}>{correctFeedbackForActivity(activity, t)}</Text>
        </View>
      ) : result === 'retry' ? (
        <View style={styles.feedbackRetry}>
          <Text style={styles.feedbackRetryText}>
            {activity.retryHint ||
              activity.hint ||
              t('story_quiz.retry_feedback', {
                defaultValue: 'Почти. Посмотри на подсказку и попробуй ещё раз.',
              })}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={reset}>
            <Text style={styles.retryButtonText}>
              {t('story_quiz.retry_button', { defaultValue: 'Попробовать ещё' })}
            </Text>
          </TouchableOpacity>
        </View>
      ) : result === 'reflective' ? (
        <View style={styles.feedbackNeutral}>
          <Text style={styles.feedbackNeutralText}>
            {t('story_quiz.reflective_feedback', {
              defaultValue: 'Хорошая мысль. Это можно обсудить вместе.',
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function StoryReflectionSection({
  storyId,
  enabled,
  initialQuiz,
  onScenePress,
  rewardAction,
}: StoryReflectionSectionProps) {
  const { t } = useTranslation();
  const { isMobile } = useResponsive();
  const [quizRequestedStoryId, setQuizRequestedStoryId] = useState<string | null>(null);
  const quizQuery = useStoryQuiz(
    storyId,
    enabled && !initialQuiz && quizRequestedStoryId === storyId
  );
  const generateQuiz = useGenerateStoryQuiz();
  const saveQuizAnswer = useSaveStoryQuizAnswer();
  const quiz = initialQuiz ?? quizQuery.data ?? null;
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [dismissed, setDismissed] = useState(false);
  const [activeRubric, setActiveRubric] = useState<StoryQuizRubric>('check_reward');
  const hydratedProgressKeyRef = useRef<string | null>(null);

  const payload = quiz?.payload ?? null;
  const isGenerating = quiz?.status === 'generating' || generateQuiz.isPending;
  const checkActivities = useMemo(
    () => payload?.activities.filter((activity) => activity.rubric === 'check_reward') ?? [],
    [payload]
  );
  const rewardUnlocked =
    checkActivities.length > 0 &&
    checkActivities.every((activity) => answers[activity.id]?.result === 'correct');

  useEffect(() => {
    if (!payload || !quiz?.id) return;
    const progressKey = quiz.progress
      ? `${quiz.id}:${quiz.progress.id}:${quiz.progress.updatedAt}`
      : `${quiz.id}:empty`;
    if (hydratedProgressKeyRef.current === progressKey) return;
    hydratedProgressKeyRef.current = progressKey;
    setAnswers(answerStateByActivityId(quiz.progress?.answers));
  }, [payload, quiz?.id, quiz?.progress?.id, quiz?.progress?.updatedAt]);

  const persistAnswer = (activity: StoryQuizActivityApi, next: AnswerState) => {
    if (!quiz?.id || initialQuiz) return;
    saveQuizAnswer.mutate({
      storyId,
      activityId: activity.id,
      selectedIds: next.selectedIds,
      matchedPairs: next.matchedPairs,
    });
  };

  const handleGenerateQuiz = () => {
    generateQuiz.mutate(
      { storyId },
      {
        onSettled: () => setQuizRequestedStoryId(storyId),
      }
    );
  };

  if (!enabled || dismissed) return null;

  if (!payload) {
    if (isGenerating) {
      return (
        <View
          style={[styles.invitationContainer, isMobile && styles.invitationContainerMobile]}
          testID="story-quiz-generating"
        >
          <View style={styles.invitationIcon}>
            <Ionicons name="gift-outline" size={24} color={theme.colors.text.inverse} />
          </View>
          <View style={styles.invitationCopy}>
            <Text style={styles.title}>
              {t('story_quiz.invitation_title', {
                defaultValue: 'Хочешь открыть маленькое задание после сказки?',
              })}
            </Text>
            <Text style={styles.subtitle}>
              {t('story_quiz.invitation_subtitle', {
                defaultValue: 'Проверим пару моментов и откроем приз.',
              })}
            </Text>
          </View>
          <View style={styles.invitationStatus}>
            <Ionicons name="hourglass-outline" size={18} color={theme.colors.text.secondary} />
            <Text style={styles.loadingInlineText}>
              {t('story_quiz.loading', { defaultValue: 'Preparing activities...' })}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View
        style={[styles.invitationContainer, isMobile && styles.invitationContainerMobile]}
        testID="story-quiz-invitation"
      >
        <View style={styles.invitationIcon}>
          <Ionicons name="gift-outline" size={24} color={theme.colors.text.inverse} />
        </View>
        <View style={styles.invitationCopy}>
          <Text style={styles.title}>
            {t('story_quiz.invitation_title', {
              defaultValue: 'Хочешь открыть маленькое задание после сказки?',
            })}
          </Text>
          <Text style={styles.subtitle}>
            {t('story_quiz.invitation_subtitle', {
              defaultValue: 'Проверим пару моментов и откроем приз.',
            })}
          </Text>
        </View>
        <View style={styles.invitationActions}>
          <AppButton
            label={t('story_quiz.generate_cta', { defaultValue: 'Prepare activities' })}
            onPress={handleGenerateQuiz}
            size="md"
          />
          <TouchableOpacity style={styles.laterButton} onPress={() => setDismissed(true)}>
            <Text style={styles.laterButtonText}>
              {t('story_quiz.not_now', { defaultValue: 'Не сейчас' })}
            </Text>
          </TouchableOpacity>
        </View>
        {generateQuiz.error ? (
          <Text style={styles.errorText}>
            {getLocalizedApiError(t, generateQuiz.error, 'story_quiz.error')}
          </Text>
        ) : null}
      </View>
    );
  }

  const activeSection =
    payload.sections.find((section) => section.rubric === activeRubric) ?? payload.sections[0];
  const activeActivities = activeSection
    ? activeSection.activityIds
        .map((id) => payload.activities.find((activity) => activity.id === id))
        .filter((activity): activity is StoryQuizActivityApi => Boolean(activity))
    : [];

  return (
    <View style={styles.container} testID="story-quiz-section">
      <Text style={styles.sectionTitle}>
        {t('story_quiz.section_title', { defaultValue: 'Activities after the story' })}
      </Text>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['check_reward', 'think_talk'] as StoryQuizRubric[]).map((rubric) => {
          const isActive = activeRubric === rubric;
          const label =
            rubric === 'check_reward'
              ? t('story_quiz.check_label', {
                  defaultValue: 'Check yourself and claim a prize',
                })
              : t('story_quiz.talk_label', {
                  defaultValue: 'Talk about this story?',
                });
          return (
            <TouchableOpacity
              key={rubric}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveRubric(rubric)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.rubricSection}>
        {activeActivities.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            state={answers[activity.id]}
            onScenePress={onScenePress}
            onStateChange={(next, persist) => {
              setAnswers((current) => ({ ...current, [activity.id]: next }));
              if (persist) {
                persistAnswer(activity, next);
              }
            }}
          />
        ))}
        {activeRubric === 'check_reward' && rewardUnlocked && rewardAction ? (
          <View style={styles.rewardAction}>{rewardAction}</View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 22,
    gap: 14,
  },
  invitationContainer: {
    marginVertical: 24,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    gap: 14,
  },
  invitationContainerMobile: {
    borderRadius: 0,
  },
  invitationIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.interactive.primary,
  },
  invitationCopy: {
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text.secondary,
  },
  invitationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  laterButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  laterButtonText: {
    color: theme.colors.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: theme.colors.status.error,
    fontSize: 13,
  },
  invitationStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: theme.colors.background.primary,
  },
  loadingInlineText: {
    color: theme.colors.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    color: theme.colors.text.primary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabButton: {
    flexGrow: 1,
    flexBasis: 220,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  tabButtonActive: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  tabText: {
    color: theme.colors.text.secondary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  tabTextActive: {
    color: theme.colors.interactive.primary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.background.primary,
    maxWidth: 180,
  },
  rewardPillUnlocked: {
    borderColor: theme.colors.status.success,
    backgroundColor: theme.colors.status.success,
  },
  rewardPillText: {
    color: theme.colors.interactive.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  rewardPillTextUnlocked: {
    color: theme.colors.text.inverse,
  },
  rubricSection: {
    gap: 10,
  },
  rubricTitle: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  rubricSubtitle: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  activityCard: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
    gap: 10,
  },
  questionText: {
    color: theme.colors.text.primary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  optionsGrid: {
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    gap: 6,
  },
  optionButtonSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionColorSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
  },
  optionText: {
    flex: 1,
    color: theme.colors.text.primary,
    fontSize: 15,
    lineHeight: 20,
  },
  optionTextSelected: {
    fontWeight: '700',
  },
  matchBoard: {
    position: 'relative',
    flexDirection: 'row',
    gap: 44,
    paddingVertical: 2,
  },
  matchLinesLayer: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
    zIndex: 1,
  },
  matchColumn: {
    flex: 1,
    gap: 8,
    zIndex: 2,
  },
  matchColumnLeft: {
    paddingRight: 6,
  },
  matchColumnRight: {
    paddingLeft: 6,
  },
  matchColumnTitle: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  matchOptionButton: {
    minHeight: 54,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    justifyContent: 'center',
  },
  matchOptionLeft: {
    alignItems: 'flex-start',
  },
  matchOptionRight: {
    alignItems: 'flex-end',
  },
  matchOptionPending: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  matchOptionConnected: {
    borderColor: theme.colors.primary[300],
    backgroundColor: theme.colors.primary[50],
  },
  matchOptionText: {
    color: theme.colors.text.primary,
    fontSize: 14,
    lineHeight: 19,
  },
  sequenceBadge: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.interactive.primary,
  },
  sequenceBadgeText: {
    color: theme.colors.text.inverse,
    fontSize: 13,
    fontWeight: '800',
  },
  sceneChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sceneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.background.tertiary,
  },
  sceneChipText: {
    color: theme.colors.interactive.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  helperText: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: 'row',
  },
  feedbackGood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: `${theme.colors.status.success}18`,
  },
  feedbackGoodText: {
    color: theme.colors.status.success,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  feedbackRetry: {
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: theme.colors.warning[50],
  },
  feedbackRetryText: {
    color: theme.colors.text.primary,
    fontSize: 14,
    lineHeight: 19,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: theme.colors.background.primary,
  },
  retryButtonText: {
    color: theme.colors.interactive.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackNeutral: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: theme.colors.background.tertiary,
  },
  feedbackNeutralText: {
    color: theme.colors.text.secondary,
    fontSize: 14,
    lineHeight: 19,
  },
  rewardAction: {
    marginTop: 4,
    alignSelf: 'stretch',
  },
});

export default StoryReflectionSection;
