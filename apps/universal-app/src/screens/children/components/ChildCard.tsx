import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Platform,
  Switch,
  TextInput,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/AppButton';
import { theme } from '@/theme';
import { modernColors, modernShadows } from '@/theme/modernTheme';
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
  showChildModeStatus?: boolean;
  showChildModeStartAction?: boolean;
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
  quizGenerationEnabled: boolean;
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
  limitsTitle: string;
  dailyLimit: string;
  monthlyLimit: string;
  noLimit: string;
  limitToggle: string;
  freeText: string;
  freeTextDescription: string;
  audio: string;
  audioDescription: string;
  quizzes: string;
  quizzesDescription: string;
  review: string;
  reviewDescription: string;
  storyGeneration: string;
  storyGenerationDescription: string;
  publicStories: string;
  publicStoriesDescription: string;
  dailyAudioLimit: string;
  themes: string;
  languages: string;
  characters: string;
  siblings: string;
  siblingsDescription: string;
  familyStories: string;
  familyStoriesDescription: string;
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
}

interface ChildModeOption {
  value: string;
  label: string;
  icon?: string;
}

interface ChildModeLimitHints {
  dailyStoryMaxValue?: number | null;
  dailyStoryTotalValue?: number | null;
  dailyStoryReservedValue?: number | null;
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
  quizGenerationEnabled: true,
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

function getSafeLimit(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

interface LimitNumberFieldProps {
  label: string;
  nativeID: string;
  value: number | null;
  unsetLabel: string;
  maxValue?: number | null;
  totalValue?: number | null;
  defaultMax: number;
  disabled?: boolean;
  enabledLabel: string;
  onCommit: (value: number | null) => void;
}

const LimitNumberField = memo(function LimitNumberField({
  label,
  nativeID,
  value,
  unsetLabel,
  maxValue,
  totalValue,
  defaultMax,
  disabled,
  enabledLabel,
  onCommit,
}: LimitNumberFieldProps) {
  const totalMax = Math.max(1, getSafeLimit(totalValue, getSafeLimit(maxValue, defaultMax)));
  const availableMax = Math.max(0, Math.min(totalMax, getSafeLimit(maxValue, totalMax)));
  const minValue = availableMax > 0 ? 1 : 0;
  const effectiveValue =
    value === null ? minValue : Math.max(minValue, Math.min(availableMax, Math.floor(value)));
  const isUnset = value === null;
  const fieldDisabled = disabled || isUnset || availableMax <= 0;
  const canDecrease = !fieldDisabled && !isUnset && effectiveValue > minValue;
  const canIncrease = !fieldDisabled && (isUnset || effectiveValue < availableMax);
  const [draftValue, setDraftValue] = useState(isUnset ? '' : String(effectiveValue));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(isUnset ? '' : String(effectiveValue));
    }
  }, [effectiveValue, isEditing, isUnset]);

  const commitNumber = (nextValue: number) => {
    if (disabled) return;
    const clampedValue = Math.max(minValue, Math.min(availableMax, Math.floor(nextValue)));
    setDraftValue(String(clampedValue));
    onCommit(clampedValue);
  };

  const handleToggle = () => {
    if (disabled) return;
    setDraftValue(isUnset ? String(minValue) : '');
    onCommit(isUnset ? minValue : null);
  };

  const handleTextChange = (text: string) => {
    if (fieldDisabled) return;
    const digits = text.replace(/\D/g, '');
    setDraftValue(digits);
  };

  const commitDraft = () => {
    setIsEditing(false);
    if (fieldDisabled) return;
    if (!draftValue) {
      setDraftValue(String(minValue));
      onCommit(minValue);
      return;
    }
    commitNumber(Number(draftValue));
  };

  return (
    <View style={styles.limitField}>
      <View style={styles.limitHeaderRow}>
        <Text style={styles.limitLabel}>{label}</Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.limitToggleRow,
          pressed && !disabled && styles.limitToggleRowPressed,
          disabled && styles.controlDisabled,
        ]}
        disabled={disabled}
        onPress={handleToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !isUnset, disabled }}
      >
        <View style={[styles.limitCheckbox, !isUnset && styles.limitCheckboxChecked]}>
          {!isUnset ? (
            <Ionicons name="checkmark" size={15} color={theme.colors.text.inverse} />
          ) : null}
        </View>
        <Text style={styles.limitToggleText}>{enabledLabel}</Text>
      </Pressable>

      {!isUnset ? (
        <View
          nativeID={nativeID}
          style={[styles.limitNumberControl, fieldDisabled && styles.controlDisabled]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.limitStepperButton,
              pressed && canDecrease && styles.limitStepperButtonPressed,
              !canDecrease && styles.limitStepperButtonDisabled,
            ]}
            disabled={!canDecrease}
            onPress={() => commitNumber(effectiveValue - 1)}
            accessibilityRole="button"
            accessibilityLabel={`${label} -1`}
          >
            <Ionicons name="remove" size={17} color={theme.colors.text.secondary} />
          </Pressable>
          <TextInput
            style={styles.limitNumberInput}
            value={draftValue}
            editable={!fieldDisabled}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder={unsetLabel}
            placeholderTextColor={theme.colors.text.tertiary}
            onChangeText={handleTextChange}
            onFocus={() => setIsEditing(true)}
            onBlur={commitDraft}
            onSubmitEditing={commitDraft}
            accessibilityLabel={label}
          />
          <Pressable
            style={({ pressed }) => [
              styles.limitStepperButton,
              pressed && canIncrease && styles.limitStepperButtonPressed,
              !canIncrease && styles.limitStepperButtonDisabled,
            ]}
            disabled={!canIncrease}
            onPress={() => commitNumber(isUnset ? minValue : effectiveValue + 1)}
            accessibilityRole="button"
            accessibilityLabel={`${label} +1`}
          >
            <Ionicons name="add" size={17} color={theme.colors.text.secondary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

function SettingSwitch({
  label,
  description,
  value,
  disabled,
  onValueChange,
  testID,
}: {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description ? <Text style={styles.settingDescription}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        testID={testID}
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
  testIDPrefix,
}: {
  label: string;
  selectedValues: string[];
  options: ChildModeOption[];
  allLabel: string;
  emptyText?: string;
  disabled?: boolean;
  onChange: (value: string[]) => void;
  testIDPrefix?: string;
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
          testID={testIDPrefix ? `${testIDPrefix}-all` : undefined}
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
              testID={testIDPrefix ? `${testIDPrefix}-option-${option.value}` : undefined}
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
  showChildModeStatus = true,
  showChildModeStartAction = true,
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
  const imageContainerWebStyle: ViewStyle | null =
    Platform.OS === 'web' ? { filter: 'contrast(1.05)' } : null;
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
  const controlsDisabled = !onChildModeSettingsChange;
  const labels = childModeLabels;
  const childModeSwitchDisabled = isChildModeUpdating || !onChildModeEnabledChange;
  const childModeStatusText = labels
    ? !childModeEnabled
      ? labels.accessDisabled
      : childModePasscodeConfigured
        ? labels.readyToStart
        : `${labels.accessAllowed} · ${labels.passwordNeeded}`
    : '';
  const handleDailyGenerationLimitCommit = useCallback(
    (dailyGenerationLimit: number | null) => {
      onChildModeSettingsChange?.(child.id, { dailyGenerationLimit });
    },
    [child.id, onChildModeSettingsChange]
  );
  const handleMonthlyGenerationLimitCommit = useCallback(
    (monthlyGenerationLimit: number | null) => {
      onChildModeSettingsChange?.(child.id, { monthlyGenerationLimit });
    },
    [child.id, onChildModeSettingsChange]
  );
  const handleDailyAudioGenerationLimitCommit = useCallback(
    (dailyAudioGenerationLimit: number | null) => {
      onChildModeSettingsChange?.(child.id, { dailyAudioGenerationLimit });
    },
    [child.id, onChildModeSettingsChange]
  );

  return (
    <View style={styles.cardWrapper} testID={`child-card-${child.id}`}>
      <View style={styles.card}>
        {showProfileSummary ? (
          <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            testID={`child-card-open-${child.id}`}
          >
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
                testID={`child-mode-enable-${child.id}`}
                trackColor={{
                  false: theme.colors.background.tertiary,
                  true: theme.colors.interactive.secondary,
                }}
                thumbColor={
                  childModeEnabled ? theme.colors.interactive.primary : theme.colors.text.inverse
                }
              />
            </View>

            {showChildModeStatus ? (
              <Text style={styles.childModeStatus}>{childModeStatusText}</Text>
            ) : null}

            {showChildModeStartAction ? (
              <AppButton
                label={
                  childModeEnabled
                    ? !childModePasscodeConfigured
                      ? labels.setPasscodeToStart
                      : isEnteringChildMode
                        ? labels.starting
                        : labels.start
                    : labels.enableToStart
                }
                disabled={
                  !childModeEnabled ||
                  !childModePasscodeConfigured ||
                  isEnteringChildMode ||
                  !onEnterChildMode
                }
                loading={isEnteringChildMode}
                onPress={() => onEnterChildMode?.(child.id, child.name)}
                testID={`child-mode-start-${child.id}`}
                leading={
                  <Ionicons
                    name="play-circle-outline"
                    size={18}
                    color={theme.colors.text.inverse}
                  />
                }
              />
            ) : null}

            <View style={styles.limitsPanel}>
              <Text style={styles.limitsTitle}>{labels.limitsTitle}</Text>
              <View style={styles.limitRow}>
                <LimitNumberField
                  label={labels.dailyLimit}
                  nativeID={`child-mode-${child.id}-daily-limit`}
                  value={childModeSettings.dailyGenerationLimit}
                  unsetLabel={labels.noLimit}
                  maxValue={childModeLimitHints?.dailyStoryMaxValue}
                  totalValue={childModeLimitHints?.dailyStoryTotalValue}
                  defaultMax={100}
                  disabled={controlsDisabled}
                  enabledLabel={labels.limitToggle}
                  onCommit={handleDailyGenerationLimitCommit}
                />
                <LimitNumberField
                  label={labels.monthlyLimit}
                  nativeID={`child-mode-${child.id}-monthly-limit`}
                  value={childModeSettings.monthlyGenerationLimit}
                  unsetLabel={labels.noLimit}
                  maxValue={childModeLimitHints?.monthlyStoryMaxValue}
                  totalValue={childModeLimitHints?.monthlyStoryTotalValue}
                  defaultMax={1000}
                  disabled={controlsDisabled}
                  enabledLabel={labels.limitToggle}
                  onCommit={handleMonthlyGenerationLimitCommit}
                />
                <LimitNumberField
                  label={labels.dailyAudioLimit}
                  nativeID={`child-mode-${child.id}-daily-audio-limit`}
                  value={childModeSettings.dailyAudioGenerationLimit}
                  unsetLabel={labels.noLimit}
                  maxValue={childModeLimitHints?.dailyAudioMaxValue}
                  totalValue={childModeLimitHints?.dailyAudioTotalValue}
                  defaultMax={100}
                  disabled={controlsDisabled}
                  enabledLabel={labels.limitToggle}
                  onCommit={handleDailyAudioGenerationLimitCommit}
                />
              </View>
            </View>

            <SettingSwitch
              label={labels.storyGeneration}
              description={labels.storyGenerationDescription}
              value={childModeSettings.storyGenerationEnabled}
              disabled={controlsDisabled}
              onValueChange={(storyGenerationEnabled) =>
                onChildModeSettingsChange?.(child.id, { storyGenerationEnabled })
              }
              testID={`child-mode-setting-${child.id}-story-generation`}
            />
            <SettingSwitch
              label={labels.publicStories}
              description={labels.publicStoriesDescription}
              value={childModeSettings.publicStoriesEnabled}
              disabled={controlsDisabled}
              onValueChange={(publicStoriesEnabled) =>
                onChildModeSettingsChange?.(child.id, { publicStoriesEnabled })
              }
              testID={`child-mode-setting-${child.id}-public-stories`}
            />
            <SettingSwitch
              label={labels.freeText}
              description={labels.freeTextDescription}
              value={childModeSettings.freeTextPromptsEnabled}
              disabled={controlsDisabled}
              onValueChange={(freeTextPromptsEnabled) =>
                onChildModeSettingsChange?.(child.id, { freeTextPromptsEnabled })
              }
              testID={`child-mode-setting-${child.id}-free-text`}
            />
            <SettingSwitch
              label={labels.audio}
              description={labels.audioDescription}
              value={childModeSettings.audioGenerationEnabled}
              disabled={controlsDisabled}
              onValueChange={(audioGenerationEnabled) =>
                onChildModeSettingsChange?.(child.id, { audioGenerationEnabled })
              }
              testID={`child-mode-setting-${child.id}-audio`}
            />
            <SettingSwitch
              label={labels.quizzes}
              description={labels.quizzesDescription}
              value={childModeSettings.quizGenerationEnabled}
              disabled={controlsDisabled}
              onValueChange={(quizGenerationEnabled) =>
                onChildModeSettingsChange?.(child.id, { quizGenerationEnabled })
              }
              testID={`child-mode-setting-${child.id}-quizzes`}
            />
            <SettingSwitch
              label={labels.review}
              description={labels.reviewDescription}
              value={childModeSettings.parentReviewRequired}
              disabled={controlsDisabled}
              onValueChange={(parentReviewRequired) =>
                onChildModeSettingsChange?.(child.id, { parentReviewRequired })
              }
              testID={`child-mode-setting-${child.id}-parent-review`}
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
              testIDPrefix={`child-mode-themes-${child.id}`}
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
              testIDPrefix={`child-mode-languages-${child.id}`}
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
              testIDPrefix={`child-mode-characters-${child.id}`}
            />
            <SettingSwitch
              label={labels.siblings}
              description={labels.siblingsDescription}
              value={childModeSettings.allowSiblingCharacters}
              disabled={controlsDisabled}
              onValueChange={(allowSiblingCharacters) =>
                onChildModeSettingsChange?.(child.id, { allowSiblingCharacters })
              }
              testID={`child-mode-setting-${child.id}-siblings`}
            />
            <SettingSwitch
              label={labels.familyStories}
              description={labels.familyStoriesDescription}
              value={childModeSettings.allowSharedFamilyStories}
              disabled={controlsDisabled}
              onValueChange={(allowSharedFamilyStories) =>
                onChildModeSettingsChange?.(child.id, { allowSharedFamilyStories })
              }
              testID={`child-mode-setting-${child.id}-family-stories`}
            />

            <View style={styles.sessionsRow}>
              <Text style={styles.sessionsText} numberOfLines={1}>
                {labels.activeSessions}: {activeSessionCount}
              </Text>
              {activeSessionCount > 0 && onRevokeChildModeSessions ? (
                <AppButton
                  label={labels.revoke}
                  disabled={isRevokingChildSessions}
                  onPress={() => onRevokeChildModeSessions(child.id, child.name)}
                  variant="dangerSecondary"
                  size="sm"
                  testID={`child-mode-revoke-sessions-${child.id}`}
                  leading={
                    <Ionicons name="log-out-outline" size={15} color={theme.colors.status.error} />
                  }
                />
              ) : null}
            </View>
          </View>
        ) : null}
        {onRequestDataDeletion && dataDeletionRequestLabel ? (
          <AppButton
            label={dataDeletionRequestLabel}
            onPress={() => onRequestDataDeletion(child.id, child.name)}
            variant="secondary"
            size="sm"
            leading={
              <Ionicons name="shield-outline" size={16} color={theme.colors.interactive.primary} />
            }
            style={styles.privacyRequestAction}
          />
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
  limitsPanel: ViewStyle;
  limitsTitle: TextStyle;
  limitRow: ViewStyle;
  limitField: ViewStyle;
  limitHeaderRow: ViewStyle;
  limitLabel: TextStyle;
  limitToggleRow: ViewStyle;
  limitToggleRowPressed: ViewStyle;
  limitCheckbox: ViewStyle;
  limitCheckboxChecked: ViewStyle;
  limitToggleText: TextStyle;
  limitNumberControl: ViewStyle;
  limitStepperButton: ViewStyle;
  limitStepperButtonPressed: ViewStyle;
  limitStepperButtonDisabled: ViewStyle;
  limitNumberInput: TextStyle;
  controlDisabled: ViewStyle | TextStyle;
  settingRow: ViewStyle;
  settingCopy: ViewStyle;
  settingLabel: TextStyle;
  settingDescription: TextStyle;
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
  privacyRequestAction: ViewStyle;
  deleteButton: ViewStyle;
  deleteButtonPressed: ViewStyle;
}>({
  cardWrapper: {
    position: 'relative',
  },
  card: {
    backgroundColor: modernColors.surface,
    borderRadius: theme.borders.radius.lg,
    overflow: 'hidden',
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    padding: theme.spacing[6],
    ...modernShadows.card,
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
  limitsPanel: {
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
  limitsTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
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
  limitToggleRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  limitToggleRowPressed: {
    opacity: 0.75,
  },
  limitCheckbox: {
    width: 22,
    height: 22,
    borderRadius: theme.borders.radius.sm,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitCheckboxChecked: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  limitToggleText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    lineHeight: 20,
  },
  limitNumberControl: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.primary,
    overflow: 'hidden',
  },
  limitStepperButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.neutral[50],
  },
  limitStepperButtonPressed: {
    backgroundColor: theme.colors.primary[50],
  },
  limitStepperButtonDisabled: {
    opacity: 0.35,
  },
  limitNumberInput: {
    flex: 1,
    minWidth: 64,
    height: 44,
    textAlign: 'center',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    outlineWidth: 0,
  },
  controlDisabled: {
    opacity: 0.55,
  },
  settingRow: {
    minHeight: 64,
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
  settingCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  settingLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    lineHeight: 22,
  },
  settingDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 19,
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
  privacyRequestAction: {
    marginTop: theme.spacing[4],
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
