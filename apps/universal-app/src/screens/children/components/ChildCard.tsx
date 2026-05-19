import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Platform,
  Switch,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';

interface Child {
  id: string;
  name: string;
  birthDate?: string;
  birthdate?: string;
  turnaroundSheet?: { url: string; frontUrl?: string };
  referencePhotos?: Array<{ url: string }>;
  childModeEnabled?: boolean;
  childModeSettings?: Partial<ChildModeSettings>;
  childModePasscodeConfigured?: boolean;
  childModeActiveSessionCount?: number;
}

interface Props {
  child: Child;
  onPress: () => void;
  onDelete?: (childId: string, childName: string) => void;
  onRequestDataDeletion?: (childId: string, childName: string) => void;
  dataDeletionRequestLabel?: string;
  childModeLabels?: ChildModeLabels;
  childModeThemeOptions?: ChildModeOption[];
  childModeLanguageOptions?: ChildModeOption[];
  childModeCharacterOptions?: ChildModeOption[];
  childModeLimitHints?: ChildModeLimitHints;
  showProfileSummary?: boolean;
  onChildModeEnabledChange?: (childId: string, enabled: boolean) => void;
  onChildModeSettingsChange?: (childId: string, settings: Partial<ChildModeSettings>) => void;
  onEnterChildMode?: (childId: string, childName: string) => void;
  onRevokeChildModeSessions?: (childId: string, childName: string) => void;
  isChildModeUpdating?: boolean;
  isEnteringChildMode?: boolean;
  isRevokingChildSessions?: boolean;
}

interface ChildModeSettings {
  storyGenerationEnabled: boolean;
  publicStoriesEnabled: boolean;
  dailyGenerationLimit: number | null;
  dailyAudioGenerationLimit: number | null;
  monthlyGenerationLimit: number | null;
  allowedThemeSlugs: string[];
  allowedLanguageCodes: string[];
  allowedCharacterIds: string[];
  freeTextPromptsEnabled: boolean;
  audioGenerationEnabled: boolean;
  parentReviewRequired: boolean;
  allowSiblingCharacters: boolean;
  allowSharedFamilyStories: boolean;
}

interface ChildModeLabels {
  title: string;
  enabled: string;
  disabled: string;
  accessAllowed: string;
  accessDisabled: string;
  readyToStart: string;
  passwordNeeded: string;
  dailyLimit: string;
  monthlyLimit: string;
  noLimit: string;
  freeText: string;
  audio: string;
  review: string;
  storyGeneration: string;
  publicStories: string;
  dailyAudioLimit: string;
  themes: string;
  languages: string;
  characters: string;
  siblings: string;
  anyTheme: string;
  anyLanguage: string;
  anyCharacter: string;
  noCharacters: string;
  setPasscodeToStart: string;
  activeSessions: string;
  revoke: string;
  start: string;
  starting: string;
  enableToStart: string;
  limitMax: string;
  limitAvailable: string;
  limitReserved: string;
}

interface ChildModeOption {
  value: string;
  label: string;
  icon?: string;
}

interface ChildModeLimitHints {
  dailyStoryHelper?: string;
  dailyStoryMaxValue?: number | null;
  dailyStoryTotalValue?: number | null;
  dailyStoryReservedValue?: number | null;
  monthlyStoryHelper?: string;
  dailyAudioHelper?: string;
  monthlyStoryMaxValue?: number | null;
  monthlyStoryTotalValue?: number | null;
  monthlyStoryReservedValue?: number | null;
  dailyAudioMaxValue?: number | null;
  dailyAudioTotalValue?: number | null;
}

const DEFAULT_CHILD_MODE_SETTINGS: ChildModeSettings = {
  storyGenerationEnabled: true,
  publicStoriesEnabled: true,
  dailyGenerationLimit: null,
  dailyAudioGenerationLimit: null,
  monthlyGenerationLimit: null,
  allowedThemeSlugs: [],
  allowedLanguageCodes: [],
  allowedCharacterIds: [],
  freeTextPromptsEnabled: true,
  audioGenerationEnabled: true,
  parentReviewRequired: false,
  allowSiblingCharacters: false,
  allowSharedFamilyStories: false,
};

function normalizeChildModeSettings(settings?: Partial<ChildModeSettings>): ChildModeSettings {
  const raw = settings || {};
  return {
    ...DEFAULT_CHILD_MODE_SETTINGS,
    ...raw,
    allowedThemeSlugs: Array.isArray(raw.allowedThemeSlugs) ? raw.allowedThemeSlugs : [],
    allowedLanguageCodes: Array.isArray(raw.allowedLanguageCodes) ? raw.allowedLanguageCodes : [],
    allowedCharacterIds: Array.isArray(raw.allowedCharacterIds) ? raw.allowedCharacterIds : [],
  };
}

function formatCountTemplate(template: string, count: number) {
  return template.replace('{{count}}', String(count));
}

function getSafeLimit(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function LimitSlider({
  label,
  nativeID,
  value,
  unsetLabel,
  helperText,
  maxValue,
  totalValue,
  reservedValue,
  labels,
  defaultMax,
  disabled,
  onCommit,
}: {
  label: string;
  nativeID: string;
  value: number | null;
  unsetLabel: string;
  helperText?: string;
  maxValue?: number | null;
  totalValue?: number | null;
  reservedValue?: number | null;
  labels: Pick<ChildModeLabels, 'limitAvailable' | 'limitMax' | 'limitReserved'>;
  defaultMax: number;
  disabled?: boolean;
  onCommit: (value: number | null) => void;
}) {
  const sliderRef = useRef<View>(null);
  const totalMax = Math.max(1, getSafeLimit(totalValue, getSafeLimit(maxValue, defaultMax)));
  const availableMax = Math.max(0, Math.min(totalMax, getSafeLimit(maxValue, totalMax)));
  const reserved = Math.max(0, getSafeLimit(reservedValue, Math.max(0, totalMax - availableMax)));
  const effectiveValue = value === null ? availableMax : Math.max(0, Math.min(availableMax, value));
  const selectedPercent = totalMax > 0 ? (effectiveValue / totalMax) * 100 : 0;
  const availablePercent = totalMax > 0 ? (availableMax / totalMax) * 100 : 0;
  const isUnset = value === null;
  const valueLabel = isUnset ? unsetLabel : String(effectiveValue);

  const commitFromLocation = useCallback(
    (event: any) => {
      if (disabled) return;
      const nativeEvent = event.nativeEvent;
      const locationX =
        typeof nativeEvent.locationX === 'number'
          ? nativeEvent.locationX
          : typeof nativeEvent.offsetX === 'number'
            ? nativeEvent.offsetX
            : undefined;
      if (typeof locationX !== 'number' || !Number.isFinite(locationX)) return;

      sliderRef.current?.measure((_x, _y, width) => {
        if (!width || width <= 0) return;
        const ratio = Math.max(0, Math.min(1, locationX / width));
        const nextValue = Math.min(availableMax, Math.round(ratio * totalMax));
        onCommit(nextValue);
      });
    },
    [availableMax, disabled, onCommit, totalMax]
  );

  return (
    <View style={styles.limitField}>
      <View style={styles.limitHeaderRow}>
        <Text style={styles.limitLabel}>{label}</Text>
        <View style={[styles.limitValueBadge, isUnset && styles.limitValueBadgeUnset]}>
          <Text style={[styles.limitValueText, isUnset && styles.limitValueTextUnset]}>
            {valueLabel}
          </Text>
        </View>
      </View>
      <Pressable
        nativeID={nativeID}
        ref={sliderRef}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: totalMax, now: effectiveValue, text: valueLabel }}
        disabled={disabled}
        onPress={commitFromLocation}
        style={({ pressed }) => [
          styles.limitSliderTapArea,
          pressed && !disabled && styles.limitSliderPressed,
          disabled && styles.controlDisabled,
        ]}
      >
        <View style={styles.limitSliderTrack}>
          <View style={[styles.limitSliderAvailable, { width: `${availablePercent}%` }]} />
          <View style={[styles.limitSliderFill, { width: `${selectedPercent}%` }]} />
          {availableMax < totalMax ? (
            <View style={[styles.limitSliderUnavailable, { left: `${availablePercent}%` }]} />
          ) : null}
          <View style={[styles.limitSliderThumb, { left: `${selectedPercent}%` }]} />
        </View>
      </Pressable>
      <View style={styles.limitScaleRow}>
        <Text style={styles.limitScaleText}>0</Text>
        <Text style={styles.limitScaleText}>{formatCountTemplate(labels.limitMax, totalMax)}</Text>
      </View>
      <View style={styles.limitBudgetRow}>
        <Text style={styles.limitBudgetText}>
          {formatCountTemplate(labels.limitAvailable, availableMax)}
        </Text>
        {reserved > 0 ? (
          <Text style={styles.limitBudgetText}>
            {formatCountTemplate(labels.limitReserved, reserved)}
          </Text>
        ) : null}
      </View>
      {!isUnset ? (
        <Pressable
          style={({ pressed }) => [
            styles.limitUnsetButton,
            pressed && !disabled && styles.limitUnsetButtonPressed,
            disabled && styles.controlDisabled,
          ]}
          disabled={disabled}
          onPress={() => onCommit(null)}
        >
          <Text style={styles.limitUnsetButtonText}>{unsetLabel}</Text>
        </Pressable>
      ) : null}
      {helperText ? <Text style={styles.limitHelper}>{helperText}</Text> : null}
    </View>
  );
}

function SettingSwitch({
  label,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{
          false: theme.colors.background.tertiary,
          true: theme.colors.interactive.secondary,
        }}
        thumbColor={value ? theme.colors.interactive.primary : theme.colors.text.inverse}
      />
    </View>
  );
}

function MultiSelectChips({
  label,
  selectedValues,
  options,
  allLabel,
  emptyText,
  disabled,
  onChange,
}: {
  label: string;
  selectedValues: string[];
  options: ChildModeOption[];
  allLabel: string;
  emptyText?: string;
  disabled?: boolean;
  onChange: (value: string[]) => void;
}) {
  const selectedSet = new Set(selectedValues);
  const displayedOptions: ChildModeOption[] = [
    ...options,
    ...selectedValues
      .filter((value) => !options.some((option) => option.value === value))
      .map((value) => ({ value, label: value.replace(/_/g, ' ') })),
  ];
  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selectedValues.filter((item) => item !== value));
      return;
    }
    onChange([...selectedValues, value]);
  };

  return (
    <View style={styles.multiSelectBlock}>
      <Text style={styles.multiSelectLabel}>{label}</Text>
      <View style={styles.optionChips}>
        <Pressable
          style={({ pressed }) => [
            styles.optionChip,
            selectedValues.length === 0 && styles.optionChipSelected,
            (pressed || disabled) && styles.optionChipPressed,
          ]}
          disabled={disabled}
          onPress={() => onChange([])}
        >
          <Text
            style={[
              styles.optionChipText,
              selectedValues.length === 0 && styles.optionChipTextSelected,
            ]}
          >
            {allLabel}
          </Text>
        </Pressable>
        {options.length === 0 && emptyText ? (
          <Text style={styles.optionEmptyText} numberOfLines={2}>
            {emptyText}
          </Text>
        ) : null}
        {displayedOptions.map((option) => {
          const selected = selectedSet.has(option.value);
          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.optionChip,
                selected && styles.optionChipSelected,
                (pressed || disabled) && styles.optionChipPressed,
              ]}
              disabled={disabled}
              onPress={() => toggleValue(option.value)}
            >
              {option.icon ? <Text style={styles.optionChipIcon}>{option.icon}</Text> : null}
              <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ChildCard({
  child,
  onPress,
  onDelete,
  onRequestDataDeletion,
  dataDeletionRequestLabel,
  childModeLabels,
  childModeThemeOptions = [],
  childModeLanguageOptions = [],
  childModeCharacterOptions = [],
  childModeLimitHints,
  showProfileSummary = true,
  onChildModeEnabledChange,
  onChildModeSettingsChange,
  onEnterChildMode,
  onRevokeChildModeSessions,
  isChildModeUpdating,
  isEnteringChildMode,
  isRevokingChildSessions,
}: Props) {
  const avatarUrl =
    child.turnaroundSheet?.frontUrl ??
    child.turnaroundSheet?.url ??
    child.referencePhotos?.[0]?.url;
  const imageContainerWebStyle =
    Platform.OS === 'web' ? ({ filter: 'contrast(1.05)' } as any) : null;
  const birthDateRaw = child.birthDate ?? child.birthdate;
  const subline = birthDateRaw
    ? (() => {
        const date = new Date(birthDateRaw);
        return !isNaN(date.getTime()) ? date.toLocaleDateString() : '';
      })()
    : '';
  const childModeSettings = normalizeChildModeSettings(child.childModeSettings);
  const childModeEnabled = child.childModeEnabled === true;
  const childModePasscodeConfigured = child.childModePasscodeConfigured === true;
  const activeSessionCount = child.childModeActiveSessionCount ?? 0;
  const controlsDisabled = isChildModeUpdating || !onChildModeSettingsChange;
  const labels = childModeLabels;
  const childModeSwitchDisabled = isChildModeUpdating || !onChildModeEnabledChange;
  const childModeStatusText = labels
    ? !childModeEnabled
      ? labels.accessDisabled
      : childModePasscodeConfigured
        ? labels.readyToStart
        : `${labels.accessAllowed} · ${labels.passwordNeeded}`
    : '';

  return (
    <View style={styles.cardWrapper}>
      <View style={styles.card}>
        {showProfileSummary ? (
          <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            <View style={[styles.imageContainer, imageContainerWebStyle]}>
              {avatarUrl ? (
                <Image
                  source={{ uri: formatAssetUrl(avatarUrl) ?? avatarUrl }}
                  style={styles.image}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderIcon}>👶</Text>
                </View>
              )}
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {child.name}
            </Text>
            {subline ? (
              <Text style={styles.subline} numberOfLines={1}>
                {subline}
              </Text>
            ) : null}
          </TouchableOpacity>
        ) : null}

        {labels ? (
          <View
            style={[
              styles.childModeSection,
              !showProfileSummary && styles.childModeSectionStandalone,
            ]}
          >
            <View style={styles.childModeHeader}>
              <View style={styles.childModeTitleRow}>
                <Ionicons
                  name={childModeEnabled ? 'shield-checkmark' : 'shield-outline'}
                  size={18}
                  color={
                    childModeEnabled ? theme.colors.status.success : theme.colors.text.tertiary
                  }
                />
                <Text style={styles.childModeTitle}>{labels.title}</Text>
              </View>
              <Switch
                value={childModeEnabled}
                disabled={childModeSwitchDisabled}
                onValueChange={(enabled) => onChildModeEnabledChange?.(child.id, enabled)}
                trackColor={{
                  false: theme.colors.background.tertiary,
                  true: theme.colors.interactive.secondary,
                }}
                thumbColor={
                  childModeEnabled ? theme.colors.interactive.primary : theme.colors.text.inverse
                }
              />
            </View>

            <Text style={styles.childModeStatus}>{childModeStatusText}</Text>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.startChildModeButton,
                (!childModeEnabled ||
                  !childModePasscodeConfigured ||
                  isEnteringChildMode ||
                  !onEnterChildMode) &&
                  styles.startChildModeButtonDisabled,
                pressed &&
                  childModeEnabled &&
                  !isEnteringChildMode &&
                  styles.startChildModeButtonPressed,
              ]}
              disabled={
                !childModeEnabled ||
                !childModePasscodeConfigured ||
                isEnteringChildMode ||
                !onEnterChildMode
              }
              onPress={() => onEnterChildMode?.(child.id, child.name)}
            >
              <Ionicons
                name={isEnteringChildMode ? 'hourglass-outline' : 'play-circle-outline'}
                size={18}
                color={theme.colors.text.inverse}
              />
              <Text style={styles.startChildModeButtonText}>
                {childModeEnabled
                  ? !childModePasscodeConfigured
                    ? labels.setPasscodeToStart
                    : isEnteringChildMode
                      ? labels.starting
                      : labels.start
                  : labels.enableToStart}
              </Text>
            </Pressable>

            <View style={styles.limitRow}>
              <LimitSlider
                label={labels.dailyLimit}
                nativeID={`child-mode-${child.id}-daily-limit`}
                value={childModeSettings.dailyGenerationLimit}
                unsetLabel={labels.noLimit}
                helperText={childModeLimitHints?.dailyStoryHelper}
                maxValue={childModeLimitHints?.dailyStoryMaxValue}
                totalValue={childModeLimitHints?.dailyStoryTotalValue}
                reservedValue={childModeLimitHints?.dailyStoryReservedValue}
                labels={labels}
                defaultMax={100}
                disabled={controlsDisabled}
                onCommit={(dailyGenerationLimit) =>
                  onChildModeSettingsChange?.(child.id, { dailyGenerationLimit })
                }
              />
              <LimitSlider
                label={labels.monthlyLimit}
                nativeID={`child-mode-${child.id}-monthly-limit`}
                value={childModeSettings.monthlyGenerationLimit}
                unsetLabel={labels.noLimit}
                helperText={childModeLimitHints?.monthlyStoryHelper}
                maxValue={childModeLimitHints?.monthlyStoryMaxValue}
                totalValue={childModeLimitHints?.monthlyStoryTotalValue}
                reservedValue={childModeLimitHints?.monthlyStoryReservedValue}
                labels={labels}
                defaultMax={1000}
                disabled={controlsDisabled}
                onCommit={(monthlyGenerationLimit) =>
                  onChildModeSettingsChange?.(child.id, { monthlyGenerationLimit })
                }
              />
            </View>
            <View style={styles.limitRow}>
              <LimitSlider
                label={labels.dailyAudioLimit}
                nativeID={`child-mode-${child.id}-daily-audio-limit`}
                value={childModeSettings.dailyAudioGenerationLimit}
                unsetLabel={labels.noLimit}
                helperText={childModeLimitHints?.dailyAudioHelper}
                maxValue={childModeLimitHints?.dailyAudioMaxValue}
                totalValue={childModeLimitHints?.dailyAudioTotalValue}
                labels={labels}
                defaultMax={100}
                disabled={controlsDisabled}
                onCommit={(dailyAudioGenerationLimit) =>
                  onChildModeSettingsChange?.(child.id, { dailyAudioGenerationLimit })
                }
              />
            </View>

            <SettingSwitch
              label={labels.storyGeneration}
              value={childModeSettings.storyGenerationEnabled}
              disabled={controlsDisabled}
              onValueChange={(storyGenerationEnabled) =>
                onChildModeSettingsChange?.(child.id, { storyGenerationEnabled })
              }
            />
            <SettingSwitch
              label={labels.publicStories}
              value={childModeSettings.publicStoriesEnabled}
              disabled={controlsDisabled}
              onValueChange={(publicStoriesEnabled) =>
                onChildModeSettingsChange?.(child.id, { publicStoriesEnabled })
              }
            />
            <SettingSwitch
              label={labels.freeText}
              value={childModeSettings.freeTextPromptsEnabled}
              disabled={controlsDisabled}
              onValueChange={(freeTextPromptsEnabled) =>
                onChildModeSettingsChange?.(child.id, { freeTextPromptsEnabled })
              }
            />
            <SettingSwitch
              label={labels.audio}
              value={childModeSettings.audioGenerationEnabled}
              disabled={controlsDisabled}
              onValueChange={(audioGenerationEnabled) =>
                onChildModeSettingsChange?.(child.id, { audioGenerationEnabled })
              }
            />
            <SettingSwitch
              label={labels.review}
              value={childModeSettings.parentReviewRequired}
              disabled={controlsDisabled}
              onValueChange={(parentReviewRequired) =>
                onChildModeSettingsChange?.(child.id, { parentReviewRequired })
              }
            />
            <MultiSelectChips
              label={labels.themes}
              selectedValues={childModeSettings.allowedThemeSlugs}
              options={childModeThemeOptions}
              allLabel={labels.anyTheme}
              disabled={controlsDisabled}
              onChange={(allowedThemeSlugs) =>
                onChildModeSettingsChange?.(child.id, { allowedThemeSlugs })
              }
            />
            <MultiSelectChips
              label={labels.languages}
              selectedValues={childModeSettings.allowedLanguageCodes}
              options={childModeLanguageOptions}
              allLabel={labels.anyLanguage}
              disabled={controlsDisabled}
              onChange={(allowedLanguageCodes) =>
                onChildModeSettingsChange?.(child.id, { allowedLanguageCodes })
              }
            />
            <MultiSelectChips
              label={labels.characters}
              selectedValues={childModeSettings.allowedCharacterIds}
              options={childModeCharacterOptions}
              allLabel={labels.anyCharacter}
              emptyText={labels.noCharacters}
              disabled={controlsDisabled}
              onChange={(allowedCharacterIds) =>
                onChildModeSettingsChange?.(child.id, { allowedCharacterIds })
              }
            />
            <SettingSwitch
              label={labels.siblings}
              value={childModeSettings.allowSiblingCharacters}
              disabled={controlsDisabled}
              onValueChange={(allowSiblingCharacters) =>
                onChildModeSettingsChange?.(child.id, { allowSiblingCharacters })
              }
            />

            <View style={styles.sessionsRow}>
              <Text style={styles.sessionsText} numberOfLines={1}>
                {labels.activeSessions}: {activeSessionCount}
              </Text>
              {activeSessionCount > 0 && onRevokeChildModeSessions ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.revokeButton,
                    (pressed || isRevokingChildSessions) && styles.revokeButtonPressed,
                  ]}
                  disabled={isRevokingChildSessions}
                  onPress={() => onRevokeChildModeSessions(child.id, child.name)}
                >
                  <Ionicons name="log-out-outline" size={15} color={theme.colors.status.error} />
                  <Text style={styles.revokeButtonText} numberOfLines={1}>
                    {labels.revoke}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
        {onRequestDataDeletion && dataDeletionRequestLabel ? (
          <Pressable
            style={({ pressed }) => [
              styles.privacyRequestButton,
              pressed && styles.privacyRequestButtonPressed,
            ]}
            onPress={() => onRequestDataDeletion(child.id, child.name)}
          >
            <Ionicons name="shield-outline" size={16} color={theme.colors.interactive.primary} />
            <Text style={styles.privacyRequestButtonText} numberOfLines={2}>
              {dataDeletionRequestLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {onDelete && (
        <Pressable
          style={(state: { pressed: boolean }) => [
            styles.deleteButton,
            state.pressed && styles.deleteButtonPressed,
          ]}
          onPress={() => onDelete(child.id, child.name)}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create<{
  cardWrapper: ViewStyle;
  card: ViewStyle;
  imageContainer: ViewStyle;
  image: ImageStyle;
  placeholder: ViewStyle;
  placeholderIcon: TextStyle;
  name: TextStyle;
  subline: TextStyle;
  childModeSection: ViewStyle;
  childModeSectionStandalone: ViewStyle;
  childModeHeader: ViewStyle;
  childModeTitleRow: ViewStyle;
  childModeTitle: TextStyle;
  childModeStatus: TextStyle;
  startChildModeButton: ViewStyle;
  startChildModeButtonDisabled: ViewStyle;
  startChildModeButtonPressed: ViewStyle;
  startChildModeButtonText: TextStyle;
  limitRow: ViewStyle;
  limitField: ViewStyle;
  limitHeaderRow: ViewStyle;
  limitLabel: TextStyle;
  limitValueBadge: ViewStyle;
  limitValueBadgeUnset: ViewStyle;
  limitValueText: TextStyle;
  limitValueTextUnset: TextStyle;
  limitSliderTapArea: ViewStyle;
  limitSliderPressed: ViewStyle;
  limitSliderTrack: ViewStyle;
  limitSliderAvailable: ViewStyle;
  limitSliderFill: ViewStyle;
  limitSliderUnavailable: ViewStyle;
  limitSliderThumb: ViewStyle;
  limitScaleRow: ViewStyle;
  limitScaleText: TextStyle;
  limitBudgetRow: ViewStyle;
  limitBudgetText: TextStyle;
  limitUnsetButton: ViewStyle;
  limitUnsetButtonPressed: ViewStyle;
  limitUnsetButtonText: TextStyle;
  limitHelper: TextStyle;
  controlDisabled: ViewStyle | TextStyle;
  settingRow: ViewStyle;
  settingLabel: TextStyle;
  multiSelectBlock: ViewStyle;
  multiSelectLabel: TextStyle;
  optionChips: ViewStyle;
  optionChip: ViewStyle;
  optionChipSelected: ViewStyle;
  optionChipPressed: ViewStyle;
  optionChipIcon: TextStyle;
  optionChipText: TextStyle;
  optionChipTextSelected: TextStyle;
  optionEmptyText: TextStyle;
  sessionsRow: ViewStyle;
  sessionsText: TextStyle;
  revokeButton: ViewStyle;
  revokeButtonPressed: ViewStyle;
  revokeButtonText: TextStyle;
  privacyRequestButton: ViewStyle;
  privacyRequestButtonPressed: ViewStyle;
  privacyRequestButtonText: TextStyle;
  deleteButton: ViewStyle;
  deleteButtonPressed: ViewStyle;
}>({
  cardWrapper: {
    position: 'relative',
  },
  card: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.lg,
    overflow: 'hidden',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    padding: theme.spacing[6],
  },
  imageContainer: {
    height: 180,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: theme.colors.background.primary,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 64,
  },
  name: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    paddingTop: theme.spacing[4],
  },
  subline: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginTop: theme.spacing[1],
  },
  childModeSection: {
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: theme.colors.border.light,
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    gap: theme.spacing[5],
  },
  childModeSectionStandalone: {
    borderTopWidth: 0,
    marginTop: 0,
    paddingTop: 0,
  },
  childModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[4],
    paddingBottom: theme.spacing[1],
  },
  childModeTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    minWidth: 0,
  },
  childModeTitle: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  childModeStatus: {
    marginTop: -theme.spacing[3],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  startChildModeButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.interactive.primary,
    paddingHorizontal: theme.spacing[4],
  },
  startChildModeButtonDisabled: {
    opacity: 0.55,
  },
  startChildModeButtonPressed: {
    opacity: 0.85,
  },
  startChildModeButtonText: {
    flexShrink: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
    lineHeight: 22,
    textAlign: 'center',
  },
  limitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[4],
  },
  limitField: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing[3],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.neutral[50],
    padding: theme.spacing[3],
  },
  limitHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  limitLabel: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  limitValueBadge: {
    maxWidth: '100%',
    minHeight: 30,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.interactive.primary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitValueBadgeUnset: {
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
  },
  limitValueText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  limitValueTextUnset: {
    color: theme.colors.text.secondary,
  },
  limitSliderTapArea: {
    minHeight: 34,
    justifyContent: 'center',
    outlineStyle: 'none' as any,
  },
  limitSliderPressed: {
    opacity: 0.8,
  },
  limitSliderTrack: {
    height: 10,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.neutral[200],
    position: 'relative',
  },
  limitSliderAvailable: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.primary[100],
  },
  limitSliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.interactive.primary,
  },
  limitSliderUnavailable: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.neutral[300],
  },
  limitSliderThumb: {
    position: 'absolute',
    top: -5,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: theme.borders.radius.full,
    borderWidth: 3,
    borderColor: theme.colors.background.primary,
    backgroundColor: theme.colors.interactive.primary,
    ...Platform.select({
      web: {
        boxShadow: '0 3px 8px rgba(35, 12, 20, 0.2)' as unknown as string,
      },
      android: { elevation: 2 },
      ios: {
        shadowColor: theme.colors.primary[900],
        shadowOpacity: 0.2,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  limitScaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  limitScaleText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
  },
  limitBudgetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  limitBudgetText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
  },
  limitUnsetButton: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.primary,
    paddingHorizontal: theme.spacing[3],
  },
  limitUnsetButtonPressed: {
    opacity: 0.75,
  },
  limitUnsetButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
  },
  limitHelper: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
    lineHeight: 18,
  },
  controlDisabled: {
    opacity: 0.55,
  },
  settingRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[4],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.neutral[50],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  settingLabel: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    lineHeight: 22,
  },
  multiSelectBlock: {
    gap: theme.spacing[3],
  },
  multiSelectLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  optionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  optionChip: {
    minHeight: 40,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.neutral[50],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  optionChipSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  optionChipPressed: {
    opacity: 0.65,
  },
  optionChipIcon: {
    fontSize: theme.typography.fontSize.base,
  },
  optionChipText: {
    flexShrink: 1,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  optionChipTextSelected: {
    color: theme.colors.text.inverse,
  },
  optionEmptyText: {
    flexBasis: '100%',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  sessionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
    minHeight: 52,
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: theme.colors.border.light,
    paddingTop: theme.spacing[4],
  },
  sessionsText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  revokeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.status.error,
    borderRadius: theme.borders.radius.md,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
  revokeButtonPressed: {
    opacity: 0.7,
  },
  revokeButtonText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.status.error,
  },
  privacyRequestButton: {
    minHeight: 38,
    marginTop: theme.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  privacyRequestButtonPressed: {
    opacity: 0.75,
  },
  privacyRequestButtonText: {
    flexShrink: 1,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
    textAlign: 'center',
  },
  deleteButton: {
    position: 'absolute',
    top: theme.spacing[2],
    right: theme.spacing[2],
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    borderRadius: theme.borders.radius.full,
    padding: theme.spacing[2],
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  deleteButtonPressed: {
    backgroundColor: 'rgba(185, 28, 28, 0.9)',
  },
});
