import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { usePublishedStories } from '@/api/stories';
import { useStoryThemes } from '@/api/dictionaries';
import { APP_CONFIG } from '@/config/constants';
import { theme } from '@/theme';
import { LibraryHeader } from '@/components/LibraryHeader';
import { PublishedStoryCard } from '@/components/PublishedStoryCard';
import { AudioFilterToggleRef } from '@/components/AudioFilterToggle';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { storage } from '@/utils/storage';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';

const ITEMS_PER_PAGE = 24;
const cardDelay = (i: number) => Math.min(i * 35, 260);
const READING_TIME_OPTIONS = [
  { value: null, min: undefined, max: undefined },
  { value: 'short', min: undefined, max: 5 },
  { value: 'medium', min: 6, max: 10 },
  { value: 'long', min: 11, max: undefined },
] as const;

function getAgeGroupTranslationKey(slug: string): string {
  return `story.age_${slug.replace(/-/g, '_')}`;
}

export default function PublishedStoriesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { width } = useWindowDimensions();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [audioFilter, setAudioFilter] = useState(false);
  const [scenarioFilter, setScenarioFilter] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<string | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [readingTimeFilter, setReadingTimeFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const audioToggleRef = useRef<AudioFilterToggleRef>(null);
  const enterKey = useScreenEnter();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [navigation]);

  const { data: themesData } = useStoryThemes();
  const scenarioCards = useMemo(() => themesData?.scenarioCards || [], [themesData?.scenarioCards]);
  const ageGroups = useMemo(() => themesData?.ageGroups || [], [themesData?.ageGroups]);

  useEffect(() => {
    storage.getLibraryViewMode().then((mode) => {
      if (mode) setViewMode(mode);
    });
    storage.getAudioFilter().then((filter) => {
      if (filter !== null) setAudioFilter(filter);
    });
  }, []);

  const toggleViewMode = useCallback(async () => {
    setViewMode((prev) => {
      const newValue = prev === 'grid' ? 'list' : 'grid';
      storage.setLibraryViewMode(newValue);
      return newValue;
    });
  }, []);

  const handleAudioFilterToggle = useCallback((newValue: boolean) => {
    setAudioFilter(newValue);
    setCurrentPage(1);
    storage.setAudioFilter(newValue);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleScenarioFilterChange = useCallback((cardId: string | null) => {
    setScenarioFilter(cardId);
    setCurrentPage(1);
  }, []);

  const handleAgeFilterChange = useCallback((ageGroup: string | null) => {
    setAgeFilter(ageGroup);
    setCurrentPage(1);
  }, []);

  const handleLanguageFilterChange = useCallback((language: string | null) => {
    setLanguageFilter(language);
    setCurrentPage(1);
  }, []);

  const handleReadingTimeFilterChange = useCallback((value: string | null) => {
    setReadingTimeFilter(value);
    setCurrentPage(1);
  }, []);

  const offset = useMemo(() => (currentPage - 1) * ITEMS_PER_PAGE, [currentPage]);
  const selectedReadingRange = useMemo(
    () =>
      READING_TIME_OPTIONS.find((option) => option.value === readingTimeFilter) ??
      READING_TIME_OPTIONS[0],
    [readingTimeFilter]
  );
  const ageOptions = useMemo(
    () => [
      { value: null, label: t('library.all_ages') },
      ...ageGroups.map((ageGroup) => ({
        value: ageGroup.slug,
        label: t(getAgeGroupTranslationKey(ageGroup.slug), { defaultValue: ageGroup.slug }),
      })),
    ],
    [ageGroups, t]
  );
  const readingTimeOptions = useMemo(
    () => [
      { value: null, label: t('library.all_reading_times') },
      { value: 'short', label: t('library.reading_time_up_to_5') },
      { value: 'medium', label: t('library.reading_time_6_10') },
      { value: 'long', label: t('library.reading_time_11_plus') },
    ],
    [t]
  );
  const languageOptions = useMemo(
    () => [
      { value: null, label: t('library.all_languages') },
      ...APP_CONFIG.supportedLanguages.map((language) => ({
        value: language,
        label: t(`language_names.${language}`, { defaultValue: language.toUpperCase() }),
      })),
    ],
    [t]
  );

  const { data, isLoading, error } = usePublishedStories({
    limit: ITEMS_PER_PAGE,
    offset,
    hasAudio: audioFilter,
    scenarioCardId: scenarioFilter,
    language: languageFilter,
    ageGroup: ageFilter,
    readingTimeMin: selectedReadingRange.min,
    readingTimeMax: selectedReadingRange.max,
  });

  const stories = data?.stories ?? [];
  const totalStories = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalStories / ITEMS_PER_PAGE));

  const numColumns = useMemo(() => (width < 640 ? 1 : width < 1024 ? 2 : 4), [width]);
  const gridCardWidth = useMemo(() => {
    const paddingHorizontal = theme.spacing[4] * 2;
    const gap = theme.spacing[4];
    return (width - paddingHorizontal - gap * (numColumns - 1)) / numColumns;
  }, [width, numColumns]);

  const handlePress = useCallback(
    (slug: string) => {
      navigation.navigate('PublishedStory', { slug });
    },
    [navigation]
  );

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
      <LibraryHeader
        viewMode={viewMode}
        currentPage={currentPage}
        totalPages={totalPages}
        initialAudioFilter={audioFilter}
        audioToggleRef={audioToggleRef}
        onToggleViewMode={toggleViewMode}
        onToggleAudioFilter={handleAudioFilterToggle}
        onPageChange={handlePageChange}
        t={t}
        scenarioCards={scenarioCards.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
        selectedScenarioId={scenarioFilter}
        onScenarioChange={handleScenarioFilterChange}
        ageOptions={ageOptions}
        selectedAgeGroup={ageFilter}
        onAgeGroupChange={handleAgeFilterChange}
        languageOptions={languageOptions}
        selectedLanguage={languageFilter}
        onLanguageChange={handleLanguageFilterChange}
        readingTimeOptions={readingTimeOptions}
        selectedReadingTime={readingTimeFilter}
        onReadingTimeChange={handleReadingTimeFilterChange}
      />

      {!stories.length ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyTitle}>{t('library.empty')}</Text>
          <Text style={styles.emptyMessage}>{t('library.create_first')}</Text>
        </View>
      ) : viewMode === 'grid' ? (
        <ScrollView contentContainerStyle={styles.grid}>
          <View
            style={[
              styles.gridContainer,
              Platform.OS === 'web' &&
                ({ gridTemplateColumns: `repeat(${numColumns}, 1fr)` } as any),
            ]}
          >
            {stories.map((story, index) =>
              Platform.OS === 'web' ? (
                <AnimatedSection key={story.id} delay={cardDelay(index)} trigger={enterKey}>
                  <PublishedStoryCard story={story} onPress={handlePress} variant="grid" />
                </AnimatedSection>
              ) : (
                <AnimatedSection
                  key={story.id}
                  delay={cardDelay(index)}
                  trigger={enterKey}
                  style={{ width: gridCardWidth }}
                >
                  <PublishedStoryCard story={story} onPress={handlePress} variant="grid" />
                </AnimatedSection>
              )
            )}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <AnimatedSection delay={cardDelay(index)} trigger={enterKey}>
              <PublishedStoryCard story={item} onPress={handlePress} variant="list" />
            </AnimatedSection>
          )}
        />
      )}
      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="other"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
    backgroundColor: theme.colors.background.primary,
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
  emptyIcon: {
    fontSize: 48,
    marginBottom: theme.spacing[4],
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  emptyMessage: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
  listContent: {
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[8],
  },
  grid: {
    padding: theme.spacing[6],
  },
  gridContainer: Platform.select({
    web: {
      display: 'grid' as any,
      gap: theme.spacing[6],
    },
    default: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: theme.spacing[6],
    },
  }),
});
