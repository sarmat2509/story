import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
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
import { useRoute, useFocusEffect, RouteProp, useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useStories, useDeleteStory, prefetchStory, useUserStoryLanguages } from '@/api/stories';
import { useStoryThemes } from '@/api/dictionaries';
import { navigateToStory } from '@/navigation/navigationRef';
import { theme } from '@/theme';
import { modernColors } from '@/theme/modernTheme';
import { StoryCard } from '@/components/StoryCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LibraryHeader } from '@/components/LibraryHeader';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { AudioFilterToggleRef } from '@/components/AudioFilterToggle';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { storage } from '@/utils/storage';
import {
  calculateGridCardWidth,
  getStoryGridColumnCount,
  STORY_GRID_GAP,
} from '@/utils/responsiveGridLayout';
import type { MainDrawerParamList } from '@/types/navigation';
import { SUPPORTED_LANGUAGES, isValidLocale } from '@wondertales/shared';

function formatLibraryLanguageLabel(code: string): string {
  if (isValidLocale(code)) {
    const lang = SUPPORTED_LANGUAGES[code];
    return `${lang.flag} ${lang.nativeName}`;
  }
  return code;
}

// Cap per-item stagger so large pages don't take forever to finish animating.
const cardDelay = (i: number) => Math.min(i * 35, 260);

const ITEMS_PER_PAGE = 24;

export default function LibraryScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const route = useRoute<RouteProp<MainDrawerParamList, 'Library'>>();
  const queryClient = useQueryClient();
  const enterKey = useScreenEnter();
  const { width } = useWindowDimensions();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [audioFilter, setAudioFilter] = useState(false);
  const [scenarioFilter, setScenarioFilter] = useState<string | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<{ id: string; title: string } | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [navigation]);

  // Ref to AudioFilterToggle for imperative control
  const audioToggleRef = useRef<AudioFilterToggleRef>(null);

  const { data: themesData } = useStoryThemes();
  const scenarioCards = useMemo(() => themesData?.scenarioCards || [], [themesData?.scenarioCards]);
  const { data: languageCodes = [] } = useUserStoryLanguages();

  const languageOptions = useMemo(() => {
    if (languageCodes.length === 0) return [];
    return [
      { value: null as string | null, label: t('library.all_languages') },
      ...languageCodes.map((code) => ({
        value: code,
        label: formatLibraryLanguageLabel(code),
      })),
    ];
  }, [languageCodes, t]);

  useEffect(() => {
    if (languageFilter && languageCodes.length > 0 && !languageCodes.includes(languageFilter)) {
      setLanguageFilter(null);
      setCurrentPage(1);
    }
  }, [languageFilter, languageCodes]);

  // Invalidate stories cache when screen gains focus (e.g. after creating a story)
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      queryClient.invalidateQueries({ queryKey: ['user-story-languages'] });
    }, [queryClient])
  );

  // Apply scenario filter from route params (breadcrumb navigation)
  useEffect(() => {
    const paramScenarioId = route.params?.scenarioCardId;
    if (paramScenarioId) {
      setScenarioFilter(paramScenarioId);
      setCurrentPage(1);
    }
  }, [route.params?.scenarioCardId]);

  // Load view mode and audio filter from storage
  useEffect(() => {
    storage.getLibraryViewMode().then((mode) => {
      if (mode) setViewMode(mode);
    });
    storage.getAudioFilter().then((filter) => {
      if (filter !== null) {
        setAudioFilter(filter);
      }
    });
  }, []);

  // Save view mode to storage
  const toggleViewMode = useCallback(async () => {
    setViewMode((prev) => {
      const newValue = prev === 'grid' ? 'list' : 'grid';
      storage.setLibraryViewMode(newValue);
      return newValue;
    });
  }, []); // Stable - never recreated

  // Handle audio filter toggle from child
  const handleAudioFilterToggle = useCallback((newValue: boolean) => {
    setAudioFilter(newValue);
    setCurrentPage(1);
    storage.setAudioFilter(newValue);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Calculate offset
  const offset = useMemo(() => (currentPage - 1) * ITEMS_PER_PAGE, [currentPage]);

  // Handle scenario filter change
  const handleScenarioFilterChange = useCallback((cardId: string | null) => {
    setScenarioFilter(cardId);
    setCurrentPage(1);
  }, []);

  const handleLanguageFilterChange = useCallback((language: string | null) => {
    setLanguageFilter(language);
    setCurrentPage(1);
  }, []);

  // Fetch stories with pagination
  const { data, isLoading, error } = useStories({
    limit: ITEMS_PER_PAGE,
    offset,
    hasAudio: audioFilter,
    scenarioCardId: scenarioFilter,
    language: languageFilter,
  });

  const stories = useMemo(() => data?.stories || [], [data?.stories]);
  const totalStories = useMemo(() => data?.pagination?.total || 0, [data?.pagination?.total]);
  const totalPages = useMemo(() => Math.ceil(totalStories / ITEMS_PER_PAGE), [totalStories]);

  // Delete story mutation
  const deleteStory = useDeleteStory();

  // Handle delete with confirmation
  const handleDelete = useCallback((storyId: string, storyTitle: string) => {
    setStoryToDelete({ id: storyId, title: storyTitle });
    setDeleteDialogVisible(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (storyToDelete) {
      deleteStory.mutate(storyToDelete.id);
      setDeleteDialogVisible(false);
      setStoryToDelete(null);
    }
  }, [storyToDelete, deleteStory]);

  const cancelDelete = useCallback(() => {
    setDeleteDialogVisible(false);
    setStoryToDelete(null);
  }, []);

  // Keep story covers readable around landscape-tablet widths.
  const numColumns = useMemo(() => getStoryGridColumnCount(width), [width]);
  const gridCardWidth = useMemo(() => {
    const measuredWidth = gridWidth || width - theme.spacing[6] * 2;
    return calculateGridCardWidth(measuredWidth, numColumns, STORY_GRID_GAP);
  }, [gridWidth, width, numColumns]);

  // Memoized render functions for FlatList items
  const handleStoryPress = useCallback(
    (storyId: string) => {
      // Prefetch story data before navigation (non-blocking)
      prefetchStory(queryClient, storyId);
      // Navigate immediately (don't wait for prefetch)
      navigateToStory(storyId);
    },
    [queryClient]
  );

  const renderListItem = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      return (
        <AnimatedSection delay={cardDelay(index)} trigger={enterKey}>
          <StoryCard
            story={item}
            onPress={handleStoryPress}
            onDelete={handleDelete}
            variant="list"
          />
        </AnimatedSection>
      );
    },
    [handleStoryPress, handleDelete, enterKey]
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('library.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('library.error_title')}</Text>
        <Text style={styles.errorMessage}>{(error as Error).message}</Text>
      </View>
    );
  }

  if (!stories || stories.length === 0) {
    return (
      <View style={styles.container} testID="library-screen">
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
          scenarioCards={scenarioCards}
          selectedScenarioId={scenarioFilter}
          onScenarioChange={handleScenarioFilterChange}
          languageOptions={languageOptions}
          selectedLanguage={languageFilter}
          onLanguageChange={handleLanguageFilterChange}
        />
        <View style={styles.centerContainer}>
          <Ionicons
            name="library-outline"
            size={48}
            color={theme.colors.text.tertiary}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyText}>{t('library.empty')}</Text>
          <Text style={styles.emptySubtext}>{t('library.create_first')}</Text>
        </View>

        <FeedbackModal
          visible={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          initialReportedScreen="library"
        />
      </View>
    );
  }

  // Grid view with CSS Grid (web) or FlatList (native)
  if (viewMode === 'grid') {
    return (
      <View style={styles.container} testID="library-screen">
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
          scenarioCards={scenarioCards}
          selectedScenarioId={scenarioFilter}
          onScenarioChange={handleScenarioFilterChange}
          languageOptions={languageOptions}
          selectedLanguage={languageFilter}
          onLanguageChange={handleLanguageFilterChange}
        />
        <ScrollView contentContainerStyle={styles.grid}>
          <View
            onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
            style={[
              styles.gridContainer,
              Platform.OS === 'web' &&
                ({ gridTemplateColumns: `repeat(${numColumns}, 1fr)` } as any),
            ]}
          >
            {stories.map((story, index) =>
              Platform.OS === 'web' ? (
                <AnimatedSection key={story.id} delay={cardDelay(index)} trigger={enterKey}>
                  <StoryCard
                    story={story}
                    onPress={handleStoryPress}
                    onDelete={handleDelete}
                    variant="grid"
                  />
                </AnimatedSection>
              ) : (
                <AnimatedSection
                  key={story.id}
                  delay={cardDelay(index)}
                  trigger={enterKey}
                  style={{ width: gridCardWidth }}
                >
                  <StoryCard
                    story={story}
                    onPress={handleStoryPress}
                    onDelete={handleDelete}
                    variant="grid"
                  />
                </AnimatedSection>
              )
            )}
          </View>
        </ScrollView>

        {/* Confirm Delete Dialog */}
        <ConfirmDialog
          visible={deleteDialogVisible}
          title={t('library.delete_confirm_title')}
          message={t('library.delete_confirm_message', { title: storyToDelete?.title || '' })}
          confirmText={t('library.delete')}
          cancelText={t('common.cancel')}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
          variant="danger"
        />

        <FeedbackModal
          visible={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          initialReportedScreen="library"
        />
      </View>
    );
  }

  // List view without numColumns
  return (
    <View style={styles.container} testID="library-screen">
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
        scenarioCards={scenarioCards}
        selectedScenarioId={scenarioFilter}
        onScenarioChange={handleScenarioFilterChange}
        languageOptions={languageOptions}
        selectedLanguage={languageFilter}
        onLanguageChange={handleLanguageFilterChange}
      />
      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        renderItem={renderListItem}
        contentContainerStyle={styles.list}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        initialNumToRender={12}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        visible={deleteDialogVisible}
        title={t('library.delete_confirm_title')}
        message={t('library.delete_confirm_message', { title: storyToDelete?.title || '' })}
        confirmText={t('library.delete')}
        cancelText={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        variant="danger"
      />

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="library"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: modernColors.page,
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
  list: {
    padding: theme.spacing[6],
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
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
    marginBottom: theme.spacing[3],
    opacity: 0.7,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginTop: theme.spacing[2],
  },
});
