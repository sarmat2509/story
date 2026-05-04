import React, { useMemo, useState, useLayoutEffect } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { APP_CONFIG } from '@/config/constants';
import { useCharacters } from '@/api/characters';
import { useChildren, useEnterChildMode, useRevokeChildModeSessions, useUpdateChildModeControls } from '@/api/children';
import { useStoryThemes } from '@/api/dictionaries';
import { ChildFormContent, type ChildFormInitialData } from '@/components/ChildFormContent';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { FeedbackModal } from '@/components/FeedbackModal';
import { ChildCard } from './components/ChildCard';
import { theme } from '@/theme';
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

export default function ChildDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const route = useRoute<ChildDetailRoute>();
  const [activeTab, setActiveTab] = useState<'profile' | 'access'>('profile');
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const { data, isLoading } = useChildren();
  const { data: themesData } = useStoryThemes();
  const { data: characters = [] } = useCharacters();
  const updateChildModeControls = useUpdateChildModeControls();
  const enterChildMode = useEnterChildMode();
  const revokeChildModeSessions = useRevokeChildModeSessions();
  const child = (data?.children ?? []).find((item) => item.id === route.params.childId);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [navigation]);

  const labels = {
    title: t('children_screen.child_mode_title'),
    enabled: t('children_screen.child_mode_enabled'),
    disabled: t('children_screen.child_mode_disabled'),
    dailyLimit: t('children_screen.child_mode_daily_limit'),
    monthlyLimit: t('children_screen.child_mode_monthly_limit'),
    dailyAudioLimit: t('children_screen.child_mode_daily_audio_limit', { defaultValue: 'Daily audio limit' }),
    noLimit: t('children_screen.child_mode_no_limit'),
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
    passcode: t('children_screen.child_mode_passcode'),
    passcodePlaceholder: t('children_screen.child_mode_passcode_placeholder'),
    passcodeConfigured: t('children_screen.child_mode_passcode_configured'),
    passcodeSave: t('children_screen.child_mode_passcode_save'),
    setPasscodeToStart: t('children_screen.child_mode_set_passcode_to_start'),
    activeSessions: t('children_screen.child_mode_active_sessions'),
    revoke: t('children_screen.child_mode_revoke_sessions'),
    start: t('children_screen.child_mode_start'),
    starting: t('children_screen.child_mode_starting'),
    enableToStart: t('children_screen.child_mode_enable_to_start'),
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
        .filter((character) => character.childProfileId === route.params.childId)
        .map((character) => ({
          value: character.id,
          label: character.name,
        })),
    [characters, route.params.childId]
  );

  const handleChildModeEnabledChange = (childId: string, enabled: boolean, passcode?: string) => {
    updateChildModeControls.mutate({
      id: childId,
      data: { childModeEnabled: enabled, ...(passcode ? { childModePasscode: passcode } : {}) },
    });
  };

  const handleChildModeSettingsChange = (
    childId: string,
    settings: Partial<ChildModeSettingsInput>
  ) => {
    updateChildModeControls.mutate({
      id: childId,
      data: { childModeSettings: settings },
    });
  };

  const handleChildModePasscodeChange = (childId: string, passcode: string) => {
    updateChildModeControls.mutate({
      id: childId,
      data: { childModePasscode: passcode },
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

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'profile' && styles.tabButtonActive]}
          onPress={() => setActiveTab('profile')}
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
        <ChildFormContent
          childId={child.id}
          initialData={mapChildToInitialData(childRecord)}
          onSuccess={() => undefined}
          variant="inline"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.accessContent}>
          <View style={Platform.OS === 'web' ? styles.accessCardWeb : styles.accessCardNative}>
            <ChildCard
              child={childCardData}
              onPress={() => undefined}
              childModeLabels={labels}
              childModeThemeOptions={themeOptions}
              childModeLanguageOptions={languageOptions}
              childModeCharacterOptions={characterOptions}
              onChildModeEnabledChange={handleChildModeEnabledChange}
              onChildModeSettingsChange={handleChildModeSettingsChange}
              onChildModePasscodeChange={handleChildModePasscodeChange}
              onEnterChildMode={(childId) => enterChildMode.mutate(childId)}
              onRevokeChildModeSessions={(childId) => revokeChildModeSessions.mutate(childId)}
              isChildModeUpdating={updateChildModeControls.isPending}
              isEnteringChildMode={enterChildMode.isPending && enterChildMode.variables === child.id}
              isRevokingChildSessions={revokeChildModeSessions.isPending}
            />
          </View>
        </ScrollView>
      )}

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
    padding: theme.spacing[6],
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
  tabBar: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[5],
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
  accessCardWeb: {
    maxWidth: 520,
  },
  accessCardNative: {
    width: '100%',
  },
});
