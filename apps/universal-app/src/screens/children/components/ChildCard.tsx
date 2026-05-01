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
  childModeActiveSessionCount?: number;
}

interface Props {
  child: Child;
  onPress: () => void;
  onDelete?: (childId: string, childName: string) => void;
  childModeLabels?: ChildModeLabels;
  onChildModeEnabledChange?: (childId: string, enabled: boolean) => void;
  onChildModeSettingsChange?: (childId: string, settings: Partial<ChildModeSettings>) => void;
  onEnterChildMode?: (childId: string, childName: string) => void;
  onRevokeChildModeSessions?: (childId: string, childName: string) => void;
  isChildModeUpdating?: boolean;
  isEnteringChildMode?: boolean;
  isRevokingChildSessions?: boolean;
}

interface ChildModeSettings {
  dailyGenerationLimit: number | null;
  monthlyGenerationLimit: number | null;
  freeTextPromptsEnabled: boolean;
  audioGenerationEnabled: boolean;
  parentReviewRequired: boolean;
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
  familyStories: string;
  activeSessions: string;
  revoke: string;
  start: string;
  starting: string;
  enableToStart: string;
}

const DEFAULT_CHILD_MODE_SETTINGS: ChildModeSettings = {
  dailyGenerationLimit: null,
  monthlyGenerationLimit: null,
  freeTextPromptsEnabled: false,
  audioGenerationEnabled: false,
  parentReviewRequired: true,
  allowSharedFamilyStories: false,
};

function normalizeChildModeSettings(settings?: Partial<ChildModeSettings>): ChildModeSettings {
  return {
    ...DEFAULT_CHILD_MODE_SETTINGS,
    ...(settings || {}),
  };
}

function LimitInput({
  label,
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  label: string;
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

export function ChildCard({
  child,
  onPress,
  onDelete,
  childModeLabels,
  onChildModeEnabledChange,
  onChildModeSettingsChange,
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
  const activeSessionCount = child.childModeActiveSessionCount ?? 0;
  const controlsDisabled = isChildModeUpdating || !onChildModeSettingsChange;
  const labels = childModeLabels;

  return (
    <View style={styles.cardWrapper}>
      <View style={styles.card}>
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

        {labels ? (
          <View style={styles.childModeSection}>
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
                disabled={isChildModeUpdating || !onChildModeEnabledChange}
                onValueChange={(enabled) => onChildModeEnabledChange?.(child.id, enabled)}
                trackColor={{ false: theme.colors.background.tertiary, true: theme.colors.interactive.secondary }}
                thumbColor={childModeEnabled ? theme.colors.interactive.primary : theme.colors.text.inverse}
              />
            </View>

            <Text style={styles.childModeStatus} numberOfLines={1}>
              {childModeEnabled ? labels.enabled : labels.disabled}
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.startChildModeButton,
                (!childModeEnabled || isEnteringChildMode || !onEnterChildMode) && styles.startChildModeButtonDisabled,
                pressed && childModeEnabled && !isEnteringChildMode && styles.startChildModeButtonPressed,
              ]}
              disabled={!childModeEnabled || isEnteringChildMode || !onEnterChildMode}
              onPress={() => onEnterChildMode?.(child.id, child.name)}
            >
              <Ionicons
                name={isEnteringChildMode ? 'hourglass-outline' : 'play-circle-outline'}
                size={18}
                color={theme.colors.text.inverse}
              />
              <Text style={styles.startChildModeButtonText} numberOfLines={1}>
                {childModeEnabled
                  ? isEnteringChildMode ? labels.starting : labels.start
                  : labels.enableToStart}
              </Text>
            </Pressable>

            <View style={styles.limitRow}>
              <LimitInput
                label={labels.dailyLimit}
                value={childModeSettings.dailyGenerationLimit}
                placeholder={labels.noLimit}
                disabled={controlsDisabled}
                onCommit={(dailyGenerationLimit) => onChildModeSettingsChange?.(child.id, { dailyGenerationLimit })}
              />
              <LimitInput
                label={labels.monthlyLimit}
                value={childModeSettings.monthlyGenerationLimit}
                placeholder={labels.noLimit}
                disabled={controlsDisabled}
                onCommit={(monthlyGenerationLimit) => onChildModeSettingsChange?.(child.id, { monthlyGenerationLimit })}
              />
            </View>

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
            <SettingSwitch
              label={labels.familyStories}
              value={childModeSettings.allowSharedFamilyStories}
              disabled={controlsDisabled}
              onValueChange={(allowSharedFamilyStories) => onChildModeSettingsChange?.(child.id, { allowSharedFamilyStories })}
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
  controlDisabled: ViewStyle | TextStyle;
  settingRow: ViewStyle;
  settingLabel: TextStyle;
  sessionsRow: ViewStyle;
  sessionsText: TextStyle;
  revokeButton: ViewStyle;
  revokeButtonPressed: ViewStyle;
  revokeButtonText: TextStyle;
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
