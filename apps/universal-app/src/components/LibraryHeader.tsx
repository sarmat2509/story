import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioFilterToggle, AudioFilterToggleRef } from './AudioFilterToggle';
import { theme } from '@/theme';

interface ScenarioCard {
  id: string;
  name: string;
  icon?: string;
}

interface Props {
  viewMode: 'grid' | 'list';
  currentPage: number;
  totalPages: number;
  initialAudioFilter: boolean;
  audioToggleRef: React.RefObject<AudioFilterToggleRef | null>;
  onToggleViewMode: () => void;
  onToggleAudioFilter: (newValue: boolean) => void;
  onPageChange: (page: number) => void;
  t: (key: string) => string;
  scenarioCards?: ScenarioCard[];
  selectedScenarioId?: string | null;
  onScenarioChange?: (id: string | null) => void;
  onReportProblem?: () => void;
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
  t,
  scenarioCards = [],
  selectedScenarioId,
  onScenarioChange,
  onReportProblem,
}: Props) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
        {audioFilterElement}
        
        {scenarioCards.length > 0 && onScenarioChange && (
          <View style={styles.scenarioWrapper}>
            <TouchableOpacity
              style={styles.scenarioButton}
              onPress={() => setDropdownOpen(prev => !prev)}
            >
              <Text style={styles.scenarioButtonText} numberOfLines={1}>
                {selectedScenarioId
                  ? scenarioCards.find(c => c.id === selectedScenarioId)?.name || t('library.all_scenarios')
                  : t('library.all_scenarios')}
              </Text>
              <Ionicons
                name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={theme.colors.text.tertiary}
              />
            </TouchableOpacity>
            {dropdownOpen && (
              <View style={styles.scenarioMenu}>
                <TouchableOpacity
                  style={[styles.scenarioItem, !selectedScenarioId && styles.scenarioItemActive]}
                  onPress={() => { onScenarioChange(null); setDropdownOpen(false); }}
                >
                  <Text style={[styles.scenarioItemText, !selectedScenarioId && styles.scenarioItemTextActive]}>
                    {t('library.all_scenarios')}
                  </Text>
                </TouchableOpacity>
                {scenarioCards.map(card => (
                  <TouchableOpacity
                    key={card.id}
                    style={[styles.scenarioItem, selectedScenarioId === card.id && styles.scenarioItemActive]}
                    onPress={() => { onScenarioChange(card.id); setDropdownOpen(false); }}
                  >
                    <Text style={[styles.scenarioItemText, selectedScenarioId === card.id && styles.scenarioItemTextActive]}>
                      {card.icon ? `${card.icon} ` : ''}{card.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
      
      <View style={styles.rightControls}>
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
        {onReportProblem && (
          <TouchableOpacity
            style={styles.reportButton}
            onPress={onReportProblem}
            accessibilityLabel={t('profile.report_problem')}
          >
            <Ionicons name="bug-outline" size={22} color={theme.colors.text.tertiary} />
          </TouchableOpacity>
        )}
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
      </View>
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
    prevProps.audioToggleRef === nextProps.audioToggleRef &&
    prevProps.selectedScenarioId === nextProps.selectedScenarioId &&
    prevProps.scenarioCards === nextProps.scenarioCards &&
    prevProps.onScenarioChange === nextProps.onScenarioChange &&
    prevProps.onReportProblem === nextProps.onReportProblem
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
    zIndex: 100,
  },
  leftControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  reportButton: {
    padding: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
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
  scenarioWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  scenarioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  scenarioButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
    maxWidth: 160,
  },
  scenarioMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: theme.spacing[1],
    minWidth: 220,
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      },
      default: {
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
    }),
  },
  scenarioItem: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
  },
  scenarioItemActive: {
    backgroundColor: theme.colors.primary[50],
  },
  scenarioItemText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
  },
  scenarioItemTextActive: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
