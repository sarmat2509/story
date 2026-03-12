import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
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
import { useCreateStory, useStoryStatus, useRetryStoryImages } from '@/api/stories';
import { useSubscriptionUsage } from '@/api/plans';
import { PaywallModal } from '@/components/PaywallModal';
import { getAnalytics } from '@/services/analytics';

export default function WizardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();
  
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
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  
  // API hooks
  const { data: themesData, isLoading: themesLoading } = useStoryThemes();
  const { data: children, isLoading: childrenLoading } = useChildren();
  const { data: characters, isLoading: charactersLoading } = useCharacters();
  const createStory = useCreateStory();
  const retryStoryImages = useRetryStoryImages();
  const { data: storyStatus } = useStoryStatus(requestId || '', !!requestId);
  const { data: usage } = useSubscriptionUsage();
  const [showPaywall, setShowPaywall] = useState(false);
  
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
        wizard_type: 'artisan',
      });
    }
  }, [storyStatus?.status, storyStatus?.storyId, requestId]);
  
  // Auto-close removed - user must manually close modal
  
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
        ...(userNotes && { userNotes }),
        ...(selectedCharacters.length > 0 && { selectedCharacters }),
        ...(selectedChildren.length > 0 && { selectedChildren }), // NEW: Selected children as characters
      };
      
      const result = await createStory.mutateAsync(payload);
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
  
  if (themesLoading || childrenLoading || charactersLoading) {
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
        {/* Scenario Cards - Always Visible */}
        <ScenarioCardsGrid 
          scenarios={themesData?.scenarioCards || []}
          selected={scenarioCardId}
          onSelect={setScenarioCardId}
        />

        {/* Language Selector - Always Visible */}
        <LanguageSelector
          selected={storyLanguage}
          onSelect={setStoryLanguage}
          defaultLanguage={i18n.language}
        />

        {/* Optional Advanced Settings */}
        <ExpandableCard title={t('wizard.advanced_settings')} icon="settings-outline">
          <AdvancedSettingsForm 
            childProfileId={childProfileId}
            onChildProfileChange={setChildProfileId}
            children={children}
            onAddChild={() => setIsChildModalVisible(true)}
            goals={themesData?.goals || []}
            selectedGoals={selectedGoals}
            onGoalsChange={setSelectedGoals}
            imageStyle={imageStyle}
            onImageStyleChange={setImageStyle}
            userNotes={userNotes}
            onNotesChange={setUserNotes}
          />
        </ExpandableCard>

        {/* Optional Characters */}
        <ExpandableCard title={t('wizard.add_characters')} icon="people-outline">
          <CharactersForm 
            characters={characters}
            selectedCharacters={selectedCharacters}
            onCharactersChange={setSelectedCharacters}
            children={children}
            selectedChildren={selectedChildren}
            onChildrenChange={setSelectedChildren}
            onAddCharacter={() => setIsCharacterModalVisible(true)}
            onAddChild={() => setIsChildModalVisible(true)}
          />
        </ExpandableCard>

        {/* Generate Button - MOVED TO BOTTOM */}
        <TouchableOpacity 
          style={[styles.generateButton, (!storyLanguage) && styles.generateButtonDisabled]}
          onPress={handleGenerate}
          disabled={!storyLanguage || isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator color={theme.colors.text.inverse} />
          ) : (
            <Text style={styles.generateButtonText}>{t('wizard.generate_button')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      
      {/* Generation Progress Modal */}
      <GenerationProgressModal
        visible={isGenerating}
        status={storyStatus?.status ?? 'pending'}
        progress={storyStatus?.progress || 0}
        progressData={storyStatus?.progressData}
        errorMessage={storyStatus?.errorMessage ?? undefined}
        onClose={storyStatus?.status === 'completed' ? handleCloseModal : undefined}
        onRetry={storyStatus?.status === 'failed' ? handleRetry : undefined}
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
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
    alignItems: 'center',
    marginTop: theme.spacing[6],
    marginBottom: theme.spacing[8],
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
  },
});
