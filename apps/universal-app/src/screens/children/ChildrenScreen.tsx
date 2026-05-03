import React, { useMemo, useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useChildren, useDeleteChild, useEnterChildMode, useRevokeChildModeSessions, useUpdateChildModeControls } from '@/api/children';
import { useCharacters } from '@/api/characters';
import { useStoryThemes } from '@/api/dictionaries';
import { ChildFormModal } from '@/components/ChildFormModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ChildCard } from './components/ChildCard';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { APP_CONFIG } from '@/config/constants';
import { theme } from '@/theme';

const cardDelay = (i: number) => Math.min(120 + i * 40, 360);
import { SUPPORTED_LANGUAGES, type ChildModeSettingsInput, type ReferencePhoto } from '@wondertales/shared';
import type { ChildFormInitialData } from '@/components/ChildFormContent';
import type { MainDrawerParamList } from '@/types/navigation';

function useColumns(): number {
  const { width } = useWindowDimensions();
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  return 2;
}

function mapChildToInitialData(child: Record<string, unknown>): ChildFormInitialData {
  const birthDate = child.birthDate ?? child.birthdate;
  return {
    name: String(child.name ?? ''),
    birthDate: birthDate instanceof Date ? birthDate : new Date(String(birthDate ?? '')),
    languages: Array.isArray(child.languages) ? child.languages : [],
    referencePhotos: child.referencePhotos as ReferencePhoto[] | undefined,
    appearanceTraits: child.appearanceTraits as Record<string, unknown> | undefined,
    personality: child.personality as Record<string, unknown> | undefined,
    interests: child.interests as unknown[] | undefined,
    sensitivities: child.sensitivities as Record<string, unknown> | undefined,
    familyCast: child.familyCast as Record<string, string> | undefined,
    aiGeneratedDescription: child.aiGeneratedDescription as string | undefined,
    descriptionLanguage: child.descriptionLanguage as string | undefined,
    turnaroundSheet: child.turnaroundSheet as { url: string; frontUrl?: string; generatedAt: string } | undefined,
  };
}

export default function ChildrenScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { width } = useWindowDimensions();
  const enterKey = useScreenEnter();
  const { data, isLoading, error } = useChildren();
  const { data: themesData } = useStoryThemes();
  const { data: characters = [] } = useCharacters();
  const deleteChild = useDeleteChild();
  const updateChildModeControls = useUpdateChildModeControls();
  const enterChildMode = useEnterChildMode();
  const revokeChildModeSessions = useRevokeChildModeSessions();
  const columns = useColumns();
  const paddingHorizontal = theme.spacing[6] * 2;
  const gap = theme.spacing[4];
  const cardWidth = (width - paddingHorizontal - gap * (columns - 1)) / columns;

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [childToDelete, setChildToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingChild, setEditingChild] = useState<{
    id: string;
  } & ChildFormInitialData | undefined>();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />
      ),
    });
  }, [navigation]);

  const children = data?.children ?? [];
  const canCreateMore = data?.canCreateMore ?? false;
  const childModeLabels = {
    title: t('children_screen.child_mode_title'),
    enabled: t('children_screen.child_mode_enabled'),
    disabled: t('children_screen.child_mode_disabled'),
    dailyLimit: t('children_screen.child_mode_daily_limit'),
    monthlyLimit: t('children_screen.child_mode_monthly_limit'),
    noLimit: t('children_screen.child_mode_no_limit'),
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
    familyStories: t('children_screen.child_mode_family_stories'),
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

  const childModeThemeOptions = useMemo(
    () =>
      (themesData?.goals ?? []).map((goal) => ({
        value: goal.slug,
        label: goal.name,
      })),
    [themesData?.goals]
  );

  const childModeLanguageOptions = useMemo(
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

  const childModeCharacterOptions = useMemo(
    () =>
      characters
        .filter((character) => character.isActive !== false && character.isHidden !== true)
        .map((character) => ({
          value: character.id,
          label: character.name,
        })),
    [characters]
  );

  const handleEditChild = (child: Record<string, unknown>) => {
    setEditingChild({
      id: String(child.id ?? ''),
      ...mapChildToInitialData(child),
    });
    setIsModalVisible(true);
  };

  const handleDelete = (childId: string, childName: string) => {
    setChildToDelete({ id: childId, name: childName });
    setDeleteDialogVisible(true);
  };

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

  const handleRevokeChildModeSessions = (childId: string) => {
    revokeChildModeSessions.mutate(childId);
  };

  const handleEnterChildMode = (childId: string) => {
    enterChildMode.mutate(childId);
  };

  const confirmDelete = () => {
    if (childToDelete) {
      deleteChild.mutate(childToDelete.id);
      setDeleteDialogVisible(false);
      setChildToDelete(null);
    }
  };

  const cancelDelete = () => {
    setDeleteDialogVisible(false);
    setChildToDelete(null);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('children_screen.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t('children_screen.error')}</Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <AnimatedSection delay={0} trigger={enterKey}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('children_screen.title')}</Text>
          <Text style={styles.subtitle}>{t('children_screen.subtitle')}</Text>
        </View>
      </AnimatedSection>

      {children.length === 0 ? (
        <AnimatedSection delay={120} trigger={enterKey}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👶</Text>
            <Text style={styles.emptyText}>{t('children_screen.empty_title')}</Text>
            <Text style={styles.emptyHint}>{t('children_screen.empty_text')}</Text>
            {canCreateMore && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => {
                  setEditingChild(undefined);
                  setIsModalVisible(true);
                }}
              >
                <Text style={styles.emptyButtonText}>{t('children_screen.add_button')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </AnimatedSection>
      ) : (
        <>
          <View style={[styles.grid, Platform.OS === 'web' && { gridTemplateColumns: `repeat(${columns}, 1fr)` } as any]}>
            {children.map((child: Record<string, unknown>, index: number) => {
              const childId = String(child.id ?? '');
              const childData = {
                id: childId,
                name: String(child.name ?? ''),
                birthDate: child.birthDate as string | undefined,
                birthdate: child.birthdate as string | undefined,
                turnaroundSheet: child.turnaroundSheet as { url: string; frontUrl?: string } | undefined,
                referencePhotos: child.referencePhotos as { url: string }[] | undefined,
                childModeEnabled: child.childModeEnabled as boolean | undefined,
                childModeSettings: child.childModeSettings as any,
                childModePasscodeConfigured: child.childModePasscodeConfigured === true,
                childModeActiveSessionCount: typeof child.childModeActiveSessionCount === 'number'
                  ? child.childModeActiveSessionCount
                  : 0,
              };
              const cardContent = (
                <ChildCard
                  child={childData}
                  onPress={() => handleEditChild(child)}
                  onDelete={handleDelete}
                  childModeLabels={childModeLabels}
                  childModeThemeOptions={childModeThemeOptions}
                  childModeLanguageOptions={childModeLanguageOptions}
                  childModeCharacterOptions={childModeCharacterOptions}
                  onChildModeEnabledChange={handleChildModeEnabledChange}
                  onChildModeSettingsChange={handleChildModeSettingsChange}
                  onChildModePasscodeChange={handleChildModePasscodeChange}
                  onEnterChildMode={handleEnterChildMode}
                  onRevokeChildModeSessions={handleRevokeChildModeSessions}
                  isChildModeUpdating={updateChildModeControls.isPending}
                  isEnteringChildMode={enterChildMode.isPending && enterChildMode.variables === childId}
                  isRevokingChildSessions={revokeChildModeSessions.isPending}
                />
              );
              return Platform.OS === 'web' ? (
                <AnimatedSection key={childId} delay={cardDelay(index)} trigger={enterKey}>
                  {cardContent}
                </AnimatedSection>
              ) : (
                <AnimatedSection
                  key={childId}
                  delay={cardDelay(index)}
                  trigger={enterKey}
                  style={{ width: cardWidth }}
                >
                  {cardContent}
                </AnimatedSection>
              );
            })}
          </View>

          {canCreateMore && (
            <AnimatedSection delay={cardDelay(children.length)} trigger={enterKey}>
              <TouchableOpacity
                style={styles.addCharacterButton}
                onPress={() => {
                  setEditingChild(undefined);
                  setIsModalVisible(true);
                }}
              >
                <Ionicons name="add-circle" size={24} color={theme.colors.text.inverse} />
                <Text style={styles.addCharacterButtonText}>{t('children_screen.add_button')}</Text>
              </TouchableOpacity>
            </AnimatedSection>
          )}
        </>
      )}

      <ChildFormModal
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
          setEditingChild(undefined);
        }}
        childId={editingChild?.id}
        initialData={editingChild ? mapChildToInitialData(editingChild as unknown as Record<string, unknown>) : undefined}
      />

      <ConfirmDialog
        visible={deleteDialogVisible}
        title={t('children_screen.delete_confirm_title')}
        message={t('children_screen.delete_confirm_message', { name: childToDelete?.name || '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        variant="danger"
      />

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="children"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing[6],
  },
  content: {
    padding: theme.spacing[6],
    minHeight: '100%',
    backgroundColor: theme.colors.background.primary,
  },
  header: {
    marginBottom: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  addCharacterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
    marginTop: theme.spacing[6],
    gap: theme.spacing[2],
  },
  addCharacterButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  grid: Platform.select({
    web: {
      display: 'grid' as any,
      gap: theme.spacing[4],
    },
    default: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: theme.spacing[4],
    },
  }),
  emptyState: {
    alignItems: 'center',
    marginTop: theme.spacing[12],
    paddingVertical: theme.spacing[10],
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: theme.spacing[4],
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  emptyHint: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[6],
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
  },
  emptyButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.status.error,
    textAlign: 'center',
  },
});
