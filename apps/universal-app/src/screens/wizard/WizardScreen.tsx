import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useTranslation } from 'react-i18next';
import i18n from '@/config/i18n';
import { navigateToStory } from '@/navigation/navigationRef';
import { theme } from '@/theme';
import { ExpandableCard } from '@/components/ExpandableCard';
import { GenerationProgressModal } from '@/components/GenerationProgressModal';
import { ChildFormModal } from '@/components/ChildFormModal';
import { CharacterFormModal } from '@/components/CharacterFormModal';
import { ScenarioCardsGrid } from './components/ScenarioCardsGrid';
import { LanguageSelector } from './components/LanguageSelector';
import { AdvancedSettingsForm } from './components/AdvancedSettingsForm';
import { CharactersForm } from './components/CharactersForm';
import { useQueryClient } from '@tanstack/react-query';
import { useStoryThemes } from '@/api/dictionaries';
import { useChildren } from '@/api/children';
import { useCharacters } from '@/api/characters';
import { useCreateStory, useCreateChildModeStory, useStoryStatus, useRetryStoryImages } from '@/api/stories';
import { useSubscriptionUsage } from '@/api/plans';
import { useAuthStore } from '@/store/authStore';
import { PaywallModal } from '@/components/PaywallModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { GlassPrimaryButton } from '@/components/GlassPrimaryButton';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { getAnalytics } from '@/services/analytics';
import { formatSubscriptionPeriodEnd } from '@/utils/formatSubscriptionPeriodEnd';

export default function WizardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();
  const enterKey = useScreenEnter();
  const sessionMode = useAuthStore((state) => state.sessionMode);
  const activeChild = useAuthStore((state) => state.activeChild);
  const isChildSession = sessionMode === 'child';
  const childModeSettings = activeChild?.childMode?.childModeSettings;
  const canGenerateStories = !isChildSession || childModeSettings?.storyGenerationEnabled !== false;
  const notesEnabled = !isChildSession || childModeSettings?.freeTextPromptsEnabled !== false;
  const allowedLanguageCodes = isChildSession ? childModeSettings?.allowedLanguageCodes ?? [] : [];

  // Form state
  const [storyLanguage, setStoryLanguage] = useState('');
  const [scenarioCardId, setScenarioCardId] = useState<string | null>(null);
  const [childProfileId, setChildProfileId] = useState<string | undefined>(undefined);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [imageStyle, setImageStyle] = useState<string | undefined>(undefined);
  const [userNotes, setUserNotes] = useState('');
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]); // NEW: Selected child profiles
  
  // Modal state
  const [isChildModalVisible, setIsChildModalVisible] = useState(false);
  const [isCharacterModalVisible, setIsCharacterModalVisible] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  
  // API hooks
  const { data: themesData, isLoading: themesLoading } = useStoryThemes();
  const { data: childrenData, isLoading: childrenLoading } = useChildren(!isChildSession);
  const children = isChildSession && activeChild
    ? [{
        id: activeChild.id,
        name: activeChild.name,
        referencePhotos: activeChild.referencePhotos,
        turnaroundSheet: activeChild.turnaroundSheet,
      }]
    : childrenData?.children ?? [];
  const canCreateMoreChildren = !isChildSession && (childrenData?.canCreateMore ?? false);
  const { data: characters, isLoading: charactersLoading } = useCharacters();
  const createStory = useCreateStory();
  const createChildModeStory = useCreateChildModeStory();
  const retryStoryImages = useRetryStoryImages();
  const { data: storyStatus } = useStoryStatus(requestId || '', !!requestId);
  const { data: usage } = useSubscriptionUsage();
  const [showPaywall, setShowPaywall] = useState(false);
  const periodEndFormatted = useMemo(
    () => formatSubscriptionPeriodEnd(usage?.currentPeriodEnd ?? usage?.resetsAt, i18n.language),
    [usage?.currentPeriodEnd, usage?.resetsAt, i18n.language]
  );

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

  useEffect(() => {
    if (!isChildSession || !activeChild?.id) return;
    setChildProfileId(activeChild.id);
    setSelectedChildren([activeChild.id]);
  }, [activeChild?.id, isChildSession]);

  const availableGoals = useMemo(() => {
    const goals = themesData?.goals || [];
    const allowed = childModeSettings?.allowedThemeSlugs ?? [];
    if (!isChildSession || allowed.length === 0) return goals;
    return goals.filter((goal) => allowed.includes(goal.slug));
  }, [childModeSettings?.allowedThemeSlugs, isChildSession, themesData?.goals]);

  const availableCharacters = useMemo(() => {
    const allCharacters = characters ?? [];
    const scopedCharacters = !isChildSession && childProfileId
      ? allCharacters.filter((character) => character.childProfileId === childProfileId)
      : allCharacters;
    const allowed = childModeSettings?.allowedCharacterIds ?? [];
    if (!isChildSession || allowed.length === 0) return scopedCharacters;
    return scopedCharacters.filter((character) => allowed.includes(character.id));
  }, [characters, childModeSettings?.allowedCharacterIds, childProfileId, isChildSession]);

  useEffect(() => {
    const allowedIds = new Set(availableCharacters.map((character) => character.id));
    setSelectedCharacters((current) => current.filter((id) => allowedIds.has(id)));
  }, [availableCharacters]);

  // Track image_generation_failed when modal shows failed state
  const failedTrackedRef = React.useRef(false);
  useEffect(() => {
    if (storyStatus?.status === 'failed' && !failedTrackedRef.current) {
      failedTrackedRef.current = true;
      getAnalytics().capture('image_generation_failed', {
        request_id: requestId ?? undefined,
        story_id: storyStatus?.storyId,
        wizard_type: 'artisan',
      });
    }
  }, [storyStatus?.status, storyStatus?.storyId, requestId]);
  
  // Auto-close removed - user must manually close modal
  
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
        wizard_type: 'artisan',
        scenario_card_id: scenarioCardId ?? undefined,
        has_characters: selectedCharacters.length > 0,
        has_children: selectedChildren.length > 0,
        has_goal: selectedGoals.length > 0,
        has_image_style: !!imageStyle,
        has_user_notes: userNotes.trim().length > 0,
        has_child_profile: !!childProfileId,
        character_count: selectedCharacters.length,
        children_count: selectedChildren.length,
      });

      const payload = {
        uiLocale: i18n.language,
        storyLanguage,
        ...(scenarioCardId && { scenarioCardId }),
        ...(childProfileId && { childProfileId }), // Keep for age/sensitivity context
        ...(selectedGoals.length > 0 && { goal: selectedGoals[0] }), // Backend accepts single goal
        ...(imageStyle && { imageStyle }),
        ...(notesEnabled && userNotes && { userNotes }),
        ...(selectedCharacters.length > 0 && { selectedCharacters }),
        ...(selectedChildren.length > 0 && { selectedChildren }), // NEW: Selected children as characters
      };
      
      const result = await (isChildSession ? createChildModeStory : createStory).mutateAsync(payload);
      setRequestId(result.id);
    } catch (error: unknown) {
      console.error('Failed to create story:', error);
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
        // Modal stays open, requestId unchanged — useStoryStatus continues polling
      } catch (error) {
        console.error('Retry images failed:', error);
        setIsGenerating(false);
        Alert.alert(t('common.error') || 'Error', t('wizard.retry_error'));
      }
    } else {
      setRequestId(null);
      setIsGenerating(false);
      handleGenerate();
    }
  };
  
  const handleCloseModal = () => {
    const storyId = storyStatus?.storyId;
    if (storyId) {
      getAnalytics().capture('story_created', {
        story_id: storyId,
        wizard_type: 'artisan',
      });
    }
    queryClient.invalidateQueries({ queryKey: ['stories'] });
    setIsGenerating(false);
    setRequestId(null);
    
    if (storyId) {
      // Navigate to the newly created story
      navigateToStory(storyId);
    } else {
      navigation.navigate('Library');
    }
  };
  
  if (themesLoading || (!isChildSession && childrenLoading) || charactersLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }
  
  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <AnimatedSection delay={0} trigger={enterKey}>
          <ScenarioCardsGrid
            scenarios={themesData?.scenarioCards || []}
            selected={scenarioCardId}
            onSelect={setScenarioCardId}
          />
        </AnimatedSection>

        <AnimatedSection delay={120} trigger={enterKey}>
          <LanguageSelector
            selected={storyLanguage}
            onSelect={setStoryLanguage}
            defaultLanguage={i18n.language}
            allowedLanguageCodes={allowedLanguageCodes}
          />
        </AnimatedSection>

        <AnimatedSection delay={220} trigger={enterKey}>
          <ExpandableCard title={t('wizard.advanced_settings')} icon="settings-outline">
            <AdvancedSettingsForm
              childProfileId={childProfileId}
              onChildProfileChange={setChildProfileId}
              children={children}
              onAddChild={canCreateMoreChildren ? () => setIsChildModalVisible(true) : undefined}
              showChildProfileSelector={!isChildSession}
              goals={availableGoals}
              selectedGoals={selectedGoals}
              onGoalsChange={setSelectedGoals}
              imageStyle={imageStyle}
              onImageStyleChange={setImageStyle}
              userNotes={userNotes}
              onNotesChange={setUserNotes}
              notesEnabled={notesEnabled}
            />
          </ExpandableCard>
        </AnimatedSection>

        <AnimatedSection delay={320} trigger={enterKey}>
          <ExpandableCard title={t('wizard.add_characters')} icon="people-outline">
            <CharactersForm
              characters={availableCharacters}
              selectedCharacters={selectedCharacters}
              onCharactersChange={setSelectedCharacters}
              children={children}
              selectedChildren={selectedChildren}
              onChildrenChange={setSelectedChildren}
              showChildren={!isChildSession}
              onAddCharacter={() => setIsCharacterModalVisible(true)}
              onAddChild={canCreateMoreChildren ? () => setIsChildModalVisible(true) : undefined}
            />
          </ExpandableCard>
        </AnimatedSection>

        <AnimatedSection delay={420} trigger={enterKey}>
          <GlassPrimaryButton
            title={t('wizard.generate_button')}
            onPress={handleGenerate}
            disabled={!storyLanguage || isGenerating || !canGenerateStories}
            loading={isGenerating}
            size="hero"
            style={styles.generateButton}
          />
        </AnimatedSection>
      </ScrollView>
      
      {/* Generation Progress Modal */}
      <GenerationProgressModal
        visible={isGenerating}
        requestId={requestId ?? undefined}
        status={storyStatus?.status ?? 'pending'}
        progress={storyStatus?.progress || 0}
        progressData={storyStatus?.progressData}
        errorMessage={storyStatus?.errorMessage ?? undefined}
        onClose={storyStatus?.status === 'completed' ? handleCloseModal : undefined}
        onRetry={storyStatus?.status === 'failed' ? handleRetry : undefined}
        onReport={storyStatus?.status === 'failed' ? () => { setShowFeedbackModal(true); } : undefined}
        allowManualClose={true}
      />

      {/* Child Form Modal */}
      <ChildFormModal
        visible={isChildModalVisible}
        onClose={() => setIsChildModalVisible(false)}
      />

      {/* Character Form Modal */}
      <CharacterFormModal
        visible={isCharacterModalVisible}
        onClose={() => setIsCharacterModalVisible(false)}
      />

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        limitInfo={usage ? { used: usage.stories.used, limit: usage.stories.limit } : undefined}
        periodEndFormatted={periodEndFormatted}
      />

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="wizard"
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing[6],
    minHeight: '100%',
    backgroundColor: theme.colors.background.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.primary,
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
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
  generateButton: {
    marginTop: theme.spacing[6],
    marginBottom: theme.spacing[8],
    alignSelf: 'stretch',
  },
});
