import React, { useEffect, useState } from 'react';
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
  showProfileSummary?: boolean;
  onChildModeEnabledChange?: (childId: string, enabled: boolean, passcode?: string) => void;
  onChildModeSettingsChange?: (childId: string, settings: Partial<ChildModeSettings>) => void;
  onChildModePasscodeChange?: (childId: string, passcode: string) => void;
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
  passcode: string;
  passcodePlaceholder: string;
  passcodeConfigured: string;
  passcodeSave: string;
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

function LimitInput({
  label,
  nativeID,
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  label: string;
  nativeID: string;
  value: number | null;
  placeholder: string;
  disabled?: boolean;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));

  useEffect(() => {
    setDraft(value === null ? '' : String(value));
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      onCommit(null);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    onCommit(Number.isFinite(parsed) && parsed >= 0 ? parsed : value);
  };

  return (
    <View style={styles.limitField}>
      <Text style={styles.limitLabel} numberOfLines={1}>{label}</Text>
      <TextInput
        nativeID={nativeID}
        style={[styles.limitInput, disabled && styles.controlDisabled]}
        value={draft}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.text.tertiary}
        keyboardType="number-pad"
        editable={!disabled}
        maxLength={4}
        onChangeText={(next) => setDraft(next.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onSubmitEditing={commit}
      />
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
      <Text style={styles.settingLabel} numberOfLines={2}>{label}</Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.background.tertiary, true: theme.colors.interactive.secondary }}
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
      <Text style={styles.multiSelectLabel} numberOfLines={1}>{label}</Text>
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
            numberOfLines={1}
          >
            {allLabel}
          </Text>
        </Pressable>
        {options.length === 0 && emptyText ? (
          <Text style={styles.optionEmptyText} numberOfLines={2}>{emptyText}</Text>
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
              <Text
                style={[styles.optionChipText, selected && styles.optionChipTextSelected]}
                numberOfLines={1}
              >
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
  showProfileSummary = true,
  onChildModeEnabledChange,
  onChildModeSettingsChange,
  onChildModePasscodeChange,
  onEnterChildMode,
  onRevokeChildModeSessions,
  isChildModeUpdating,
  isEnteringChildMode,
  isRevokingChildSessions,
}: Props) {
  const avatarUrl =
    child.turnaroundSheet?.frontUrl ?? child.turnaroundSheet?.url ?? child.referencePhotos?.[0]?.url;
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
  const passcodeDisabled = isChildModeUpdating || !onChildModePasscodeChange;
  const labels = childModeLabels;
  const [passcodeDraft, setPasscodeDraft] = useState('');
  const passcodeReadyForEnable = childModePasscodeConfigured || passcodeDraft.trim().length >= 4;
  const childModeSwitchDisabled =
    isChildModeUpdating || !onChildModeEnabledChange || (!childModeEnabled && !passcodeReadyForEnable);

  const commitPasscode = () => {
    const passcode = passcodeDraft.trim();
    if (passcode.length >= 4) {
      onChildModePasscodeChange?.(child.id, passcode);
      setPasscodeDraft('');
    }
  };

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
          <View style={[styles.childModeSection, !showProfileSummary && styles.childModeSectionStandalone]}>
            <View style={styles.childModeHeader}>
              <View style={styles.childModeTitleRow}>
                <Ionicons
                  name={childModeEnabled ? 'shield-checkmark' : 'shield-outline'}
                  size={18}
                  color={childModeEnabled ? theme.colors.status.success : theme.colors.text.tertiary}
                />
                <Text style={styles.childModeTitle} numberOfLines={1}>{labels.title}</Text>
              </View>
              <Switch
                value={childModeEnabled}
                disabled={childModeSwitchDisabled}
                onValueChange={(enabled) => onChildModeEnabledChange?.(
                  child.id,
                  enabled,
                  passcodeDraft.trim() || undefined
                )}
                trackColor={{ false: theme.colors.background.tertiary, true: theme.colors.interactive.secondary }}
                thumbColor={childModeEnabled ? theme.colors.interactive.primary : theme.colors.text.inverse}
              />
            </View>

            <Text style={styles.childModeStatus} numberOfLines={1}>
              {childModeEnabled
                ? `${labels.enabled} · ${childModePasscodeConfigured ? labels.passcodeConfigured : labels.setPasscodeToStart}`
                : childModePasscodeConfigured ? labels.passcodeConfigured : labels.disabled}
            </Text>

            <View style={styles.passcodeRow}>
              <View style={styles.passcodeField}>
                <Text style={styles.limitLabel} numberOfLines={1}>{labels.passcode}</Text>
                <TextInput
                  nativeID={`child-mode-${child.id}-passcode`}
                  style={[styles.limitInput, passcodeDisabled && styles.controlDisabled]}
                  value={passcodeDraft}
                  placeholder={labels.passcodePlaceholder}
                  placeholderTextColor={theme.colors.text.tertiary}
                  secureTextEntry
                  editable={!passcodeDisabled}
                  maxLength={128}
                  onChangeText={setPasscodeDraft}
                  onSubmitEditing={commitPasscode}
                />
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.passcodeSaveButton,
                  (pressed || passcodeDraft.trim().length < 4 || passcodeDisabled) && styles.optionChipPressed,
                ]}
                disabled={passcodeDraft.trim().length < 4 || passcodeDisabled}
                onPress={commitPasscode}
              >
                <Text style={styles.passcodeSaveText} numberOfLines={1}>{labels.passcodeSave}</Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.startChildModeButton,
                (!childModeEnabled || !childModePasscodeConfigured || isEnteringChildMode || !onEnterChildMode) && styles.startChildModeButtonDisabled,
                pressed && childModeEnabled && !isEnteringChildMode && styles.startChildModeButtonPressed,
              ]}
              disabled={!childModeEnabled || !childModePasscodeConfigured || isEnteringChildMode || !onEnterChildMode}
              onPress={() => onEnterChildMode?.(child.id, child.name)}
            >
              <Ionicons
                name={isEnteringChildMode ? 'hourglass-outline' : 'play-circle-outline'}
                size={18}
                color={theme.colors.text.inverse}
              />
              <Text style={styles.startChildModeButtonText} numberOfLines={1}>
                {childModeEnabled
                  ? !childModePasscodeConfigured ? labels.setPasscodeToStart : isEnteringChildMode ? labels.starting : labels.start
                  : labels.enableToStart}
              </Text>
            </Pressable>

            <View style={styles.limitRow}>
              <LimitInput
                label={labels.dailyLimit}
                nativeID={`child-mode-${child.id}-daily-limit`}
                value={childModeSettings.dailyGenerationLimit}
                placeholder={labels.noLimit}
                disabled={controlsDisabled}
                onCommit={(dailyGenerationLimit) => onChildModeSettingsChange?.(child.id, { dailyGenerationLimit })}
              />
              <LimitInput
                label={labels.monthlyLimit}
                nativeID={`child-mode-${child.id}-monthly-limit`}
                value={childModeSettings.monthlyGenerationLimit}
                placeholder={labels.noLimit}
                disabled={controlsDisabled}
                onCommit={(monthlyGenerationLimit) => onChildModeSettingsChange?.(child.id, { monthlyGenerationLimit })}
              />
            </View>
            <View style={styles.limitRow}>
              <LimitInput
                label={labels.dailyAudioLimit}
                nativeID={`child-mode-${child.id}-daily-audio-limit`}
                value={childModeSettings.dailyAudioGenerationLimit}
                placeholder={labels.noLimit}
                disabled={controlsDisabled}
                onCommit={(dailyAudioGenerationLimit) => onChildModeSettingsChange?.(child.id, { dailyAudioGenerationLimit })}
              />
            </View>

            <SettingSwitch
              label={labels.storyGeneration}
              value={childModeSettings.storyGenerationEnabled}
              disabled={controlsDisabled}
              onValueChange={(storyGenerationEnabled) => onChildModeSettingsChange?.(child.id, { storyGenerationEnabled })}
            />
            <SettingSwitch
              label={labels.publicStories}
              value={childModeSettings.publicStoriesEnabled}
              disabled={controlsDisabled}
              onValueChange={(publicStoriesEnabled) => onChildModeSettingsChange?.(child.id, { publicStoriesEnabled })}
            />
            <SettingSwitch
              label={labels.freeText}
              value={childModeSettings.freeTextPromptsEnabled}
              disabled={controlsDisabled}
              onValueChange={(freeTextPromptsEnabled) => onChildModeSettingsChange?.(child.id, { freeTextPromptsEnabled })}
            />
            <SettingSwitch
              label={labels.audio}
              value={childModeSettings.audioGenerationEnabled}
              disabled={controlsDisabled}
              onValueChange={(audioGenerationEnabled) => onChildModeSettingsChange?.(child.id, { audioGenerationEnabled })}
            />
            <SettingSwitch
              label={labels.review}
              value={childModeSettings.parentReviewRequired}
              disabled={controlsDisabled}
              onValueChange={(parentReviewRequired) => onChildModeSettingsChange?.(child.id, { parentReviewRequired })}
            />
            <MultiSelectChips
              label={labels.themes}
              selectedValues={childModeSettings.allowedThemeSlugs}
              options={childModeThemeOptions}
              allLabel={labels.anyTheme}
              disabled={controlsDisabled}
              onChange={(allowedThemeSlugs) => onChildModeSettingsChange?.(child.id, { allowedThemeSlugs })}
            />
            <MultiSelectChips
              label={labels.languages}
              selectedValues={childModeSettings.allowedLanguageCodes}
              options={childModeLanguageOptions}
              allLabel={labels.anyLanguage}
              disabled={controlsDisabled}
              onChange={(allowedLanguageCodes) => onChildModeSettingsChange?.(child.id, { allowedLanguageCodes })}
            />
            <MultiSelectChips
              label={labels.characters}
              selectedValues={childModeSettings.allowedCharacterIds}
              options={childModeCharacterOptions}
              allLabel={labels.anyCharacter}
              emptyText={labels.noCharacters}
              disabled={controlsDisabled}
              onChange={(allowedCharacterIds) => onChildModeSettingsChange?.(child.id, { allowedCharacterIds })}
            />
            <SettingSwitch
              label={labels.siblings}
              value={childModeSettings.allowSiblingCharacters}
              disabled={controlsDisabled}
              onValueChange={(allowSiblingCharacters) => onChildModeSettingsChange?.(child.id, { allowSiblingCharacters })}
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
                  <Text style={styles.revokeButtonText} numberOfLines={1}>{labels.revoke}</Text>
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
  limitLabel: TextStyle;
  limitInput: TextStyle;
  passcodeRow: ViewStyle;
  passcodeField: ViewStyle;
  passcodeSaveButton: ViewStyle;
  passcodeSaveText: TextStyle;
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
    gap: theme.spacing[3],
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
    gap: theme.spacing[3],
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
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  childModeStatus: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
  },
  startChildModeButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.interactive.primary,
    paddingHorizontal: theme.spacing[3],
  },
  startChildModeButtonDisabled: {
    opacity: 0.55,
  },
  startChildModeButtonPressed: {
    opacity: 0.85,
  },
  startChildModeButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  limitRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
  },
  limitField: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  limitLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.secondary,
  },
  limitInput: {
    minHeight: 38,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    paddingHorizontal: theme.spacing[3],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.secondary,
    outlineStyle: 'none' as any,
  },
  passcodeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing[2],
  },
  passcodeField: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  passcodeSaveButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.tertiary,
    paddingHorizontal: theme.spacing[3],
  },
  passcodeSaveText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  controlDisabled: {
    opacity: 0.55,
  },
  settingRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  settingLabel: {
    flex: 1,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.secondary,
    lineHeight: 16,
  },
  multiSelectBlock: {
    gap: theme.spacing[2],
  },
  multiSelectLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
  },
  optionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  optionChip: {
    minHeight: 30,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  optionChipSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  optionChipPressed: {
    opacity: 0.65,
  },
  optionChipIcon: {
    fontSize: theme.typography.fontSize.sm,
  },
  optionChipText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  optionChipTextSelected: {
    color: theme.colors.text.inverse,
  },
  optionEmptyText: {
    flexBasis: '100%',
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
  },
  sessionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
    minHeight: 34,
  },
  sessionsText: {
    flex: 1,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
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
