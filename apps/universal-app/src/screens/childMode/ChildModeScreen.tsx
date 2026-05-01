import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  IMAGE_STYLE_METADATA,
  IMAGE_STYLES,
  SUPPORTED_LANGUAGES,
  isValidLocale,
  type Locale,
} from '@wondertales/shared';
import { useLogout, useParentGate } from '@/api/auth';
import { useStoryThemes } from '@/api/dictionaries';
import { useCreateChildModeStory, useStoryStatus } from '@/api/stories';
import i18n from '@/config/i18n';
import { APP_CONFIG } from '@/config/constants';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function getParentGateErrorMessage(t: Translate, error: unknown): string {
  const err = error as { response?: { status?: number; data?: { code?: string } } };
  const code = err.response?.data?.code;
  if (code === 'PARENT_GATE_PASSWORD_UNAVAILABLE') {
    return t('child_mode.parent_gate_unavailable');
  }
  if (err.response?.status === 401 || code === 'PARENT_GATE_FAILED') {
    return t('child_mode.parent_gate_wrong_password');
  }
  return t('child_mode.parent_gate_failed');
}

function getChildStoryErrorMessage(t: Translate, error: unknown): string {
  const err = error as {
    response?: {
      status?: number;
      data?: {
        code?: string;
        message?: string;
      };
    };
  };
  const code = err.response?.data?.code;

  if (code === 'CHILD_FREE_TEXT_DISABLED') return t('child_mode.story_error_free_text_disabled');
  if (code === 'CHILD_THEME_NOT_ALLOWED') return t('child_mode.story_error_theme_not_allowed');
  if (code === 'CHILD_LANGUAGE_NOT_ALLOWED') return t('child_mode.story_error_language_not_allowed');
  if (code === 'CHILD_DAILY_LIMIT_REACHED') return t('child_mode.story_error_daily_limit');
  if (code === 'CHILD_MONTHLY_LIMIT_REACHED') return t('child_mode.story_error_monthly_limit');
  if (code === 'CHILD_MODE_DISABLED') return t('child_mode.story_error_disabled');
  if (code === 'CHILD_PROFILE_MISMATCH') return t('child_mode.story_error_profile_mismatch');
  if (code === 'PROMPT_SAFETY_BLOCKED' || code === 'PROMPT_SAFETY_REJECTED') {
    return t('child_mode.story_error_safety');
  }
  if (err.response?.status === 429) return t('child_mode.story_error_limit');
  return err.response?.data?.message || t('child_mode.story_error_generic');
}

function normalizeLocale(value: string | undefined, fallback: Locale = 'uk'): Locale {
  const normalized = value?.split('-')[0]?.toLowerCase() || '';
  return isValidLocale(normalized) ? normalized : fallback;
}

export default function ChildModeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const activeChild = useAuthStore((state) => state.activeChild);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionMode = useAuthStore((state) => state.sessionMode);
  const user = useAuthStore((state) => state.user);
  const parentGate = useParentGate();
  const logout = useLogout();
  const createChildStory = useCreateChildModeStory();
  const { data: themesData, isLoading: themesLoading } = useStoryThemes();

  const settings = activeChild?.childMode?.childModeSettings;
  const freeTextEnabled = settings?.freeTextPromptsEnabled === true;
  const reviewRequired = settings?.parentReviewRequired !== false;
  const childName = activeChild?.name || t('child_mode.child_fallback_name');

  const allowedLanguages = useMemo<Locale[]>(() => {
    const configured = settings?.allowedLanguageCodes ?? [];
    const source = configured.length > 0 ? configured : APP_CONFIG.supportedLanguages;
    const normalized = source
      .map((code) => normalizeLocale(code))
      .filter((code, index, all) => all.indexOf(code) === index);
    return normalized.length > 0 ? normalized : [APP_CONFIG.defaultLanguage];
  }, [settings?.allowedLanguageCodes]);

  const defaultLanguage = useMemo(() => {
    const uiLocale = normalizeLocale(i18n.language, APP_CONFIG.defaultLanguage);
    return allowedLanguages.includes(uiLocale) ? uiLocale : allowedLanguages[0];
  }, [allowedLanguages]);

  const goalOptions = useMemo(() => {
    const allowedSlugs = settings?.allowedThemeSlugs ?? [];
    const goals = themesData?.goals ?? [];
    const filteredGoals = allowedSlugs.length > 0
      ? goals.filter((goal) => allowedSlugs.includes(goal.slug))
      : goals;

    if (filteredGoals.length > 0) {
      return filteredGoals.map((goal) => ({ slug: goal.slug, name: goal.name }));
    }

    return allowedSlugs.map((slug) => ({
      slug,
      name: t(`story.goal_${slug}`, { defaultValue: slug.replace(/_/g, ' ') }),
    }));
  }, [settings?.allowedThemeSlugs, themesData?.goals, t]);

  const imageStyleOptions = useMemo(
    () =>
      IMAGE_STYLES.map((slug) => ({
        slug,
        icon: IMAGE_STYLE_METADATA[slug].icon,
        name: t(IMAGE_STYLE_METADATA[slug].i18nKey),
      })),
    [t]
  );

  const [gateVisible, setGateVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [storyLanguage, setStoryLanguage] = useState<Locale>(defaultLanguage);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [imageStyle, setImageStyle] = useState<string>('soft_watercolor');
  const [userNotes, setUserNotes] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [createdReviewRequired, setCreatedReviewRequired] = useState<boolean>(reviewRequired);
  const [storyErrorText, setStoryErrorText] = useState<string | null>(null);
  const { data: storyStatus } = useStoryStatus(requestId || '', Boolean(requestId));

  const canSubmitGate = password.trim().length > 0 && !parentGate.isPending;
  const activeGenerationStatus = storyStatus?.status ?? (requestId ? 'pending' : null);
  const generationInFlight =
    createChildStory.isPending ||
    activeGenerationStatus === 'pending' ||
    activeGenerationStatus === 'processing';
  const canCreateStory = Boolean(activeChild?.id && storyLanguage) && !generationInFlight;
  const generationProgress = Math.round(
    storyStatus?.progressData?.overallProgress ?? storyStatus?.progress ?? 0
  );

  useEffect(() => {
    if (sessionMode === 'child') return;
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          isAuthenticated
            ? { name: 'Main', state: { routes: [{ name: 'Children' }], index: 0 } }
            : { name: 'Main', state: { routes: [{ name: 'Welcome' }], index: 0 } },
        ],
      })
    );
  }, [isAuthenticated, navigation, sessionMode]);

  useEffect(() => {
    if (!allowedLanguages.includes(storyLanguage)) {
      setStoryLanguage(defaultLanguage);
    }
  }, [allowedLanguages, defaultLanguage, storyLanguage]);

  useEffect(() => {
    if (goalOptions.length === 0) {
      if (selectedGoal !== null) setSelectedGoal(null);
      return;
    }
    if (!selectedGoal || !goalOptions.some((goal) => goal.slug === selectedGoal)) {
      setSelectedGoal(goalOptions[0].slug);
    }
  }, [goalOptions, selectedGoal]);

  const handleOpenGate = () => {
    setPassword('');
    setErrorText(null);
    setGateVisible(true);
  };

  const handleParentGate = async () => {
    if (!canSubmitGate) return;
    setErrorText(null);
    try {
      await parentGate.mutateAsync({ password });
      setGateVisible(false);
      setPassword('');
    } catch (error) {
      setErrorText(getParentGateErrorMessage(t, error));
    }
  };

  const handleCreateStory = async () => {
    if (!activeChild?.id || !canCreateStory) return;
    setStoryErrorText(null);
    try {
      const result = await createChildStory.mutateAsync({
        childProfileId: activeChild.id,
        uiLocale: normalizeLocale(i18n.language, APP_CONFIG.defaultLanguage),
        storyLanguage,
        ...(selectedGoal ? { goal: selectedGoal } : {}),
        ...(imageStyle ? { imageStyle } : {}),
        ...(freeTextEnabled && userNotes.trim() ? { userNotes: userNotes.trim() } : {}),
      });
      setRequestId(result.id);
      setCreatedReviewRequired(result.parentReviewRequired ?? reviewRequired);
      setUserNotes('');
    } catch (error) {
      setStoryErrorText(getChildStoryErrorMessage(t, error));
    }
  };

  const handleStartAnother = () => {
    setRequestId(null);
    setStoryErrorText(null);
  };

  const handleLogout = () => {
    logout.mutate();
  };

  const renderStatusPanel = () => {
    if (storyErrorText) {
      return (
        <View style={[styles.statusPanel, styles.statusPanelError]}>
          <Ionicons name="alert-circle-outline" size={22} color={theme.colors.status.error} />
          <Text style={[styles.statusPanelText, styles.statusPanelErrorText]}>{storyErrorText}</Text>
        </View>
      );
    }

    if (!requestId) return null;

    if (activeGenerationStatus === 'completed') {
      return (
        <View style={[styles.statusPanel, styles.statusPanelSuccess]}>
          <Ionicons name="checkmark-circle-outline" size={24} color={theme.colors.status.success} />
          <View style={styles.statusCopy}>
            <Text style={styles.statusPanelTitle}>{t('child_mode.story_ready_title')}</Text>
            <Text style={styles.statusPanelText}>
              {createdReviewRequired
                ? t('child_mode.story_ready_review_required')
                : t('child_mode.story_ready_parent_area')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.compactButton}
            onPress={handleStartAnother}
            activeOpacity={0.8}
          >
            <Text style={styles.compactButtonText}>{t('child_mode.story_start_another')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (activeGenerationStatus === 'failed') {
      return (
        <View style={[styles.statusPanel, styles.statusPanelError]}>
          <Ionicons name="alert-circle-outline" size={22} color={theme.colors.status.error} />
          <View style={styles.statusCopy}>
            <Text style={[styles.statusPanelTitle, styles.statusPanelErrorText]}>
              {t('child_mode.story_failed_title')}
            </Text>
            <Text style={[styles.statusPanelText, styles.statusPanelErrorText]}>
              {storyStatus?.errorMessage || t('child_mode.story_failed_message')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.compactButton}
            onPress={handleStartAnother}
            activeOpacity={0.8}
          >
            <Text style={styles.compactButtonText}>{t('child_mode.story_try_again')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.statusPanel}>
        <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
        <View style={styles.statusCopy}>
          <Text style={styles.statusPanelTitle}>{t('child_mode.story_generating_title')}</Text>
          <Text style={styles.statusPanelText}>
            {activeGenerationStatus === 'processing'
              ? t('child_mode.story_generating_processing', { progress: generationProgress })
              : t('child_mode.story_generating_pending')}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${generationProgress}%` }]} />
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.shell}>
          <View style={styles.headerRow}>
            <View style={styles.childIdentity}>
              <View style={styles.badge}>
                <Ionicons name="shield-checkmark" size={30} color={theme.colors.interactive.primary} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>{t('child_mode.title')}</Text>
                <Text style={styles.childName} numberOfLines={2}>{childName}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.parentGateButton}
              onPress={handleOpenGate}
              activeOpacity={0.8}
            >
              <Ionicons name="lock-open-outline" size={18} color={theme.colors.text.inverse} />
              <Text style={styles.parentGateButtonText}>{t('child_mode.return_to_parent_short')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>{t('child_mode.subtitle')}</Text>

          <View style={styles.safeguards}>
            <View style={styles.safeguardItem}>
              <Ionicons name="sparkles-outline" size={16} color={theme.colors.interactive.primary} />
              <Text style={styles.safeguardText}>
                {reviewRequired ? t('child_mode.story_review_badge') : t('child_mode.story_no_review_badge')}
              </Text>
            </View>
            <View style={styles.safeguardItem}>
              <Ionicons name={freeTextEnabled ? 'create-outline' : 'ban-outline'} size={16} color={theme.colors.interactive.primary} />
              <Text style={styles.safeguardText}>
                {freeTextEnabled ? t('child_mode.story_free_text_on') : t('child_mode.story_free_text_off')}
              </Text>
            </View>
          </View>

          <View style={styles.creator}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('child_mode.story_creator_title')}</Text>
              {themesLoading ? (
                <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('child_mode.story_theme_label')}</Text>
              <View style={styles.chips}>
                {goalOptions.map((goal) => (
                  <TouchableOpacity
                    key={goal.slug}
                    style={[styles.chip, selectedGoal === goal.slug && styles.chipSelected]}
                    onPress={() => setSelectedGoal(goal.slug)}
                    activeOpacity={0.75}
                    disabled={generationInFlight}
                  >
                    <Text style={[styles.chipText, selectedGoal === goal.slug && styles.chipTextSelected]}>
                      {goal.name}
                    </Text>
                  </TouchableOpacity>
                ))}
                {!themesLoading && goalOptions.length === 0 ? (
                  <Text style={styles.emptyHint}>{t('child_mode.story_no_themes')}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('child_mode.story_language_label')}</Text>
              <View style={styles.chips}>
                {allowedLanguages.map((code) => {
                  const config = SUPPORTED_LANGUAGES[code];
                  const selected = storyLanguage === code;
                  return (
                    <TouchableOpacity
                      key={code}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setStoryLanguage(code)}
                      activeOpacity={0.75}
                      disabled={generationInFlight}
                    >
                      <Text style={styles.flag}>{config.flag}</Text>
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {t(`language_names.${code}`, { defaultValue: config.nativeName })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('child_mode.story_style_label')}</Text>
              <View style={styles.chips}>
                {imageStyleOptions.map((style) => {
                  const selected = imageStyle === style.slug;
                  return (
                    <TouchableOpacity
                      key={style.slug}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setImageStyle(style.slug)}
                      activeOpacity={0.75}
                      disabled={generationInFlight}
                    >
                      <Text style={styles.styleIcon}>{style.icon}</Text>
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {style.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {freeTextEnabled ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t('child_mode.story_notes_label')}</Text>
                <TextInput
                  nativeID="child-mode-story-notes"
                  style={styles.notesInput}
                  value={userNotes}
                  onChangeText={setUserNotes}
                  placeholder={t('child_mode.story_notes_placeholder')}
                  placeholderTextColor={theme.colors.text.tertiary}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  textAlignVertical="top"
                  editable={!generationInFlight}
                />
                <Text style={styles.charCount}>{userNotes.length}/500</Text>
              </View>
            ) : null}

            {renderStatusPanel()}

            <TouchableOpacity
              style={[styles.createButton, !canCreateStory && styles.buttonDisabled]}
              onPress={handleCreateStory}
              activeOpacity={0.82}
              disabled={!canCreateStory}
            >
              {generationInFlight ? (
                <ActivityIndicator size="small" color={theme.colors.text.inverse} />
              ) : (
                <Ionicons name="sparkles-outline" size={20} color={theme.colors.text.inverse} />
              )}
              <Text style={styles.createButtonText}>
                {generationInFlight
                  ? t('child_mode.story_create_loading')
                  : t('child_mode.story_create_button')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerActions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleLogout}
              activeOpacity={0.8}
              disabled={logout.isPending}
            >
              {logout.isPending ? (
                <ActivityIndicator size="small" color={theme.colors.text.primary} />
              ) : (
                <Ionicons name="log-out-outline" size={20} color={theme.colors.text.primary} />
              )}
              <Text style={styles.secondaryButtonText}>{t('child_mode.sign_out')}</Text>
            </TouchableOpacity>
          </View>

          {user?.email ? (
            <Text style={styles.accountText} numberOfLines={1}>
              {t('child_mode.signed_in_as')} {user.email}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={gateVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGateVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGateVisible(false)} />
          <View style={styles.dialog}>
            <View style={styles.dialogIcon}>
              <Ionicons name="key-outline" size={34} color={theme.colors.interactive.primary} />
            </View>
            <Text style={styles.dialogTitle}>{t('child_mode.parent_gate_title')}</Text>
            <Text style={styles.dialogSubtitle}>{t('child_mode.parent_gate_subtitle')}</Text>

            <Text style={styles.inputLabel}>{t('auth.password')}</Text>
            <TextInput
              nativeID="parent-gate-password"
              style={styles.input}
              value={password}
              onChangeText={(next) => {
                setPassword(next);
                if (errorText) setErrorText(null);
              }}
              placeholder={t('child_mode.parent_gate_password_placeholder')}
              placeholderTextColor={theme.colors.text.tertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleParentGate}
            />

            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogCancelButton]}
                onPress={() => setGateVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogConfirmButton, !canSubmitGate && styles.buttonDisabled]}
                onPress={handleParentGate}
                activeOpacity={0.8}
                disabled={!canSubmitGate}
              >
                {parentGate.isPending ? (
                  <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                ) : (
                  <Text style={styles.dialogConfirmText}>{t('child_mode.parent_gate_unlock')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.secondary,
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
  },
  shell: {
    width: '100%',
    maxWidth: 760,
    padding: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[4],
  },
  childIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[4],
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  badge: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.tertiary,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  childName: {
    marginTop: theme.spacing[1],
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
  },
  subtitle: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
  },
  parentGateButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.interactive.primary,
    paddingHorizontal: theme.spacing[4],
  },
  parentGateButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  safeguards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    marginTop: theme.spacing[5],
  },
  safeguardItem: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    paddingHorizontal: theme.spacing[3],
  },
  safeguardText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
  },
  creator: {
    marginTop: theme.spacing[6],
    gap: theme.spacing[5],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  section: {
    gap: theme.spacing[3],
  },
  sectionLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  chip: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.secondary,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  chipSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  chipText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  chipTextSelected: {
    color: theme.colors.text.inverse,
  },
  flag: {
    fontSize: theme.typography.fontSize.lg,
  },
  styleIcon: {
    fontSize: theme.typography.fontSize.lg,
  },
  emptyHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  notesInput: {
    minHeight: 92,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.secondary,
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
  },
  statusPanel: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing[4],
  },
  statusPanelSuccess: {
    borderColor: theme.colors.success[500],
    backgroundColor: theme.colors.success[50],
  },
  statusPanelError: {
    borderColor: theme.colors.error[500],
    backgroundColor: theme.colors.error[50],
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  statusPanelTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  statusPanelText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  statusPanelErrorText: {
    color: theme.colors.error[700],
  },
  compactButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    paddingHorizontal: theme.spacing[3],
  },
  compactButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.border.light,
  },
  progressFill: {
    height: '100%',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.interactive.primary,
  },
  createButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.interactive.primary,
    paddingHorizontal: theme.spacing[5],
  },
  createButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  footerActions: {
    marginTop: theme.spacing[5],
  },
  secondaryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    paddingHorizontal: theme.spacing[5],
  },
  secondaryButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  accountText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    padding: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.background.primary,
  },
  dialogIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.tertiary,
    marginBottom: theme.spacing[4],
  },
  dialogTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  dialogSubtitle: {
    marginTop: theme.spacing[2],
    fontSize: theme.typography.fontSize.sm,
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  inputLabel: {
    marginTop: theme.spacing[5],
    marginBottom: theme.spacing[2],
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  input: {
    minHeight: 48,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    paddingHorizontal: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.secondary,
  },
  errorText: {
    marginTop: theme.spacing[3],
    color: theme.colors.status.error,
    fontSize: theme.typography.fontSize.sm,
    textAlign: 'center',
  },
  dialogActions: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    marginTop: theme.spacing[6],
  },
  dialogButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.md,
    paddingHorizontal: theme.spacing[4],
  },
  dialogCancelButton: {
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
  },
  dialogConfirmButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  dialogCancelText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  dialogConfirmText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
