import React, { useMemo, useState, useLayoutEffect } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { APP_CONFIG } from '@/config/constants';
import { useCharacters } from '@/api/characters';
import { useChildren, useEnterChildMode, useRevokeChildModeSessions, useUpdateChild, useUpdateChildModeControls } from '@/api/children';
import { useStoryThemes } from '@/api/dictionaries';
import { useSubscriptionUsage } from '@/api/plans';
import { ChildFormContent, type ChildFormInitialData } from '@/components/ChildFormContent';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { FeedbackModal } from '@/components/FeedbackModal';
import { ChildCard } from './components/ChildCard';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import { useResponsive } from '@/hooks/useResponsive';
import type { MainDrawerParamList } from '@/types/navigation';
import { SUPPORTED_LANGUAGES, type ChildModeSettingsInput, type ReferencePhoto } from '@wondertales/shared';

type ChildDetailRoute = RouteProp<MainDrawerParamList, 'ChildDetail'>;

function mapChildToInitialData(child: Record<string, unknown>): ChildFormInitialData {
  const birthDate = child.birthDate ?? child.birthdate;
  return {
    name: String(child.name ?? ''),
    birthDate: birthDate instanceof Date ? birthDate : new Date(String(birthDate ?? '')),
    languages: Array.isArray(child.languages) ? child.languages : [],
    referencePhotos: (child.referencePhotos ?? child.referencephotos) as ReferencePhoto[] | undefined,
    appearanceTraits: (child.appearanceTraits ?? child.appearancetraits) as Record<string, unknown> | undefined,
    personality: child.personality as Record<string, unknown> | undefined,
    interests: child.interests as unknown[] | undefined,
    sensitivities: child.sensitivities as Record<string, unknown> | undefined,
    familyCast: (child.familyCast ?? child.familycast) as Record<string, string> | undefined,
    aiGeneratedDescription: (child.aiGeneratedDescription ?? child.aigenerateddescription) as string | undefined,
    descriptionLanguage: (child.descriptionLanguage ?? child.descriptionlanguage) as string | undefined,
    turnaroundSheet: (child.turnaroundSheet ?? child.turnaroundsheet) as { url: string; frontUrl?: string; generatedAt: string } | undefined,
    authorPseudonym: (child.authorPseudonym ?? child.authorpseudonym) as string | null | undefined,
    authorAboutMe: (child.authorAboutMe ?? child.authoraboutme) as string | null | undefined,
  };
}

function getChildModeSettingsFromRecord(child: Record<string, unknown>): Record<string, unknown> {
  const settings = child.childModeSettings ?? child.childmodesettings;
  return settings && typeof settings === 'object' ? settings as Record<string, unknown> : {};
}

function getNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function getFiniteLimit(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export default function ChildDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const route = useRoute<ChildDetailRoute>();
  const { isMobile } = useResponsive();
  const [activeTab, setActiveTab] = useState<'profile' | 'access'>('profile');
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const { data, isLoading } = useChildren();
  const { data: themesData } = useStoryThemes();
  const { data: characters = [] } = useCharacters();
  const { data: subscriptionUsage } = useSubscriptionUsage();
  const updateChildModeControls = useUpdateChildModeControls();
  const updateChild = useUpdateChild();
  const enterChildMode = useEnterChildMode();
  const revokeChildModeSessions = useRevokeChildModeSessions();
  const child = (data?.children ?? []).find((item) => item.id === route.params.childId);
  const childInitialData = useMemo(
    () => (child ? mapChildToInitialData(child as unknown as Record<string, unknown>) : undefined),
    [child]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [navigation]);

  const labels = {
    title: t('children_screen.child_mode_title'),
    enabled: t('children_screen.child_mode_enabled'),
    disabled: t('children_screen.child_mode_disabled'),
    accessAllowed: t('children_screen.child_mode_access_allowed', { defaultValue: 'Access allowed' }),
    accessDisabled: t('children_screen.child_mode_access_disabled', { defaultValue: 'Access off' }),
    readyToStart: t('children_screen.child_mode_ready_to_start', { defaultValue: 'Ready to start' }),
    passwordNeeded: t('children_screen.child_mode_password_needed', { defaultValue: 'Password needed' }),
    dailyLimit: t('children_screen.child_mode_daily_limit', { defaultValue: 'Stories per child per day' }),
    monthlyLimit: t('children_screen.child_mode_monthly_limit', { defaultValue: 'Stories per child per month' }),
    dailyAudioLimit: t('children_screen.child_mode_daily_audio_limit', { defaultValue: 'Audio stories per child per day' }),
    noLimit: t('children_screen.child_mode_no_limit', { defaultValue: 'No child-specific limit' }),
    storyGeneration: t('children_screen.child_mode_story_generation', { defaultValue: 'Story generation' }),
    publicStories: t('children_screen.child_mode_public_stories', { defaultValue: 'Public stories' }),
    freeText: t('children_screen.child_mode_free_text'),
    audio: t('children_screen.child_mode_audio'),
    review: t('children_screen.child_mode_review'),
    themes: t('children_screen.child_mode_allowed_themes'),
    languages: t('children_screen.child_mode_allowed_languages'),
    characters: t('children_screen.child_mode_allowed_characters'),
    siblings: t('children_screen.child_mode_siblings'),
    anyTheme: t('children_screen.child_mode_any_theme'),
    anyLanguage: t('children_screen.child_mode_any_language'),
    anyCharacter: t('children_screen.child_mode_any_character'),
    noCharacters: t('children_screen.child_mode_no_characters'),
    setPasscodeToStart: t('children_screen.child_mode_set_passcode_to_start'),
    activeSessions: t('children_screen.child_mode_active_sessions'),
    revoke: t('children_screen.child_mode_revoke_sessions'),
    start: t('children_screen.child_mode_start'),
    starting: t('children_screen.child_mode_starting'),
    enableToStart: t('children_screen.child_mode_enable_to_start'),
    limitMax: t('children_screen.child_mode_limit_max', { defaultValue: 'Max {{count}}' }),
    limitAvailable: t('children_screen.child_mode_limit_available', { defaultValue: 'Available {{count}}' }),
    limitReserved: t('children_screen.child_mode_limit_reserved', { defaultValue: 'Other children {{count}}' }),
  };

  const themeOptions = useMemo(
    () =>
      (themesData?.goals ?? []).map((goal) => ({
        value: goal.slug,
        label: goal.name,
      })),
    [themesData?.goals]
  );

  const languageOptions = useMemo(
    () =>
      APP_CONFIG.supportedLanguages.map((code) => {
        const config = SUPPORTED_LANGUAGES[code];
        return {
          value: code,
          label: t(`language_names.${code}`, { defaultValue: config.nativeName }),
          icon: config.flag,
        };
      }),
    [t]
  );

  const characterOptions = useMemo(
    () =>
      characters
        .filter((character) => character.isActive !== false && character.isHidden !== true)
        .map((character) => ({
          value: character.id,
          label: character.name,
        })),
    [characters]
  );

  const handleChildModeEnabledChange = (childId: string, enabled: boolean) => {
    updateChildModeControls.mutate({
      id: childId,
      data: { childModeEnabled: enabled },
    });
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
      </View>
    );
  }

  if (!child) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>{t('children_screen.error')}</Text>
      </View>
    );
  }

  const childRecord = child as unknown as Record<string, unknown>;
  const childCardData = {
    id: child.id,
    name: child.name,
    birthDate: (childRecord.birthDate ?? childRecord.birthdate) as string | undefined,
    turnaroundSheet: (childRecord.turnaroundSheet ?? childRecord.turnaroundsheet) as { url: string; frontUrl?: string } | undefined,
    referencePhotos: (childRecord.referencePhotos ?? childRecord.referencephotos) as { url: string }[] | undefined,
    childModeEnabled: (childRecord.childModeEnabled ?? childRecord.childmodeenabled) as boolean | undefined,
    childModeSettings: (childRecord.childModeSettings ?? childRecord.childmodesettings) as any,
    childModePasscodeConfigured: (childRecord.childModePasscodeConfigured ?? childRecord.childmodepasscodeconfigured) as boolean | undefined,
    childModeActiveSessionCount: (childRecord.childModeActiveSessionCount ?? childRecord.childmodeactivesessioncount) as number | undefined,
  };
  const storyCreationMode = ((childRecord.storyCreationMode ?? childRecord.storycreationmode) as 'instant' | 'artisan' | undefined) ?? 'instant';
  const childAvatarUrl =
    childCardData.turnaroundSheet?.frontUrl ||
    childCardData.turnaroundSheet?.url ||
    childCardData.referencePhotos?.[0]?.url ||
    null;
  const childModeReadyToStart = childCardData.childModeEnabled === true && childCardData.childModePasscodeConfigured === true;
  const childModeNeedsPassword = childCardData.childModeEnabled === true && childCardData.childModePasscodeConfigured !== true;
  const childModeHeaderStatus = childModeReadyToStart
    ? labels.readyToStart
    : childModeNeedsPassword
      ? labels.passwordNeeded
      : labels.accessDisabled;
  const childCount = (data?.children ?? []).length;
  const storyMonthlyLimit = getFiniteLimit(subscriptionUsage?.stories.limit);
  const audioMonthlyLimit = getFiniteLimit(subscriptionUsage?.audio.limit);
  const otherChildrenMonthlyStoryLimit = (data?.children ?? [])
    .filter((item) => item.id !== child.id)
    .reduce((sum, item) => {
      const itemSettings = getChildModeSettingsFromRecord(item as unknown as Record<string, unknown>);
      return sum + (getNonNegativeInteger(itemSettings.monthlyGenerationLimit) ?? 0);
    }, 0);
  const monthlyStoryMaxForChild =
    storyMonthlyLimit === null ? null : Math.max(0, storyMonthlyLimit - otherChildrenMonthlyStoryLimit);
  const dailyStoryMaxForChild = monthlyStoryMaxForChild;
  const dailyAudioMaxForChild = audioMonthlyLimit;
  const dailyStoryHelper = t('children_screen.child_mode_daily_story_limit_hint', {
    defaultValue: 'Empty means no daily child limit. The account monthly limit still applies.',
  });
  const monthlyStoryHelper =
    storyMonthlyLimit === null
      ? t('children_screen.child_mode_monthly_story_limit_unlimited_hint', {
          defaultValue: 'Empty means no child-specific limit.',
        })
      : childCount > 1
        ? t('children_screen.child_mode_monthly_story_limit_budget_hint', {
            defaultValue:
              'Family limit: {{limit}} stories/month. Other children already reserve {{reserved}}. This child can use up to {{available}}.',
            limit: storyMonthlyLimit,
            reserved: otherChildrenMonthlyStoryLimit,
            available: monthlyStoryMaxForChild,
          })
        : t('children_screen.child_mode_monthly_story_limit_hint', {
            defaultValue: 'Account limit: {{limit}} stories/month. Empty means no child-specific limit.',
            limit: storyMonthlyLimit,
          });
  const dailyAudioHelper =
    audioMonthlyLimit === null
      ? t('children_screen.child_mode_daily_audio_limit_unlimited_hint', {
          defaultValue: 'Empty means no daily audio limit.',
        })
      : t('children_screen.child_mode_daily_audio_limit_hint', {
          defaultValue: 'Audio account limit: {{limit}}/month. A child daily limit does not increase it.',
          limit: audioMonthlyLimit,
        });

  const handleChildModeSettingsChange = (
    childId: string,
    settings: Partial<ChildModeSettingsInput>
  ) => {
    const nextSettings = { ...settings };
    if (
      typeof monthlyStoryMaxForChild === 'number' &&
      typeof nextSettings.monthlyGenerationLimit === 'number'
    ) {
      nextSettings.monthlyGenerationLimit = Math.min(
        nextSettings.monthlyGenerationLimit,
        monthlyStoryMaxForChild
      );
    }
    if (
      typeof dailyStoryMaxForChild === 'number' &&
      typeof nextSettings.dailyGenerationLimit === 'number'
    ) {
      nextSettings.dailyGenerationLimit = Math.min(
        nextSettings.dailyGenerationLimit,
        dailyStoryMaxForChild
      );
    }
    if (
      typeof dailyAudioMaxForChild === 'number' &&
      typeof nextSettings.dailyAudioGenerationLimit === 'number'
    ) {
      nextSettings.dailyAudioGenerationLimit = Math.min(
        nextSettings.dailyAudioGenerationLimit,
        dailyAudioMaxForChild
      );
    }

    updateChildModeControls.mutate({
      id: childId,
      data: { childModeSettings: nextSettings },
    });
  };

  return (
    <View style={styles.container}>
      <View style={[
        styles.pageContent,
        isMobile && styles.pageContentMobile,
      ]}>
      <View style={[styles.headerPanel, isMobile && styles.headerPanelMobile]}>
        <View style={styles.identityRow}>
          <View style={styles.avatarShell}>
            {childAvatarUrl ? (
              <Image
                source={{ uri: formatAssetUrl(childAvatarUrl) ?? childAvatarUrl }}
                style={styles.avatar}
                resizeMode="contain"
              />
            ) : (
              <Ionicons name="person-circle-outline" size={38} color={theme.colors.text.tertiary} />
            )}
          </View>
          <View style={styles.identityText}>
            <Text style={styles.childName}>{child.name}</Text>
            <Text style={styles.childMeta}>
              {childCardData.birthDate ? new Date(childCardData.birthDate).toLocaleDateString() : t('children_screen.title')}
            </Text>
          </View>
        </View>
        <View style={[
          styles.statusPill,
          childModeReadyToStart ? styles.statusPillEnabled : childModeNeedsPassword ? styles.statusPillWarning : styles.statusPillDisabled,
        ]}>
          <Ionicons
            name={childModeReadyToStart ? 'shield-checkmark' : childModeNeedsPassword ? 'key-outline' : 'shield-outline'}
            size={16}
            color={childModeReadyToStart ? theme.colors.status.success : childModeNeedsPassword ? theme.colors.interactive.primary : theme.colors.text.tertiary}
          />
          <Text style={[
            styles.statusPillText,
            childModeReadyToStart && styles.statusPillTextEnabled,
            childModeNeedsPassword && styles.statusPillTextWarning,
          ]}>
            {childModeHeaderStatus}
          </Text>
        </View>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'profile' && styles.tabButtonActive]}
          onPress={() => setActiveTab('profile')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('children_screen.child_detail_profile_tab', { defaultValue: 'Profile' })}
          focusable
        >
          <Ionicons
            name="person-circle-outline"
            size={18}
            color={activeTab === 'profile' ? theme.colors.text.inverse : theme.colors.text.secondary}
          />
          <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>
            {t('children_screen.child_detail_profile_tab', { defaultValue: 'Profile' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'access' && styles.tabButtonActive]}
          onPress={() => setActiveTab('access')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('children_screen.child_detail_access_tab', { defaultValue: 'Access' })}
          focusable
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={18}
            color={activeTab === 'access' ? theme.colors.text.inverse : theme.colors.text.secondary}
          />
          <Text style={[styles.tabText, activeTab === 'access' && styles.tabTextActive]}>
            {t('children_screen.child_detail_access_tab', { defaultValue: 'Access' })}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'profile' ? (
        <View style={styles.profilePanel}>
          <View style={styles.storySetupPanel}>
            <View style={styles.storySetupCopy}>
              <Text style={styles.storySetupTitle}>
                {t('children_screen.story_setup_title', { defaultValue: 'Story setup' })}
              </Text>
              <Text style={styles.storySetupText}>
                {t('children_screen.story_setup_body', {
                  defaultValue: 'Choose the default story creation flow for this child. Parents can still change it for a single story.',
                })}
              </Text>
            </View>
            <View style={[styles.storyModeRow, isMobile && styles.storyModeRowMobile]}>
              {(['instant', 'artisan'] as const).map((mode) => {
                const selected = storyCreationMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.storyModeButton, selected && styles.storyModeButtonSelected]}
                    activeOpacity={0.8}
                    disabled={updateChild.isPending}
                    onPress={() => updateChild.mutate({ id: child.id, data: { storyCreationMode: mode } })}
                  >
                    <Ionicons
                      name={mode === 'instant' ? 'flash-outline' : 'color-palette-outline'}
                      size={18}
                      color={selected ? theme.colors.text.inverse : theme.colors.text.secondary}
                    />
                    <View style={styles.storyModeTextWrap}>
                      <Text style={[styles.storyModeTitle, selected && styles.storyModeTitleSelected]}>
                        {mode === 'instant'
                          ? t('onboarding.instant_mode', { defaultValue: 'Instant Mode' })
                          : t('onboarding.master_mode', { defaultValue: 'Master Mode' })}
                      </Text>
                      <Text style={[styles.storyModeDescription, selected && styles.storyModeDescriptionSelected]}>
                        {mode === 'instant'
                          ? t('onboarding.instant_mode_description', { defaultValue: 'Quick creation with fewer choices' })
                          : t('onboarding.master_mode_description', { defaultValue: 'More control over story details' })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <ChildFormContent
            childId={child.id}
            initialData={childInitialData}
            onSuccess={() => undefined}
            variant="inline"
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.accessContent} showsVerticalScrollIndicator={false}>
          <View style={Platform.OS === 'web' ? styles.accessCardWeb : styles.accessCardNative}>
            <ChildCard
              child={childCardData}
              onPress={() => undefined}
              childModeLabels={labels}
              childModeThemeOptions={themeOptions}
              childModeLanguageOptions={languageOptions}
              childModeCharacterOptions={characterOptions}
              childModeLimitHints={{
                dailyStoryHelper,
                dailyStoryMaxValue: dailyStoryMaxForChild,
                dailyStoryTotalValue: storyMonthlyLimit,
                dailyStoryReservedValue: otherChildrenMonthlyStoryLimit,
                monthlyStoryHelper,
                monthlyStoryTotalValue: storyMonthlyLimit,
                monthlyStoryReservedValue: otherChildrenMonthlyStoryLimit,
                dailyAudioHelper,
                monthlyStoryMaxValue: monthlyStoryMaxForChild,
                dailyAudioMaxValue: dailyAudioMaxForChild,
                dailyAudioTotalValue: audioMonthlyLimit,
              }}
              showProfileSummary={false}
              onChildModeEnabledChange={handleChildModeEnabledChange}
              onChildModeSettingsChange={handleChildModeSettingsChange}
              onEnterChildMode={(childId) => enterChildMode.mutate(childId)}
              onRevokeChildModeSessions={(childId) => revokeChildModeSessions.mutate(childId)}
              isChildModeUpdating={updateChildModeControls.isPending}
              isEnteringChildMode={enterChildMode.isPending && enterChildMode.variables === child.id}
              isRevokingChildSessions={revokeChildModeSessions.isPending}
            />
          </View>
        </ScrollView>
      )}
      </View>

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="children"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.secondary,
  },
  pageContent: {
    flex: 1,
    width: '100%',
    maxWidth: 1360,
    alignSelf: 'center',
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[5],
    paddingBottom: theme.spacing[6],
  },
  pageContentMobile: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.secondary,
  },
  notFound: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.base,
  },
  headerPanel: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[4],
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
    ...Platform.select({
      web: {
        boxShadow: '0 16px 32px rgba(35, 12, 20, 0.08)' as unknown as string,
      },
      android: { elevation: 2 },
      ios: {
        shadowColor: theme.colors.primary[900],
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
    }),
  },
  headerPanelMobile: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    minWidth: 0,
    flex: 1,
  },
  avatarShell: {
    width: 56,
    height: 56,
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.neutral[50],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  identityText: {
    minWidth: 0,
    flex: 1,
  },
  childName: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
  },
  childMeta: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing[1],
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.neutral[50],
    borderColor: theme.colors.border.light,
  },
  statusPillEnabled: {
    backgroundColor: theme.colors.success[50],
    borderColor: theme.colors.success[500],
  },
  statusPillDisabled: {
    backgroundColor: theme.colors.neutral[50],
  },
  statusPillWarning: {
    backgroundColor: `${theme.colors.interactive.primary}12`,
    borderColor: theme.colors.interactive.primary,
  },
  statusPillText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  statusPillTextEnabled: {
    color: theme.colors.success[600],
  },
  statusPillTextWarning: {
    color: theme.colors.interactive.primary,
  },
  tabBar: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  tabText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  tabTextActive: {
    color: theme.colors.text.inverse,
  },
  accessContent: {
    paddingBottom: theme.spacing[8],
  },
  profilePanel: {
    width: '100%',
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 18px 44px rgba(35, 12, 20, 0.08)' as unknown as string,
      },
      android: { elevation: 2 },
      ios: {
        shadowColor: theme.colors.primary[900],
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
    }),
  },
  storySetupPanel: {
    gap: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[6],
    paddingBottom: theme.spacing[5],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
  },
  storySetupCopy: {
    gap: theme.spacing[1],
  },
  storySetupTitle: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
  storySetupText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
  },
  storyModeRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  storyModeRowMobile: {
    flexDirection: 'column',
  },
  storyModeButton: {
    flex: 1,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.neutral[50],
  },
  storyModeButtonSelected: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  storyModeTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  storyModeTitle: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
  storyModeTitleSelected: {
    color: theme.colors.text.inverse,
  },
  storyModeDescription: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 18,
  },
  storyModeDescriptionSelected: {
    color: theme.colors.text.inverse,
    opacity: 0.86,
  },
  accessCardWeb: {
    width: '100%',
  },
  accessCardNative: {
    width: '100%',
  },
});
