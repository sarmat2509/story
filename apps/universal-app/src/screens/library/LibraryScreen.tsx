import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, useWindowDimensions, ActivityIndicator, Platform } from 'react-native';
import { useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useStories, useDeleteStory, prefetchStory } from '@/api/stories';
import { useStoryThemes } from '@/api/dictionaries';
import { navigateToStory } from '@/navigation/navigationRef';
import { theme } from '@/theme';
import { StoryCard } from '@/components/StoryCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LibraryHeader } from '@/components/LibraryHeader';
import { FeedbackModal } from '@/components/FeedbackModal';
import { AudioFilterToggleRef } from '@/components/AudioFilterToggle';
import { storage } from '@/utils/storage';
import type { MainDrawerParamList } from '@/types/navigation';

const ITEMS_PER_PAGE = 24;

export default function LibraryScreen() {
  console.log('[LibraryScreen] RENDER START');
  
  const { t } = useTranslation();
  const route = useRoute<RouteProp<MainDrawerParamList, 'Library'>>();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [audioFilter, setAudioFilter] = useState(false);
  const [scenarioFilter, setScenarioFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<{ id: string; title: string } | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  
  // Ref to AudioFilterToggle for imperative control
  const audioToggleRef = useRef<AudioFilterToggleRef>(null);
  
  const { data: themesData } = useStoryThemes();
  const scenarioCards = useMemo(() => themesData?.scenarioCards || [], [themesData?.scenarioCards]);
  
  // Invalidate stories cache when screen gains focus (e.g. after creating a story)
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
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
  
  console.log('[LibraryScreen] State:', { viewMode, audioFilter, currentPage });
  
  // Load view mode and audio filter from storage
  useEffect(() => {
    storage.getLibraryViewMode().then(mode => {
      if (mode) setViewMode(mode);
    });
    storage.getAudioFilter().then(filter => {
      if (filter !== null) {
        console.log('[LibraryScreen] Loaded audioFilter from storage:', filter);
        setAudioFilter(filter);
      }
    });
  }, []);
  
  // Save view mode to storage
  const toggleViewMode = useCallback(async () => {
    setViewMode(prev => {
      const newValue = prev === 'grid' ? 'list' : 'grid';
      storage.setLibraryViewMode(newValue);
      return newValue;
    });
  }, []); // Stable - never recreated

  // Handle audio filter toggle from child
  const handleAudioFilterToggle = useCallback((newValue: boolean) => {
    console.log('[LibraryScreen] handleAudioFilterToggle called with:', newValue);
    console.log('[LibraryScreen] handleAudioFilterToggle - updating state');
    setAudioFilter(newValue);
    setCurrentPage(1);
    storage.setAudioFilter(newValue);
    console.log('[LibraryScreen] handleAudioFilterToggle - DONE');
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

  // Fetch stories with pagination
  const { data, isLoading, error } = useStories({
    limit: ITEMS_PER_PAGE,
    offset,
    hasAudio: audioFilter,
    scenarioCardId: scenarioFilter,
  });
  
  console.log('[LibraryScreen] useStories result:', { 
    storiesCount: data?.stories?.length, 
    isLoading, 
    hasError: !!error 
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
  
  // Grid columns: 2 on mobile/tablet (portrait and landscape), 4 on desktop
  const numColumns = useMemo(() => (width < 1024 ? 2 : 4), [width]);
  const gridCardWidth = useMemo(() => {
    const paddingHorizontal = theme.spacing[4] * 2;
    const gap = theme.spacing[4];
    return (width - paddingHorizontal - gap * (numColumns - 1)) / numColumns;
  }, [width, numColumns]);
  
  // Memoized render functions for FlatList items
  const handleStoryPress = useCallback((storyId: string) => {
    // Prefetch story data before navigation (non-blocking)
    prefetchStory(queryClient, storyId);
    // Navigate immediately (don't wait for prefetch)
    navigateToStory(storyId);
  }, [queryClient]);
  
  const renderListItem = useCallback(({ item }: { item: any }) => {
    console.log('[LibraryScreen] renderListItem called for:', item.id);
    return (
      <StoryCard 
        story={item}
        onPress={handleStoryPress}
        onDelete={handleDelete}
        variant="list"
      />
    );
  }, [handleStoryPress, handleDelete]);
  
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>Loading stories...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Failed to load stories</Text>
        <Text style={styles.errorMessage}>{(error as Error).message}</Text>
      </View>
    );
  }

  if (!stories || stories.length === 0) {
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
          scenarioCards={scenarioCards}
          selectedScenarioId={scenarioFilter}
          onScenarioChange={handleScenarioFilterChange}
          onReportProblem={() => setShowFeedbackModal(true)}
        />
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No stories yet</Text>
          <Text style={styles.emptySubtext}>Create your first story!</Text>
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
          scenarioCards={scenarioCards}
          selectedScenarioId={scenarioFilter}
          onScenarioChange={handleScenarioFilterChange}
          onReportProblem={() => setShowFeedbackModal(true)}
        />
        <ScrollView contentContainerStyle={styles.grid}>
          <View
            style={[
              styles.gridContainer,
              Platform.OS === 'web' && { gridTemplateColumns: `repeat(${numColumns}, 1fr)` } as any,
            ]}
          >
            {stories.map((story) =>
              Platform.OS === 'web' ? (
                <StoryCard
                  key={story.id}
                  story={story}
                  onPress={handleStoryPress}
                  onDelete={handleDelete}
                  variant="grid"
                />
              ) : (
                <View key={story.id} style={{ width: gridCardWidth }}>
                  <StoryCard
                    story={story}
                    onPress={handleStoryPress}
                    onDelete={handleDelete}
                    variant="grid"
                  />
                </View>
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
        scenarioCards={scenarioCards}
        selectedScenarioId={scenarioFilter}
        onScenarioChange={handleScenarioFilterChange}
        onReportProblem={() => setShowFeedbackModal(true)}
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
    backgroundColor: theme.colors.background.primary,
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
  list: {
    padding: theme.spacing[4],
  },
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
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginTop: theme.spacing[2],
  },
});
