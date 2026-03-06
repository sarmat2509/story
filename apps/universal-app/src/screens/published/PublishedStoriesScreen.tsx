import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { theme } from '@/theme';
import { LibraryHeader } from '@/components/LibraryHeader';
import { PublishedStoryCard } from '@/components/PublishedStoryCard';
import { AudioFilterToggleRef } from '@/components/AudioFilterToggle';
import { storage } from '@/utils/storage';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';

const ITEMS_PER_PAGE = 24;

export default function PublishedStoriesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { width } = useWindowDimensions();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [audioFilter, setAudioFilter] = useState(false);
  const [scenarioFilter, setScenarioFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const audioToggleRef = useRef<AudioFilterToggleRef>(null);

  const { data: themesData } = useStoryThemes();
  const scenarioCards = useMemo(() => themesData?.scenarioCards || [], [themesData?.scenarioCards]);

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

  const offset = useMemo(() => (currentPage - 1) * ITEMS_PER_PAGE, [currentPage]);

  const { data, isLoading, error } = usePublishedStories({
    limit: ITEMS_PER_PAGE,
    offset,
    hasAudio: audioFilter,
    scenarioCardId: scenarioFilter,
  });

  const stories = data?.stories ?? [];
  const totalStories = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalStories / ITEMS_PER_PAGE));

  const numColumns = useMemo(() => (width < 1024 ? 2 : 4), [width]);
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
              Platform.OS === 'web' && { gridTemplateColumns: `repeat(${numColumns}, 1fr)` } as any,
            ]}
          >
            {stories.map((story) =>
              Platform.OS === 'web' ? (
                <PublishedStoryCard
                  key={story.id}
                  story={story}
                  onPress={handlePress}
                  variant="grid"
                />
              ) : (
                <View key={story.id} style={{ width: gridCardWidth }}>
                  <PublishedStoryCard
                    story={story}
                    onPress={handlePress}
                    variant="grid"
                  />
                </View>
              )
            )}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <PublishedStoryCard story={item} onPress={handlePress} variant="list" />
          )}
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
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  grid: {
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
});
