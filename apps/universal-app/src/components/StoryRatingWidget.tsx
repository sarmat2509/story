/**
 * Story Rating Widget - 5-point emoji scale (😢😕😐😊😍)
 * Only on public pages (/stories/:slug, /u/:token). Not on /me/stories.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RATING_EMOJIS, emojiForAvg } from '@wondertales/shared';
import { theme } from '@/theme';
import { ratingStorage } from '@/utils/ratingStorage';
import { submitStoryRating } from '@/api/stories';

export interface StoryRatingWidgetProps {
  storyId: string;
  slugOrToken: string;
  isUnlisted: boolean;
  rating?: { avg: number; count: number };
  onVoted?: () => void;
}

type ViewState = 'voting' | 'just_voted' | 'already_voted' | 'submitting';

export function StoryRatingWidget({
  storyId,
  slugOrToken,
  isUnlisted,
  rating,
  onVoted,
}: StoryRatingWidgetProps) {
  const { t } = useTranslation();
  const [viewState, setViewState] = useState<ViewState>('voting');
  const [, setRatedStories] = useState<Set<string>>(new Set());

  useEffect(() => {
    ratingStorage.getRatedStories().then((set) => {
      setRatedStories(set);
      if (set.has(storyId)) {
        setViewState('already_voted');
      }
    });
  }, [storyId]);

  const handleVote = useCallback(
    async (value: number) => {
      setViewState('submitting');
      try {
        const voterId = await ratingStorage.getOrCreateVoterId();
        await submitStoryRating(slugOrToken, value, voterId, isUnlisted);
        await ratingStorage.addRatedStory(storyId);
        setRatedStories((prev) => new Set(prev).add(storyId));
        setViewState('just_voted');
        onVoted?.();
      } catch (err: any) {
        if (err?.response?.status === 409) {
          await ratingStorage.addRatedStory(storyId);
          setRatedStories((prev) => new Set(prev).add(storyId));
          setViewState('already_voted');
        } else {
          setViewState('voting');
        }
      }
    },
    [storyId, slugOrToken, isUnlisted, onVoted]
  );

  return (
    <View style={styles.container}>
      {(viewState === 'voting' || (rating && rating.count > 0)) && (
        <Text style={styles.heading}>{t('story_rating.heading')}</Text>
      )}
      {rating && rating.count > 0 && (
        <View style={styles.ratingDisplay}>
          <Text style={styles.ratingEmoji}>{emojiForAvg(rating.avg)}</Text>
          <Text style={styles.ratingScore}>
            {rating.avg.toFixed(1)} ({rating.count})
          </Text>
        </View>
      )}
      {viewState === 'voting' && (
        <View style={styles.emojiRow}>
          {RATING_EMOJIS.map((emoji, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.emojiButton}
              onPress={() => handleVote(idx + 1)}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {viewState === 'submitting' && (
        <View style={styles.messageRow}>
          <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
        </View>
      )}
      {viewState === 'just_voted' && (
        <Text style={styles.message}>{t('story_rating.thank_you')}</Text>
      )}
      {viewState === 'already_voted' && (
        <Text style={styles.message}>{t('story_rating.already_voted')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
    marginBottom: theme.spacing[4],
  },
  heading: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[3],
    textAlign: 'center',
  },
  ratingDisplay: {
    alignItems: 'center',
    marginBottom: theme.spacing[3],
  },
  ratingEmoji: {
    fontSize: 48,
    marginBottom: theme.spacing[1],
  },
  ratingScore: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
  emojiButton: {
    padding: theme.spacing[2],
  },
  emoji: {
    fontSize: 28,
  },
  messageRow: {
    alignItems: 'center',
    padding: theme.spacing[2],
  },
  message: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.disabled,
    textAlign: 'center',
  },
});
