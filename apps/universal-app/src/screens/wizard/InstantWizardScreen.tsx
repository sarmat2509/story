import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import i18n from '@/config/i18n';
import { navigateToStory } from '@/navigation/navigationRef';
import { theme } from '@/theme';
import { PhotoUploadGrid } from '@/components/form/PhotoUploadGrid';
import { GenerationProgressModal } from '@/components/GenerationProgressModal';
import { ScenarioCardsGrid } from './components/ScenarioCardsGrid';
import { LanguageSelector } from './components/LanguageSelector';
import { useQueryClient } from '@tanstack/react-query';
import { useStoryThemes } from '@/api/dictionaries';
import { useCreateStoryFromPhotos, useStoryStatus, useRetryStoryImages } from '@/api/stories';
import { useSubscriptionUsage } from '@/api/plans';
import { PaywallModal } from '@/components/PaywallModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { GlassPrimaryButton } from '@/components/GlassPrimaryButton';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { getAnalytics } from '@/services/analytics';
import { formatSubscriptionPeriodEnd } from '@/utils/formatSubscriptionPeriodEnd';
import type { MainDrawerParamList } from '@/types/navigation';

type AgeGroup = '2-3' | '4-5' | '6-7' | '8-9' | '10-12';

interface PhotoObject {
  url: string;
  uploadedAt: string;
  fileKey?: string;
  [key: string]: unknown;
}

export default function InstantWizardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();
  const enterKey = useScreenEnter();

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

  // API hooks
  const { data: themesData, isLoading: themesLoading } = useStoryThemes();
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
      headerRight: () => (
        <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />
      ),
    });
  }, [navigation]);

  // Set default language from i18n
  useEffect(() => {
    if (!storyLanguage && i18n.language) {
      setStoryLanguage(i18n.language);
    }
  }, [i18n.language]);

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

      // Extract URLs from photo objects
      const photoUrls = photos.map(photo => (typeof photo === 'string' ? photo : photo.url)).filter((u): u is string => !!u);

      const payload = {
        photos: photoUrls,
        ageGroup,
        language: storyLanguage || i18n.language,
        scenario: scenarioCardId ?? 'default',
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
        error_message: error instanceof Error ? error.message : String(error),
      });
      setIsGenerating(false);
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setShowPaywall(true);
      } else {
        Alert.alert(t('common.error') || 'Error', t('wizard.create_error'));
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
        Alert.alert(t('common.error') || 'Error', t('wizard.retry_error'));
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

  const canGenerate = storyLanguage;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AnimatedSection delay={0} trigger={enterKey}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('instant_wizard.upload_photos')}</Text>
          <Text style={styles.sectionDescription}>{t('instant_wizard.photos_description')}</Text>
          <PhotoUploadGrid
            photos={photos.map((p) => ({ url: p.url, uploadedAt: p.uploadedAt || new Date().toISOString(), isUploading: (p as { isUploading?: boolean }).isUploading }))}
            onPhotosChange={(newPhotos) => setPhotos(newPhotos.map((p) => ({ url: p.url, uploadedAt: p.uploadedAt })))}
            maxPhotos={5}
            photoType="character"
          />
        </View>
      </AnimatedSection>

      <AnimatedSection delay={120} trigger={enterKey}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('instant_wizard.age_group')}</Text>
          <Text style={styles.sectionDescription}>{t('instant_wizard.age_group_description')}</Text>
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

      <AnimatedSection delay={220} trigger={enterKey}>
        <View style={styles.section}>
          {themesLoading ? (
            <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
          ) : (
            <ScenarioCardsGrid
              scenarios={themesData?.scenarioCards || []}
              selected={scenarioCardId}
              onSelect={setScenarioCardId}
            />
          )}
        </View>
      </AnimatedSection>

      <AnimatedSection delay={320} trigger={enterKey}>
        <View style={styles.section}>
          <LanguageSelector
            selected={storyLanguage}
            onSelect={setStoryLanguage}
            defaultLanguage={i18n.language}
          />
        </View>
      </AnimatedSection>

      <AnimatedSection delay={420} trigger={enterKey}>
        <GlassPrimaryButton
          title={t('instant_wizard.generate_story')}
          onPress={handleGenerate}
          disabled={!canGenerate || isGenerating}
          loading={isGenerating}
          size="hero"
          style={styles.generateButton}
        />
      </AnimatedSection>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing[6],
    backgroundColor: theme.colors.background.primary,
  },
  section: {
    marginBottom: theme.spacing[6],
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
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.secondary,
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
  generateButton: {
    marginTop: theme.spacing[6],
    alignSelf: 'stretch',
  },
});
