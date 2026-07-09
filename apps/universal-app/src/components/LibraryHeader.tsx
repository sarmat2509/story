import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  type PressableStateCallbackType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioFilterToggle, AudioFilterToggleRef } from './AudioFilterToggle';
import { theme } from '@/theme';
import { hexAlpha } from '@/theme/colorAlpha';
import { useResponsive } from '@/hooks/useResponsive';

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

function MobileFilterOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      focusable
      style={(state: ExtendedPressableState) => [
        styles.mobileFilterOption,
        selected && styles.mobileFilterOptionActive,
        Platform.OS === 'web' && state.hovered && !selected && styles.mobileFilterOptionHovered,
        state.pressed && styles.mobileFilterOptionPressed,
        Platform.OS === 'web' && state.focused && styles.mobileFilterOptionFocused,
      ]}
    >
      <Text
        style={[
          styles.mobileFilterOptionText,
          selected && styles.mobileFilterOptionTextActive,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

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
  const { isMobile } = useResponsive();
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);
  const [draftAudioFilter, setDraftAudioFilter] = useState(initialAudioFilter);
  const [draftScenarioId, setDraftScenarioId] = useState<string | null>(
    selectedScenarioId ?? null
  );
  const [draftAgeGroup, setDraftAgeGroup] = useState<string | null>(selectedAgeGroup ?? null);
  const [draftLanguage, setDraftLanguage] = useState<string | null>(selectedLanguage ?? null);
  const [draftReadingTime, setDraftReadingTime] = useState<string | null>(
    selectedReadingTime ?? null
  );

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
    // initialAudioFilter is intentionally only read on mount.
    // eslint-disable-next-line
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
  const selectedAgeLabel =
    ageOptions.find((option) => option.value === selectedAgeGroup)?.label ?? t('library.all_ages');
  const selectedLanguageLabel =
    languageOptions.find((option) => option.value === selectedLanguage)?.label ??
    t('library.all_languages');
  const selectedReadingTimeLabel =
    readingTimeOptions.find((option) => option.value === selectedReadingTime)?.label ??
    t('library.all_reading_times');

  useEffect(() => {
    if (isFilterModalVisible) return;

    setDraftAudioFilter(initialAudioFilter);
    setDraftScenarioId(selectedScenarioId ?? null);
    setDraftAgeGroup(selectedAgeGroup ?? null);
    setDraftLanguage(selectedLanguage ?? null);
    setDraftReadingTime(selectedReadingTime ?? null);
  }, [
    initialAudioFilter,
    isFilterModalVisible,
    selectedAgeGroup,
    selectedLanguage,
    selectedReadingTime,
    selectedScenarioId,
  ]);

  const openFilterModal = () => {
    setDraftAudioFilter(initialAudioFilter);
    setDraftScenarioId(selectedScenarioId ?? null);
    setDraftAgeGroup(selectedAgeGroup ?? null);
    setDraftLanguage(selectedLanguage ?? null);
    setDraftReadingTime(selectedReadingTime ?? null);
    setOpenDropdown(null);
    setFilterModalVisible(true);
  };

  const closeFilterModal = () => {
    setFilterModalVisible(false);
  };

  const applyMobileFilters = () => {
    if (draftAudioFilter !== initialAudioFilter) {
      onToggleAudioFilter(draftAudioFilter);
      audioToggleRef.current?.setValue(draftAudioFilter);
    }

    if (onScenarioChange && draftScenarioId !== (selectedScenarioId ?? null)) {
      onScenarioChange(draftScenarioId);
    }

    if (onAgeGroupChange && draftAgeGroup !== (selectedAgeGroup ?? null)) {
      onAgeGroupChange(draftAgeGroup);
    }

    if (onLanguageChange && draftLanguage !== (selectedLanguage ?? null)) {
      onLanguageChange(draftLanguage);
    }

    if (onReadingTimeChange && draftReadingTime !== (selectedReadingTime ?? null)) {
      onReadingTimeChange(draftReadingTime);
    }

    setFilterModalVisible(false);
  };

  const renderMobileFilterGroup = (
    title: string,
    options: FilterOption[],
    selectedValue: string | null | undefined,
    onSelect: (value: string | null) => void
  ) => {
    if (options.length === 0) return null;

    return (
      <View style={styles.mobileFilterGroup}>
        <Text style={styles.mobileFilterGroupTitle}>{title.replace(/:$/, '')}</Text>
        <View style={styles.mobileFilterOptions}>
          {options.map((option, index) => (
            <MobileFilterOption
              key={`${option.value ?? 'all'}-${index}`}
              label={option.label}
              selected={(selectedValue ?? null) === option.value}
              onPress={() => onSelect(option.value)}
            />
          ))}
        </View>
      </View>
    );
  };

  return (
    <>
      <View style={styles.header}>
        <View style={styles.leftControls}>
          {isMobile ? (
            <Pressable
              onPress={openFilterModal}
              accessibilityRole="button"
              accessibilityLabel={t('library.filters')}
              focusable
              style={(state: ExtendedPressableState) => [
                styles.filterSettingsButton,
                Platform.OS === 'web' && state.hovered && styles.filterSettingsButtonHovered,
                state.pressed && styles.filterSettingsButtonPressed,
                Platform.OS === 'web' && state.focused && styles.filterSettingsButtonFocused,
              ]}
            >
              <Ionicons name="settings-outline" size={24} color={theme.colors.text.primary} />
            </Pressable>
          ) : (
            <>
              {audioFilterElement}

              {scenarioCards.length > 0 && onScenarioChange && (
                <FilterDropdown
                  buttonLabel={selectedScenarioLabel}
                  isOpen={openDropdown === 'scenario'}
                  onToggle={() =>
                    setOpenDropdown((prev) => (prev === 'scenario' ? null : 'scenario'))
                  }
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
                  onToggle={() =>
                    setOpenDropdown((prev) => (prev === 'language' ? null : 'language'))
                  }
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
                  onToggle={() =>
                    setOpenDropdown((prev) => (prev === 'reading' ? null : 'reading'))
                  }
                  options={readingTimeOptions}
                  selectedValue={selectedReadingTime}
                  onSelect={(value) => {
                    onReadingTimeChange(value);
                    setOpenDropdown(null);
                  }}
                />
              )}
            </>
          )}
        </View>

        {!isMobile && (
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
                    color={
                      currentPage === 1
                        ? theme.colors.text.disabled
                        : theme.colors.interactive.primary
                    }
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
                      currentPage === totalPages
                        ? theme.colors.text.disabled
                        : theme.colors.interactive.primary
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
        )}
      </View>

      <Modal
        visible={isMobile && isFilterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeFilterModal}
      >
        <View style={styles.mobileFilterModalRoot}>
          <Pressable
            style={styles.mobileFilterBackdrop}
            onPress={closeFilterModal}
            accessibilityLabel={t('common.close')}
          />
          <View style={styles.mobileFilterPanel}>
            <View style={styles.mobileFilterHeader}>
              <Text style={styles.mobileFilterTitle}>{t('library.filters')}</Text>
              <Pressable
                onPress={closeFilterModal}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                focusable
                style={(state: ExtendedPressableState) => [
                  styles.mobileFilterCloseButton,
                  Platform.OS === 'web' && state.hovered && styles.mobileFilterCloseButtonHovered,
                  state.pressed && styles.mobileFilterCloseButtonPressed,
                  Platform.OS === 'web' && state.focused && styles.mobileFilterCloseButtonFocused,
                ]}
              >
                <Ionicons name="close" size={22} color={theme.colors.text.primary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.mobileFilterScroll}
              contentContainerStyle={styles.mobileFilterContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.mobileFilterGroup}>
                <View style={styles.mobileFilterOptions}>
                  <MobileFilterOption
                    label={labelsRef.current.allStories}
                    selected={!draftAudioFilter}
                    onPress={() => setDraftAudioFilter(false)}
                  />
                  <MobileFilterOption
                    label={labelsRef.current.audioOnly}
                    selected={draftAudioFilter}
                    onPress={() => setDraftAudioFilter(true)}
                  />
                </View>
              </View>

              {scenarioCards.length > 0 && onScenarioChange
                ? renderMobileFilterGroup(
                    t('library.filter_scenario'),
                    scenarioOptions,
                    draftScenarioId,
                    setDraftScenarioId
                  )
                : null}

              {ageOptions.length > 0 && onAgeGroupChange
                ? renderMobileFilterGroup(
                    t('library.filter_age'),
                    ageOptions,
                    draftAgeGroup,
                    setDraftAgeGroup
                  )
                : null}

              {languageOptions.length > 0 && onLanguageChange
                ? renderMobileFilterGroup(
                    t('settings.language'),
                    languageOptions,
                    draftLanguage,
                    setDraftLanguage
                  )
                : null}

              {readingTimeOptions.length > 0 && onReadingTimeChange
                ? renderMobileFilterGroup(
                    t('library.all_reading_times'),
                    readingTimeOptions,
                    draftReadingTime,
                    setDraftReadingTime
                  )
                : null}
            </ScrollView>

            <View style={styles.mobileFilterActions}>
              <Pressable
                onPress={applyMobileFilters}
                accessibilityRole="button"
                focusable
                style={(state: ExtendedPressableState) => [
                  styles.mobileFilterApplyButton,
                  Platform.OS === 'web' && state.hovered && styles.mobileFilterApplyButtonHovered,
                  state.pressed && styles.mobileFilterApplyButtonPressed,
                  Platform.OS === 'web' && state.focused && styles.mobileFilterApplyButtonFocused,
                ]}
              >
                <Text style={styles.mobileFilterApplyText}>{t('common.apply')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

// AudioFilterToggle still treats initialAudioFilter as mount-only; mobile draft filters need it.
const areEqual = (prevProps: Props, nextProps: Props) => {
  return (
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.currentPage === nextProps.currentPage &&
    prevProps.totalPages === nextProps.totalPages &&
    prevProps.initialAudioFilter === nextProps.initialAudioFilter &&
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
  filterSettingsButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  filterSettingsButtonHovered: Platform.select({
    web: {
      backgroundColor: theme.colors.primary[50],
      borderColor: theme.colors.primary[200],
      boxShadow: `0 2px 8px ${hexAlpha(theme.colors.primary[900], 0.1)}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    default: {},
  }),
  filterSettingsButtonPressed: {
    opacity: 0.92,
  },
  filterSettingsButtonFocused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: theme.colors.primary[500],
      outlineOffset: 2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
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
  mobileFilterModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  mobileFilterBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
  },
  mobileFilterPanel: {
    maxHeight: '86%',
    marginHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[3],
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: `0 18px 40px ${hexAlpha(theme.colors.neutral[900], 0.2)}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      default: {
        elevation: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
    }),
  },
  mobileFilterHeader: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
  },
  mobileFilterTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  mobileFilterCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.full,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 160ms ease, box-shadow 160ms ease',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  mobileFilterCloseButtonHovered: {
    backgroundColor: theme.colors.primary[50],
  },
  mobileFilterCloseButtonPressed: {
    opacity: 0.86,
  },
  mobileFilterCloseButtonFocused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: theme.colors.primary[500],
      outlineOffset: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  mobileFilterScroll: {
    flexGrow: 0,
  },
  mobileFilterContent: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[2],
    gap: theme.spacing[5],
  },
  mobileFilterGroup: {
    gap: theme.spacing[3],
  },
  mobileFilterGroupTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
  },
  mobileFilterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  mobileFilterOption: {
    minHeight: 42,
    maxWidth: '100%',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  mobileFilterOptionActive: {
    backgroundColor: theme.colors.primary[50],
    borderColor: theme.colors.interactive.primary,
  },
  mobileFilterOptionHovered: Platform.select({
    web: {
      backgroundColor: theme.colors.primary[50],
      borderColor: theme.colors.primary[200],
      boxShadow: `0 1px 8px ${hexAlpha(theme.colors.primary[900], 0.08)}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    default: {},
  }),
  mobileFilterOptionPressed: {
    opacity: 0.9,
  },
  mobileFilterOptionFocused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: theme.colors.primary[500],
      outlineOffset: 2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  mobileFilterOptionText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  mobileFilterOptionTextActive: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  mobileFilterActions: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[4],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
  },
  mobileFilterApplyButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.interactive.primary,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  mobileFilterApplyButtonHovered: Platform.select({
    web: {
      boxShadow: `0 2px 12px ${hexAlpha(theme.colors.primary[900], 0.18)}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    default: {},
  }),
  mobileFilterApplyButtonPressed: {
    opacity: 0.9,
  },
  mobileFilterApplyButtonFocused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: theme.colors.primary[500],
      outlineOffset: 2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  mobileFilterApplyText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
});
