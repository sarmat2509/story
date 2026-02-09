import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useStories, useDeleteStory } from '@/api/stories';
import { theme } from '@/theme';
import { StoryCard } from '@/components/StoryCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LibraryHeader } from '@/components/LibraryHeader';
import { AudioFilterToggleRef } from '@/components/AudioFilterToggle';
import { storage } from '@/utils/storage';
import type { MainDrawerParamList } from '@/types/navigation';

const ITEMS_PER_PAGE = 24;

export default function LibraryScreen() {
  console.log('[LibraryScreen] RENDER START');
  
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { width } = useWindowDimensions();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [audioFilter, setAudioFilter] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<{ id: string; title: string } | null>(null);
  
  // Ref to AudioFilterToggle for imperative control
  const audioToggleRef = useRef<AudioFilterToggleRef>(null);
  
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
  
  // Fetch stories with pagination
  const { data, isLoading, error } = useStories({
    limit: ITEMS_PER_PAGE,
    offset,
    hasAudio: audioFilter,
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
  
  // Responsive columns (grid mode only): 2 on mobile, 3 on tablet, 4 on desktop
  const numColumns = useMemo(() => width < 768 ? 2 : width < 1024 ? 3 : 4, [width]);
  
  // Memoized render functions for FlatList items
  const handleStoryPress = useCallback((storyId: string) => {
    navigation.navigate('Story', { storyId });
  }, [navigation]);
  
  const renderGridItem = useCallback(({ item }: { item: any }) => {
    console.log('[LibraryScreen] renderGridItem called for:', item.id);
    return (
      <View style={{ width: `${100 / numColumns - 2}%`, marginBottom: theme.spacing[3] }}>
        <StoryCard 
          story={item}
          onPress={handleStoryPress}
          onDelete={handleDelete}
          variant="grid"
        />
      </View>
    );
  }, [numColumns, handleStoryPress, handleDelete]);
  
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
        />
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No stories yet</Text>
          <Text style={styles.emptySubtext}>Create your first story!</Text>
        </View>
      </View>
    );
  }

  // Grid view with numColumns
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
        />
      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={`grid-${numColumns}`}
        renderItem={renderGridItem}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.columnWrapper}
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
  list: {
    padding: theme.spacing[4],
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: theme.spacing[3],
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
