import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  type PressableStateCallbackType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioFilterToggle, AudioFilterToggleRef } from './AudioFilterToggle';
import { theme } from '@/theme';
import { hexAlpha } from '@/theme/colorAlpha';

type ExtendedPressableState = PressableStateCallbackType & {
  hovered?: boolean;
  focused?: boolean;
};

interface ScenarioCard {
  id: string;
  name: string;
  icon?: string;
}

interface FilterOption {
  label: string;
  value: string | null;
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
  ageOptions?: FilterOption[];
  selectedAgeGroup?: string | null;
  onAgeGroupChange?: (ageGroup: string | null) => void;
  languageOptions?: FilterOption[];
  selectedLanguage?: string | null;
  onLanguageChange?: (language: string | null) => void;
  readingTimeOptions?: FilterOption[];
  selectedReadingTime?: string | null;
  onReadingTimeChange?: (value: string | null) => void;
}

type DropdownKey = 'scenario' | 'age' | 'language' | 'reading';

function FilterDropdown({
  buttonLabel,
  isOpen,
  onToggle,
  options,
  selectedValue,
  onSelect,
}: {
  buttonLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  options: FilterOption[];
  selectedValue?: string | null;
  onSelect: (value: string | null) => void;
}) {
  return (
    <View style={styles.dropdownWrapper}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        focusable
        style={(state: ExtendedPressableState) => [
          styles.dropdownButton,
          isOpen && styles.dropdownButtonOpen,
          Platform.OS === 'web' && state.hovered && styles.dropdownButtonHovered,
          state.pressed && styles.dropdownButtonPressed,
          Platform.OS === 'web' && state.focused && styles.dropdownButtonFocused,
        ]}
      >
        <Text style={styles.dropdownButtonText} numberOfLines={1}>
          {buttonLabel}
        </Text>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={isOpen ? theme.colors.interactive.primary : theme.colors.text.tertiary}
        />
      </Pressable>
      {isOpen && (
        <View style={styles.dropdownMenu}>
          {options.map((option, index) => {
            const isActive = selectedValue === option.value;
            const isLast = index === options.length - 1;
            return (
              <Pressable
                key={`${option.value ?? 'all'}-${index}`}
                focusable
                style={(state: ExtendedPressableState) => [
                  styles.dropdownItem,
                  isActive && styles.dropdownItemActive,
                  isLast && styles.dropdownItemLast,
                  Platform.OS === 'web' && state.hovered && !isActive && styles.dropdownItemHovered,
                  state.pressed && styles.dropdownItemPressed,
                  Platform.OS === 'web' && state.focused && styles.dropdownItemFocused,
                ]}
                onPress={() => onSelect(option.value)}
              >
                <Text style={[styles.dropdownItemText, isActive && styles.dropdownItemTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
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
  ageOptions = [],
  selectedAgeGroup,
  onAgeGroupChange,
  languageOptions = [],
  selectedLanguage,
  onLanguageChange,
  readingTimeOptions = [],
  selectedReadingTime,
  onReadingTimeChange,
}: Props) => {
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  
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

  const scenarioOptions = useMemo<FilterOption[]>(
    () => [
      { value: null, label: t('library.all_scenarios') },
      ...scenarioCards.map((card) => ({
        value: card.id,
        label: `${card.icon ? `${card.icon} ` : ''}${card.name}`,
      })),
    ],
    [scenarioCards, t]
  );

  const selectedScenarioLabel = selectedScenarioId
    ? scenarioCards.find((c) => c.id === selectedScenarioId)?.name || t('library.all_scenarios')
    : t('library.all_scenarios');
  const selectedAgeLabel = ageOptions.find((option) => option.value === selectedAgeGroup)?.label ?? t('library.all_ages');
  const selectedLanguageLabel =
    languageOptions.find((option) => option.value === selectedLanguage)?.label ?? t('library.all_languages');
  const selectedReadingTimeLabel =
    readingTimeOptions.find((option) => option.value === selectedReadingTime)?.label ?? t('library.all_reading_times');
  
  return (
    <View style={styles.header}>
      <View style={styles.leftControls}>
        {audioFilterElement}
        
        {scenarioCards.length > 0 && onScenarioChange && (
          <FilterDropdown
            buttonLabel={selectedScenarioLabel}
            isOpen={openDropdown === 'scenario'}
            onToggle={() => setOpenDropdown((prev) => (prev === 'scenario' ? null : 'scenario'))}
            options={scenarioOptions}
            selectedValue={selectedScenarioId}
            onSelect={(value) => {
              onScenarioChange(value);
              setOpenDropdown(null);
            }}
          />
        )}

        {ageOptions.length > 0 && onAgeGroupChange && (
          <FilterDropdown
            buttonLabel={selectedAgeLabel}
            isOpen={openDropdown === 'age'}
            onToggle={() => setOpenDropdown((prev) => (prev === 'age' ? null : 'age'))}
            options={ageOptions}
            selectedValue={selectedAgeGroup}
            onSelect={(value) => {
              onAgeGroupChange(value);
              setOpenDropdown(null);
            }}
          />
        )}

        {languageOptions.length > 0 && onLanguageChange && (
          <FilterDropdown
            buttonLabel={selectedLanguageLabel}
            isOpen={openDropdown === 'language'}
            onToggle={() => setOpenDropdown((prev) => (prev === 'language' ? null : 'language'))}
            options={languageOptions}
            selectedValue={selectedLanguage}
            onSelect={(value) => {
              onLanguageChange(value);
              setOpenDropdown(null);
            }}
          />
        )}

        {readingTimeOptions.length > 0 && onReadingTimeChange && (
          <FilterDropdown
            buttonLabel={selectedReadingTimeLabel}
            isOpen={openDropdown === 'reading'}
            onToggle={() => setOpenDropdown((prev) => (prev === 'reading' ? null : 'reading'))}
            options={readingTimeOptions}
            selectedValue={selectedReadingTime}
            onSelect={(value) => {
              onReadingTimeChange(value);
              setOpenDropdown(null);
            }}
          />
        )}
      </View>
      
      <View style={styles.rightControls}>
        {totalPages > 1 && (
          <View style={styles.paginationInHeader}>
            <Pressable
              onPress={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              focusable={currentPage !== 1}
              style={(state: ExtendedPressableState) => [
                styles.paginationButton,
                currentPage === 1 && styles.paginationButtonDisabled,
                currentPage !== 1 &&
                  Platform.OS === 'web' &&
                  state.hovered &&
                  styles.paginationButtonHovered,
                currentPage !== 1 && state.pressed && styles.paginationButtonPressed,
                currentPage !== 1 &&
                  Platform.OS === 'web' &&
                  state.focused &&
                  styles.paginationButtonFocused,
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={currentPage === 1 ? theme.colors.text.disabled : theme.colors.interactive.primary}
              />
            </Pressable>

            <Text style={styles.paginationText}>
              {t('library.page')} {currentPage} {t('library.of')} {totalPages}
            </Text>

            <Pressable
              onPress={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              focusable={currentPage !== totalPages}
              style={(state: ExtendedPressableState) => [
                styles.paginationButton,
                currentPage === totalPages && styles.paginationButtonDisabled,
                currentPage !== totalPages &&
                  Platform.OS === 'web' &&
                  state.hovered &&
                  styles.paginationButtonHovered,
                currentPage !== totalPages && state.pressed && styles.paginationButtonPressed,
                currentPage !== totalPages &&
                  Platform.OS === 'web' &&
                  state.focused &&
                  styles.paginationButtonFocused,
              ]}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={
                  currentPage === totalPages ? theme.colors.text.disabled : theme.colors.interactive.primary
                }
              />
            </Pressable>
          </View>
        )}
        <Pressable
          onPress={onToggleViewMode}
          accessibilityLabel={t(
            viewMode === 'grid' ? 'library.switch_to_list_view' : 'library.switch_to_grid_view'
          )}
          focusable
          style={(state: ExtendedPressableState) => [
            styles.viewToggle,
            Platform.OS === 'web' && state.hovered && styles.viewToggleHovered,
            state.pressed && styles.viewTogglePressed,
            Platform.OS === 'web' && state.focused && styles.viewToggleFocused,
          ]}
        >
          <Ionicons
            name={viewMode === 'grid' ? 'list' : 'grid'}
            size={24}
            color={theme.colors.text.primary}
          />
        </Pressable>
      </View>
    </View>
  );
};

// Custom comparison: ignore initialAudioFilter changes (used only for initial mount)
const areEqual = (prevProps: Props, nextProps: Props) => {
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
    prevProps.ageOptions === nextProps.ageOptions &&
    prevProps.selectedAgeGroup === nextProps.selectedAgeGroup &&
    prevProps.onAgeGroupChange === nextProps.onAgeGroupChange &&
    prevProps.languageOptions === nextProps.languageOptions &&
    prevProps.selectedLanguage === nextProps.selectedLanguage &&
    prevProps.onLanguageChange === nextProps.onLanguageChange &&
    prevProps.readingTimeOptions === nextProps.readingTimeOptions &&
    prevProps.selectedReadingTime === nextProps.selectedReadingTime &&
    prevProps.onReadingTimeChange === nextProps.onReadingTimeChange
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
    flexWrap: 'wrap',
    gap: theme.spacing[3],
  },
  rightControls: {
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
    ...Platform.select({
      web: {
        transition: 'background-color 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  viewToggleHovered: Platform.select({
    web: {
      backgroundColor: theme.colors.primary[50],
      borderColor: theme.colors.primary[200],
      boxShadow: `0 2px 8px ${hexAlpha(theme.colors.primary[900], 0.1)}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    default: {},
  }),
  viewTogglePressed: {
    opacity: 0.92,
  },
  viewToggleFocused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: theme.colors.primary[500],
      outlineOffset: 2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  paginationInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  paginationButton: {
    padding: theme.spacing[2],
    borderRadius: theme.borders.radius.sm,
    ...Platform.select({
      web: {
        transition: 'background-color 160ms ease, box-shadow 160ms ease',
        cursor: 'pointer',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  paginationButtonHovered: {
    backgroundColor: theme.colors.primary[50],
    ...Platform.select({
      web: {
        boxShadow: `0 1px 6px ${hexAlpha(theme.colors.primary[900], 0.08)}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  paginationButtonPressed: {
    opacity: 0.85,
  },
  paginationButtonFocused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: theme.colors.primary[500],
      outlineOffset: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
  },
  dropdownWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  dropdownButtonOpen: {
    borderColor: theme.colors.primary[300],
    backgroundColor: theme.colors.primary[50],
  },
  dropdownButtonHovered: Platform.select({
    web: {
      borderColor: theme.colors.primary[200],
      backgroundColor: theme.colors.primary[50],
      boxShadow: `0 2px 10px ${hexAlpha(theme.colors.primary[900], 0.12)}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    default: {},
  }),
  dropdownButtonPressed: {
    opacity: 0.94,
  },
  dropdownButtonFocused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: theme.colors.primary[500],
      outlineOffset: 2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  dropdownButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
    maxWidth: 160,
  },
  dropdownMenu: {
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
  dropdownItem: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 140ms ease',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownItemHovered: {
    backgroundColor: theme.colors.neutral[100],
  },
  dropdownItemPressed: {
    opacity: 0.92,
  },
  dropdownItemFocused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: theme.colors.primary[500],
      outlineOffset: -2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  dropdownItemActive: {
    backgroundColor: theme.colors.primary[50],
  },
  dropdownItemText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
  },
  dropdownItemTextActive: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
