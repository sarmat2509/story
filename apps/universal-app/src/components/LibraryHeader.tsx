import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioFilterToggle, AudioFilterToggleRef } from './AudioFilterToggle';
import { theme } from '@/theme';

interface Props {
  viewMode: 'grid' | 'list';
  currentPage: number;
  totalPages: number;
  initialAudioFilter: boolean; // For AudioFilterToggle initial state only
  audioToggleRef: React.RefObject<AudioFilterToggleRef>; // Ref passed from parent
  onToggleViewMode: () => void;
  onToggleAudioFilter: (newValue: boolean) => void;
  onPageChange: (page: number) => void;
  t: (key: string) => string;
}

const LibraryHeaderComponent = ({ 
  viewMode, 
  currentPage, 
  totalPages,
  initialAudioFilter,
  audioToggleRef,
  onToggleViewMode,
  onToggleAudioFilter,
  onPageChange,
  t
}: Props) => {
  console.log('[LibraryHeader] RENDER', {
    viewMode,
    currentPage,
    totalPages,
    initialAudioFilter,
  });
  
  // Use ref to store labels - updates on language change but doesn't cause re-creation
  const labelsRef = useRef({
    allStories: t('library.all_stories'),
    audioOnly: t('library.audio_only'),
  });
  
  // Update labels when translation changes
  useEffect(() => {
    labelsRef.current = {
      allStories: t('library.all_stories'),
      audioOnly: t('library.audio_only'),
    };
  }, [t]);
  
  // Memoize AudioFilterToggle element - only recreate if ref or callback changes
  // Note: initialAudioFilter intentionally NOT in deps - only used for initial mount
  const audioFilterElement = useMemo(() => {
    console.log('[LibraryHeader] Creating AudioFilterToggle element');
    return (
      <AudioFilterToggle
        ref={audioToggleRef}
        initialValue={initialAudioFilter}
        onToggle={onToggleAudioFilter}
        allStoriesLabel={labelsRef.current.allStories}
        audioOnlyLabel={labelsRef.current.audioOnly}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioToggleRef, onToggleAudioFilter]);
  
  return (
    <View style={styles.header}>
      <View style={styles.leftControls}>
        <TouchableOpacity 
          style={styles.viewToggle} 
          onPress={onToggleViewMode}
          accessibilityLabel={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
        >
          <Ionicons 
            name={viewMode === 'grid' ? 'list' : 'grid'} 
            size={24} 
            color={theme.colors.text.primary} 
          />
        </TouchableOpacity>
        
        {audioFilterElement}
      </View>
      
      {totalPages > 1 && (
        <View style={styles.paginationInHeader}>
          <TouchableOpacity
            style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
            onPress={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            <Ionicons 
              name="chevron-back" 
              size={20} 
              color={currentPage === 1 ? theme.colors.text.disabled : theme.colors.interactive.primary} 
            />
          </TouchableOpacity>
          
          <Text style={styles.paginationText}>
            {t('library.page')} {currentPage} {t('library.of')} {totalPages}
          </Text>
          
          <TouchableOpacity
            style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]}
            onPress={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            <Ionicons 
              name="chevron-forward" 
              size={20} 
              color={currentPage === totalPages ? theme.colors.text.disabled : theme.colors.interactive.primary} 
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// Custom comparison: ignore initialAudioFilter changes (used only for initial mount)
const areEqual = (prevProps: Props, nextProps: Props) => {
  console.log('[LibraryHeader] areEqual check', {
    viewModeChanged: prevProps.viewMode !== nextProps.viewMode,
    currentPageChanged: prevProps.currentPage !== nextProps.currentPage,
    totalPagesChanged: prevProps.totalPages !== nextProps.totalPages,
    initialAudioFilterChanged: prevProps.initialAudioFilter !== nextProps.initialAudioFilter,
  });
  
  return (
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.currentPage === nextProps.currentPage &&
    prevProps.totalPages === nextProps.totalPages &&
    prevProps.onToggleViewMode === nextProps.onToggleViewMode &&
    prevProps.onToggleAudioFilter === nextProps.onToggleAudioFilter &&
    prevProps.onPageChange === nextProps.onPageChange &&
    prevProps.t === nextProps.t &&
    prevProps.audioToggleRef === nextProps.audioToggleRef
    // Intentionally skip initialAudioFilter - it's only for initial useState
  );
};

export const LibraryHeader = React.memo(LibraryHeaderComponent, areEqual);

LibraryHeader.displayName = 'LibraryHeader';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
  },
  leftControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  viewToggle: {
    padding: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  paginationInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  paginationButton: {
    padding: theme.spacing[2],
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
  },
});
