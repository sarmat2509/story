import React, { useCallback, useMemo, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useRoute, RouteProp, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  useSeriesStories,
  useSeriesInfo,
  useScheduleStatus,
  prefetchStory,
} from '@/api/stories';
import { useVoices } from '@/api/voices';
import { navigateToStory } from '@/navigation/navigationRef';
import { theme } from '@/theme';
import { StoryCard } from '@/components/StoryCard';
import { ContinueSeriesSection } from '@/components/ContinueSeriesSection';
import { PendingPartCard } from '@/components/PendingPartCard';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { useAuthStore } from '@/store/authStore';
import type { MainDrawerParamList } from '@/types/navigation';

const cardDelay = (i: number) => Math.min(i * 35, 260);

type SeriesDetailRouteProp = RouteProp<MainDrawerParamList, 'SeriesDetail'>;

export default function SeriesDetailScreen() {
  const { t } = useTranslation();
  const route = useRoute<SeriesDetailRouteProp>();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const enterKey = useScreenEnter();
  const isChildSession = useAuthStore((state) => state.sessionMode === 'child');

  const seriesId = route.params?.seriesId;

  const { data: storiesData, isLoading, error } = useSeriesStories(seriesId);
  const stories = useMemo(() => storiesData?.stories ?? [], [storiesData?.stories]);
  const lastStory = stories.length > 0 ? stories[stories.length - 1] : null;
  const { data: seriesInfo } = useSeriesInfo(lastStory?.id ?? '');
  const { data: scheduleData } = useScheduleStatus(lastStory?.id ?? '', { enabled: !isChildSession });
  const { data: voicesData } = useVoices('uk', { enabled: !isChildSession });
  const userPlan = voicesData?.meta?.userPlan || 'free';

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['stories', 100, 0, undefined, undefined, seriesId] });
    }, [queryClient, seriesId])
  );

  const numColumns = useMemo(() => (width < 1024 ? 2 : 4), [width]);
  const gridCardWidth = useMemo(() => {
    const paddingHorizontal = theme.spacing[4] * 2;
    const gap = theme.spacing[4];
    return (width - paddingHorizontal - gap * (numColumns - 1)) / numColumns;
  }, [width, numColumns]);

  const hasSchedule =
    scheduleData &&
    typeof scheduleData === 'object' &&
    'cadence' in scheduleData &&
    'nextRunAt' in scheduleData;
  const inProgress =
    scheduleData &&
    typeof scheduleData === 'object' &&
    'inProgress' in scheduleData &&
    (scheduleData as { inProgress?: boolean }).inProgress;
  const showPendingCard = !isChildSession && (inProgress || hasSchedule);
  const nextPartNumber = (seriesInfo?.totalParts ?? 0) + 1;

  const handleStoryPress = useCallback(
    (storyId: string) => {
      prefetchStory(queryClient, storyId);
      navigateToStory(storyId);
    },
    [queryClient]
  );

  const baseTitle = seriesInfo?.baseTitle ?? lastStory?.title ?? t('series.detail_title');

  useLayoutEffect(() => {
    navigation.setOptions({
      title: baseTitle,
      headerRight: isChildSession
        ? () => null
        : () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [navigation, baseTitle, isChildSession]);

  if (!seriesId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('common.error')}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('common.error')}</Text>
        <Text style={styles.errorMessage}>{(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View
          style={[
            styles.gridContainer,
            Platform.OS === 'web' && { gridTemplateColumns: `repeat(${numColumns}, 1fr)` } as any,
          ]}
        >
          {stories.map((story, index) => {
            const partNumber = (story as { partNumber?: number }).partNumber;
            const displayTitle =
              partNumber != null
                ? `${t('series.part_number', { number: partNumber })}: ${story.title}`
                : story.title;
            const displayStory = { ...story, title: displayTitle };
            const card = (
              <StoryCard
                story={displayStory}
                onPress={handleStoryPress}
                variant="grid"
              />
            );
            return Platform.OS === 'web' ? (
              <AnimatedSection key={story.id} delay={cardDelay(index)} trigger={enterKey}>
                {card}
              </AnimatedSection>
            ) : (
              <AnimatedSection
                key={story.id}
                delay={cardDelay(index)}
                trigger={enterKey}
                style={{ width: gridCardWidth }}
              >
                {card}
              </AnimatedSection>
            );
          })}
          {showPendingCard &&
            (Platform.OS === 'web' ? (
              <AnimatedSection key="pending" delay={cardDelay(stories.length)} trigger={enterKey}>
                <PendingPartCard partNumber={nextPartNumber} />
              </AnimatedSection>
            ) : (
              <AnimatedSection
                key="pending"
                delay={cardDelay(stories.length)}
                trigger={enterKey}
                style={{ width: gridCardWidth }}
              >
                <PendingPartCard partNumber={nextPartNumber} />
              </AnimatedSection>
            ))}
          {!isChildSession && !showPendingCard && lastStory && (
            Platform.OS === 'web' ? (
              <AnimatedSection key="continue" delay={cardDelay(stories.length)} trigger={enterKey}>
                <ContinueSeriesSection
                  storyId={lastStory.id}
                  seriesInfo={
                    seriesInfo
                      ? { totalParts: seriesInfo.totalParts, baseTitle: seriesInfo.baseTitle }
                      : undefined
                  }
                  userPlan={userPlan}
                  onNavigateToPlans={() => navigation.navigate('Plans' as never)}
                  variant="card"
                />
              </AnimatedSection>
            ) : (
              <AnimatedSection
                key="continue"
                delay={cardDelay(stories.length)}
                trigger={enterKey}
                style={{ width: gridCardWidth }}
              >
                <ContinueSeriesSection
                  storyId={lastStory.id}
                  seriesInfo={
                    seriesInfo
                      ? { totalParts: seriesInfo.totalParts, baseTitle: seriesInfo.baseTitle }
                      : undefined
                  }
                  userPlan={userPlan}
                  onNavigateToPlans={() => navigation.navigate('Plans' as never)}
                  variant="card"
                />
              </AnimatedSection>
            )
          )}
        </View>
      </ScrollView>
      {!isChildSession && (
        <FeedbackModal
          visible={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          initialReportedScreen="other"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  scrollContent: {
    padding: theme.spacing[4],
  },
  gridContainer: Platform.select({
    web: {
      display: 'grid' as any,
      gap: theme.spacing[4],
    },
    default: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: theme.spacing[4],
    },
  }),
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.status.error,
    marginBottom: theme.spacing[2],
  },
  errorMessage: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
});
