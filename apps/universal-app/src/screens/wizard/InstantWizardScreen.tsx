import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import i18n from '@/config/i18n';
import { navigateToStory } from '@/navigation/navigationRef';
import { theme } from '@/theme';
import { PhotoUploadGrid } from '@/components/form/PhotoUploadGrid';
import { GenerationProgressModal } from '@/components/GenerationProgressModal';
import { ScenarioCardsGrid } from './components/ScenarioCardsGrid';
import { LanguageSelector } from './components/LanguageSelector';
import { StoryCreationNotice } from './components/StoryCreationNotice';
import { useQueryClient } from '@tanstack/react-query';
import { useStoryThemes } from '@/api/dictionaries';
import { useCreateStoryFromPhotos, useStoryStatus, useRetryStoryImages } from '@/api/stories';
import { useSubscriptionUsage } from '@/api/plans';
import { PaywallModal } from '@/components/PaywallModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { AppButton } from '@/components/AppButton';
import { GenerationErrorModal } from '@/components/GenerationErrorModal';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { getAnalytics } from '@/services/analytics';
import { formatSubscriptionPeriodEnd } from '@/utils/formatSubscriptionPeriodEnd';
import { getWebSearch } from '@/utils/webRuntime';
import type { MainDrawerParamList } from '@/types/navigation';
import { useAuthStore } from '@/store/authStore';
import { useChildren } from '@/api/children';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import { isServerAssetUrl } from '@/utils/assetUrl';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from '@/components/AppLinearGradient';
import { modernColors, modernGradients, modernShadows } from '@/theme/modernTheme';
import { getWizardScenarioPreset } from './wizardRouteParams';

type AgeGroup = '2-3' | '4-5' | '6-7' | '8-9' | '10-12';

type ChildAgeData = {
  years?: number;
  ageGroup?: string;
};

interface PhotoObject {
  url: string;
  uploadedAt: string;
  storagePath?: string;
  isUploading?: boolean;
  fileKey?: string;
  [key: string]: unknown;
}

function normalizeInstantAgeGroup(age?: ChildAgeData | null): AgeGroup | null {
  if (!age) return null;

  if (typeof age.years === 'number') {
    if (age.years <= 3) return '2-3';
    if (age.years <= 5) return '4-5';
    if (age.years <= 7) return '6-7';
    if (age.years <= 9) return '8-9';
    if (age.years <= 12) return '10-12';
  }

  switch (age.ageGroup) {
    case '2-3':
      return '2-3';
    case '4-5':
      return '4-5';
    case '6-7':
    case '6-8':
      return '6-7';
    case '8-9':
      return '8-9';
    case '9-12':
    case '10-12':
      return '10-12';
    default:
      return null;
  }
}

export default function InstantWizardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const route = useRoute<RouteProp<MainDrawerParamList, 'Wizard'>>();
  const queryClient = useQueryClient();
  const enterKey = useScreenEnter();
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const presetScenarioCardId = useMemo(
    () => getWizardScenarioPreset(route.params, getWebSearch()),
    [route.params]
  );
  const presetScenarioAppliedRef = React.useRef(false);
  const sessionMode = useAuthStore((state) => state.sessionMode);
  const activeChild = useAuthStore((state) => state.activeChild);
  const isChildSession = sessionMode === 'child';
  const childModeSettings = activeChild?.childMode?.childModeSettings;
  const canGenerateStories = !isChildSession || childModeSettings?.storyGenerationEnabled !== false;
  const allowedLanguageCodes = isChildSession
    ? (childModeSettings?.allowedLanguageCodes ?? [])
    : [];

  // Form state
  const [photos, setPhotos] = useState<PhotoObject[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('4-5');
  const [storyLanguage, setStoryLanguage] = useState('');
  const [scenarioCardId, setScenarioCardId] = useState<string | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [generationErrorMessage, setGenerationErrorMessage] = useState<string | null>(null);

  // API hooks
  const { data: themesData, isLoading: themesLoading } = useStoryThemes();
  const { data: childrenData } = useChildren(!isChildSession && Boolean(route.params?.childId));
  const { data: usage } = useSubscriptionUsage();
  const periodEndFormatted = useMemo(
    () => formatSubscriptionPeriodEnd(usage?.currentPeriodEnd ?? usage?.resetsAt, i18n.language),
    [usage?.currentPeriodEnd, usage?.resetsAt, i18n.language]
  );
  const createStoryFromPhotos = useCreateStoryFromPhotos();
  const retryStoryImages = useRetryStoryImages();
  const { data: storyStatus } = useStoryStatus(requestId || '', !!requestId);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [navigation]);

  // Set default language from i18n
  useEffect(() => {
    if (!storyLanguage && i18n.language) {
      setStoryLanguage(i18n.language);
    }
  }, [i18n.language]);

  useEffect(() => {
    const ageSource = isChildSession
      ? activeChild?.age
      : childrenData?.children.find((item) => item.id === route.params?.childId)?.age;
    const normalizedAgeGroup = normalizeInstantAgeGroup(ageSource);
    if (normalizedAgeGroup) {
      setAgeGroup(normalizedAgeGroup);
    }
  }, [activeChild?.age, childrenData?.children, isChildSession, route.params?.childId]);

  useEffect(() => {
    if (presetScenarioAppliedRef.current || !presetScenarioCardId) return;

    const scenarioExists = (themesData?.scenarioCards ?? []).some(
      (scenario) => scenario.id === presetScenarioCardId
    );
    if (!scenarioExists) return;

    setScenarioCardId(presetScenarioCardId);
    presetScenarioAppliedRef.current = true;
  }, [presetScenarioCardId, themesData?.scenarioCards]);

  // Track image_generation_failed when modal shows failed state
  const failedTrackedRef = React.useRef(false);
  useEffect(() => {
    if (storyStatus?.status === 'failed' && !failedTrackedRef.current) {
      failedTrackedRef.current = true;
      getAnalytics().capture('image_generation_failed', {
        request_id: requestId ?? undefined,
        story_id: storyStatus?.storyId,
        wizard_type: 'instant',
      });
    }
  }, [storyStatus?.status, storyStatus?.storyId, requestId]);

  const handleGenerate = async () => {
    if (!canGenerateStories) {
      Alert.alert(t('common.error') || 'Error', t('wizard.create_error'));
      return;
    }

    if (!storyLanguage) {
      Alert.alert(t('common.error') || 'Error', t('wizard.language_required'));
      return;
    }

    if (usage && usage.stories.remaining <= 0) {
      setShowPaywall(true);
      return;
    }

    try {
      setIsGenerating(true);
      getAnalytics().capture('story_generation_started', {
        wizard_type: 'instant',
        scenario_card_id: scenarioCardId ?? undefined,
        has_photos: photos.length > 0,
        age_group: ageGroup ?? undefined,
        photo_count: photos.length,
      });

      const photoUrls = photos
        .filter((photo) => !photo.isUploading && isServerAssetUrl(photo.url))
        .map((photo) => photo.url)
        .filter((u): u is string => !!u);

      if (photoUrls.length === 0) {
        setIsGenerating(false);
        Alert.alert(
          t('common.error') || 'Error',
          t('instant_wizard.photos_required', {
            defaultValue: 'Add at least one photo before generating a story.',
          })
        );
        return;
      }

      const payload = {
        photos: photoUrls,
        ageGroup,
        language: storyLanguage || i18n.language,
        scenario: scenarioCardId ?? 'default',
        ...(!isChildSession && route.params?.childId
          ? { childProfileId: route.params.childId }
          : {}),
      };

      const result = await createStoryFromPhotos.mutateAsync(payload);
      setRequestId(result.id);
      // Keep modal open - polling will track progress
    } catch (error: unknown) {
      console.error('Failed to create story from photos:', error);
      getAnalytics().capture('story_generation_failed', {
        wizard_type: 'instant',
        scenario_card_id: scenarioCardId ?? undefined,
        has_photos: photos.length > 0,
      });
      setIsGenerating(false);
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setShowPaywall(true);
      } else {
        setGenerationErrorMessage(
          getLocalizedApiError(t, error, 'wizard.generation_error_message')
        );
      }
    }
  };

  const handleRetry = async () => {
    if (storyStatus?.storyId && requestId) {
      getAnalytics().capture('retry_images_clicked', {
        request_id: requestId,
        story_id: storyStatus.storyId,
      });
      try {
        setIsGenerating(true);
        await retryStoryImages.mutateAsync(requestId);
      } catch (error) {
        console.error('Retry failed:', error);
        Alert.alert(
          t('common.error') || 'Error',
          getLocalizedApiError(t, error, 'wizard.retry_error')
        );
        setIsGenerating(false);
      }
    }
  };

  const handleCloseModal = () => {
    if (storyStatus?.storyId) {
      getAnalytics().capture('story_created', {
        story_id: storyStatus.storyId,
        wizard_type: 'instant',
      });
    }
    queryClient.invalidateQueries({ queryKey: ['stories'] });
    setIsGenerating(false);
    setRequestId(null);

    if (storyStatus?.storyId) {
      navigateToStory(storyStatus.storyId);
    }
  };

  const hasUploadingPhotos = photos.some((photo) => photo.isUploading);
  const readyPhotoCount = photos.filter(
    (photo) => !photo.isUploading && isServerAssetUrl(photo.url)
  ).length;
  const canGenerate = Boolean(storyLanguage) && readyPhotoCount > 0 && !hasUploadingPhotos;
  const selectedScenarioName =
    themesData?.scenarioCards?.find((scenario) => scenario.id === scenarioCardId)?.name ??
    t('instant_wizard.default_theme', { defaultValue: 'Free theme' });
  const selectedLanguageLabel = storyLanguage
    ? t(`language_names.${storyLanguage}`, { defaultValue: storyLanguage.toUpperCase() })
    : t('wizard.language_required', { defaultValue: 'Choose a language' });

  return (
    <LinearGradient colors={modernGradients.page} style={styles.page}>
      <ScrollView contentContainerStyle={styles.container} testID="wizard-instant-screen">
        <AnimatedSection delay={0} trigger={enterKey}>
          <View style={styles.heroPanel}>
            <View style={styles.heroIcon}>
              <Ionicons name="flash-outline" size={24} color={theme.colors.primary[700]} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.title}>
                {t('instant_wizard.title', { defaultValue: t('navigation.create') })}
              </Text>
              <Text style={styles.subtitle}>
                {t('instant_wizard.subtitle', {
                  defaultValue:
                    'A lighter setup for a fast personalized story with photos, age, theme and language.',
                })}
              </Text>
            </View>
          </View>
        </AnimatedSection>

        <View style={[styles.workspace, isWide && styles.workspaceWide]}>
          <View style={styles.mainColumn}>
            <AnimatedSection delay={80} trigger={enterKey}>
              <View style={styles.surfaceSection}>
                <Text style={styles.sectionTitle}>{t('instant_wizard.upload_photos')}</Text>
                <Text style={styles.sectionDescription}>
                  {t('instant_wizard.photos_description')}
                </Text>
                <PhotoUploadGrid
                  photos={photos.map((p) => ({
                    url: p.url,
                    uploadedAt: p.uploadedAt || new Date().toISOString(),
                    storagePath: p.storagePath,
                    isUploading: p.isUploading,
                  }))}
                  onPhotosChange={(newPhotos) =>
                    setPhotos(
                      newPhotos.map((p) => ({
                        url: p.url,
                        uploadedAt: p.uploadedAt,
                        storagePath: p.storagePath,
                        isUploading: p.isUploading,
                      }))
                    )
                  }
                  maxPhotos={5}
                  photoType="character"
                  imageRightsConsentMode="story-submit"
                />
              </View>
            </AnimatedSection>

            {!isChildSession ? (
              <AnimatedSection delay={160} trigger={enterKey}>
                <View style={styles.surfaceSection}>
                  <Text style={styles.sectionTitle}>{t('instant_wizard.age_group')}</Text>
                  <Text style={styles.sectionDescription}>
                    {t('instant_wizard.age_group_description')}
                  </Text>
                  <View style={styles.ageGroupContainer}>
                    {(['2-3', '4-5', '6-7', '8-9', '10-12'] as AgeGroup[]).map((age) => (
                      <TouchableOpacity
                        key={age}
                        style={[
                          styles.ageGroupButton,
                          ageGroup === age && styles.ageGroupButtonSelected,
                        ]}
                        onPress={() => setAgeGroup(age)}
                        activeOpacity={0.7}
                        testID={`wizard-age-${age}`}
                      >
                        <Text
                          style={[
                            styles.ageGroupText,
                            ageGroup === age && styles.ageGroupTextSelected,
                          ]}
                        >
                          {age} {t('instant_wizard.years')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </AnimatedSection>
            ) : null}

            <AnimatedSection delay={240} trigger={enterKey}>
              {themesLoading ? (
                <View style={styles.loadingCard}>
                  <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                </View>
              ) : (
                <ScenarioCardsGrid
                  scenarios={themesData?.scenarioCards || []}
                  selected={scenarioCardId}
                  onSelect={setScenarioCardId}
                />
              )}
            </AnimatedSection>

            <AnimatedSection delay={320} trigger={enterKey}>
              <LanguageSelector
                selected={storyLanguage}
                onSelect={setStoryLanguage}
                defaultLanguage={i18n.language}
                allowedLanguageCodes={allowedLanguageCodes}
              />
            </AnimatedSection>
          </View>

          <AnimatedSection delay={400} trigger={enterKey}>
            <View style={[styles.summaryCard, isWide && styles.summaryCardWide]}>
              <Text style={styles.summaryEyebrow}>
                {t('wizard.story_preview', { defaultValue: 'Story preview' })}
              </Text>
              <Text style={styles.summaryTitle}>
                {t('wizard.your_story', { defaultValue: 'Your story' })}
              </Text>
              <View style={styles.summaryList}>
                <View style={styles.summaryRow}>
                  <Ionicons name="images-outline" size={18} color={theme.colors.primary[600]} />
                  <Text style={styles.summaryText}>
                    {t('instant_wizard.summary_photos', {
                      count: photos.length,
                      max: 5,
                      defaultValue: '{{count}} / {{max}} photos',
                    })}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Ionicons name="happy-outline" size={18} color={theme.colors.primary[600]} />
                  <Text style={styles.summaryText}>
                    {ageGroup} {t('instant_wizard.years')}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Ionicons name="sparkles-outline" size={18} color={theme.colors.primary[600]} />
                  <Text style={styles.summaryText}>{selectedScenarioName}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Ionicons name="language-outline" size={18} color={theme.colors.primary[600]} />
                  <Text style={styles.summaryText}>{selectedLanguageLabel}</Text>
                </View>
              </View>
              <StoryCreationNotice testID="wizard-instant-story-creation-notice" />
              <AppButton
                label={t('instant_wizard.generate_story')}
                onPress={handleGenerate}
                disabled={!canGenerate || isGenerating || !canGenerateStories}
                loading={isGenerating}
                style={styles.generateButton}
                testID="wizard-instant-generate"
              />
            </View>
          </AnimatedSection>
        </View>

        {/* Generation Progress Modal */}
        <GenerationProgressModal
          visible={isGenerating}
          requestId={requestId ?? undefined}
          status={storyStatus?.status || 'pending'}
          progress={storyStatus?.progress || 0}
          progressData={storyStatus?.progressData}
          errorMessage={storyStatus?.errorMessage ?? undefined}
          onRetry={handleRetry}
          onClose={handleCloseModal}
          onReport={storyStatus?.status === 'failed' ? () => setShowFeedbackModal(true) : undefined}
        />

        <FeedbackModal
          visible={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          initialReportedScreen="wizard"
        />

        <PaywallModal
          visible={showPaywall}
          onClose={() => setShowPaywall(false)}
          limitInfo={usage ? { used: usage.stories.used, limit: usage.stories.limit } : undefined}
          periodEndFormatted={periodEndFormatted}
        />
        <GenerationErrorModal
          visible={generationErrorMessage !== null}
          message={generationErrorMessage}
          onClose={() => setGenerationErrorMessage(null)}
        />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  container: {
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[10],
  },
  heroPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[4],
    padding: theme.spacing[5],
    borderRadius: theme.borders.radius.xl,
    backgroundColor: modernColors.surface,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    ...modernShadows.subtle,
    marginBottom: theme.spacing[5],
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: modernColors.accentWash,
  },
  heroText: {
    flex: 1,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeight.normal * theme.typography.fontSize.base,
  },
  workspace: {
    gap: theme.spacing[5],
  },
  workspaceWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mainColumn: {
    flex: 1,
    gap: theme.spacing[5],
  },
  surfaceSection: {
    padding: theme.spacing[5],
    borderRadius: theme.borders.radius.xl,
    backgroundColor: modernColors.surface,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    ...modernShadows.subtle,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  sectionDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
    lineHeight: theme.typography.lineHeight.normal * theme.typography.fontSize.sm,
  },
  ageGroupContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  ageGroupButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceMuted,
  },
  ageGroupButtonSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  ageGroupText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
  },
  ageGroupTextSelected: {
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  loadingCard: {
    padding: theme.spacing[6],
    borderRadius: theme.borders.radius.xl,
    backgroundColor: modernColors.surface,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    ...modernShadows.subtle,
  },
  summaryCard: {
    padding: theme.spacing[5],
    borderRadius: theme.borders.radius.xl,
    backgroundColor: modernColors.surface,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    ...modernShadows.card,
    gap: theme.spacing[4],
  },
  summaryCardWide: {
    width: 320,
    position: 'sticky' as never,
    top: theme.spacing[5],
  },
  summaryEyebrow: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    backgroundColor: modernColors.accentWash,
    color: theme.colors.primary[700],
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  summaryTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  summaryList: {
    gap: theme.spacing[3],
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  summaryText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  generateButton: {
    alignSelf: 'stretch',
  },
});
