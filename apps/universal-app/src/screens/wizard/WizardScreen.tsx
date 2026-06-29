import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/config/i18n';
import { navigateToStory } from '@/navigation/navigationRef';
import { theme } from '@/theme';
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
import {
  useCreateStory,
  useCreateGraphicNovel,
  useCreateMixedStory,
  useCreateChildModeStory,
  useStoryStatus,
  useRetryStoryImages,
} from '@/api/stories';
import { useSubscriptionUsage } from '@/api/plans';
import { useAuthStore } from '@/store/authStore';
import { PaywallModal } from '@/components/PaywallModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { AppButton } from '@/components/AppButton';
import { LinearGradient } from '@/components/AppLinearGradient';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { getAnalytics } from '@/services/analytics';
import { formatSubscriptionPeriodEnd } from '@/utils/formatSubscriptionPeriodEnd';
import { getWebSearch } from '@/utils/webRuntime';
import { modernColors, modernGradients, modernShadows } from '@/theme/modernTheme';
import { IMAGE_STYLE_METADATA, type ImageStyle } from '@wondertales/shared';
import { getWizardScenarioPreset } from './wizardRouteParams';

type StoryFormat = 'story' | 'comic' | 'mixed';

export default function WizardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const route = useRoute<RouteProp<MainDrawerParamList, 'Wizard'>>();
  const queryClient = useQueryClient();
  const enterKey = useScreenEnter();
  const { width } = useWindowDimensions();
  const isWide = width >= 1100;
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
  const notesEnabled = !isChildSession || childModeSettings?.freeTextPromptsEnabled !== false;
  const allowedLanguageCodes = isChildSession
    ? (childModeSettings?.allowedLanguageCodes ?? [])
    : [];

  // Form state
  const [storyFormat, setStoryFormat] = useState<StoryFormat>('story');
  const [storyLanguage, setStoryLanguage] = useState('');
  const [scenarioCardId, setScenarioCardId] = useState<string | null>(null);
  const [childProfileId, setChildProfileId] = useState<string | undefined>(undefined);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [imageStyle, setImageStyle] = useState<ImageStyle | undefined>(undefined);
  const [userNotes, setUserNotes] = useState('');
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]); // NEW: Selected child profiles
  const [activeStep, setActiveStep] = useState(0);
  const [isAiNoticeExpanded, setIsAiNoticeExpanded] = useState(false);

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
  const children =
    isChildSession && activeChild
      ? [
          {
            id: activeChild.id,
            name: activeChild.name,
            referencePhotos: activeChild.referencePhotos,
            turnaroundSheet: activeChild.turnaroundSheet,
          },
        ]
      : (childrenData?.children ?? []);
  const canCreateMoreChildren = !isChildSession && (childrenData?.canCreateMore ?? false);
  const { data: characters, isLoading: charactersLoading } = useCharacters();
  const createStory = useCreateStory();
  const createGraphicNovel = useCreateGraphicNovel();
  const createMixedStory = useCreateMixedStory();
  const createChildModeStory = useCreateChildModeStory();
  const retryStoryImages = useRetryStoryImages();
  const { data: storyStatus } = useStoryStatus(requestId || '', !!requestId);
  const { data: usage } = useSubscriptionUsage();
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallKind, setPaywallKind] = useState<'stories' | 'graphicNovels'>('stories');
  const periodEndFormatted = useMemo(
    () => formatSubscriptionPeriodEnd(usage?.currentPeriodEnd ?? usage?.resetsAt, i18n.language),
    [usage?.currentPeriodEnd, usage?.resetsAt, i18n.language]
  );
  const graphicNovelLimit = usage?.graphicNovels?.limit;
  const graphicNovelAccessLocked =
    typeof graphicNovelLimit === 'number' && graphicNovelLimit >= 0 && graphicNovelLimit <= 0;
  const isGraphicNovelUpgradePaywall = paywallKind === 'graphicNovels' && graphicNovelAccessLocked;
  const usesGraphicQuota = storyFormat === 'comic' || storyFormat === 'mixed';
  const storyFormatAnalytics =
    storyFormat === 'comic'
      ? 'graphic_novel'
      : storyFormat === 'mixed'
        ? 'mixed_story'
        : 'story';

  const openGraphicNovelPaywall = () => {
    setPaywallKind('graphicNovels');
    setShowPaywall(true);
  };

  const handleStoryFormatSelect = (nextFormat: StoryFormat) => {
    if ((nextFormat === 'comic' || nextFormat === 'mixed') && graphicNovelAccessLocked) {
      openGraphicNovelPaywall();
      return;
    }
    setStoryFormat(nextFormat);
  };

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
    if (!isChildSession || !activeChild?.id) return;
    setChildProfileId(activeChild.id);
    setSelectedChildren([activeChild.id]);
  }, [activeChild?.id, isChildSession]);

  useEffect(() => {
    if (isChildSession && usesGraphicQuota) {
      setStoryFormat('story');
    }
  }, [isChildSession, storyFormat, usesGraphicQuota]);

  useEffect(() => {
    if (usesGraphicQuota && graphicNovelAccessLocked) {
      setStoryFormat('story');
    }
  }, [graphicNovelAccessLocked, storyFormat, usesGraphicQuota]);

  useEffect(() => {
    if (isChildSession || !route.params?.childId) return;
    setChildProfileId(route.params.childId);
    setSelectedChildren([route.params.childId]);
  }, [isChildSession, route.params?.childId]);

  const availableGoals = useMemo(() => {
    const goals = themesData?.goals || [];
    const allowed = childModeSettings?.allowedThemeSlugs ?? [];
    if (!isChildSession || allowed.length === 0) return goals;
    return goals.filter((goal) => allowed.includes(goal.slug));
  }, [childModeSettings?.allowedThemeSlugs, isChildSession, themesData?.goals]);

  const availableCharacters = useMemo(() => {
    const allCharacters = characters ?? [];
    const allowed = childModeSettings?.allowedCharacterIds ?? [];
    if (!isChildSession || allowed.length === 0) return allCharacters;
    return allCharacters.filter((character) => allowed.includes(character.id));
  }, [characters, childModeSettings?.allowedCharacterIds, isChildSession]);

  const scenarioOptions = useMemo(() => {
    const freeThemeCard = {
      id: null,
      name: t('wizard.free_theme'),
      description: t('wizard.free_theme_desc'),
    };
    return [freeThemeCard, ...(themesData?.scenarioCards ?? [])];
  }, [themesData?.scenarioCards, t]);

  useEffect(() => {
    if (presetScenarioAppliedRef.current || !presetScenarioCardId) return;

    const scenarioExists = (themesData?.scenarioCards ?? []).some(
      (scenario) => scenario.id === presetScenarioCardId
    );
    if (!scenarioExists) return;

    setScenarioCardId(presetScenarioCardId);
    presetScenarioAppliedRef.current = true;
  }, [presetScenarioCardId, themesData?.scenarioCards]);

  const selectedScenario = scenarioOptions.find((scenario) => scenario.id === scenarioCardId);
  const selectedChildProfile = children.find((child) => child.id === childProfileId);
  const selectedGoalNames = availableGoals
    .filter((goal) => selectedGoals.includes(goal.slug))
    .map((goal) => goal.name);
  const selectedCharacterNames = [
    ...children
      .filter((child) => selectedChildren.includes(child.id) && child.id !== childProfileId)
      .map((child) => child.name),
    ...availableCharacters
      .filter((character) => selectedCharacters.includes(character.id))
      .map((character) => character.name),
  ];
  const selectedImageStyleLabel = imageStyle
    ? t(IMAGE_STYLE_METADATA[imageStyle]?.i18nKey ?? imageStyle, {
        defaultValue: imageStyle,
      })
    : null;
  const trimmedUserNotes = userNotes.trim();
  const selectedLanguageLabel = storyLanguage
    ? t(`language_names.${storyLanguage}`, { defaultValue: storyLanguage.toUpperCase() })
    : t('wizard.language_required', { defaultValue: 'Choose a language' });
  const selectedStoryFormatLabel =
    storyFormat === 'comic'
      ? t('wizard.format_comic', { defaultValue: 'Comic' })
      : storyFormat === 'mixed'
        ? t('wizard.format_mixed', { defaultValue: 'Story + comic' })
      : t('wizard.format_story', { defaultValue: 'Story' });
  const summaryItems = [
    {
      key: 'format',
      label: `${t('wizard.format_label', { defaultValue: 'Format' })}: ${selectedStoryFormatLabel}`,
    },
    {
      key: 'scenario',
      label: `${t('wizard.theme_title')}: ${selectedScenario?.name ?? t('wizard.free_theme')}`,
    },
    { key: 'language', label: `${t('wizard.language')}: ${selectedLanguageLabel}` },
    ...(selectedChildProfile
      ? [
          {
            key: 'child-profile',
            label: `${t('wizard.story_for')}: ${selectedChildProfile.name}`,
          },
        ]
      : []),
    ...(selectedGoalNames.length > 0
      ? [
          {
            key: 'goal',
            label: `${t('wizard.goal_label')}: ${selectedGoalNames.join(', ')}`,
          },
        ]
      : []),
    ...(selectedImageStyleLabel
      ? [
          {
            key: 'image-style',
            label: `${t('wizard.image_style_label')}: ${selectedImageStyleLabel}`,
          },
        ]
      : []),
    ...(trimmedUserNotes
      ? [
          {
            key: 'notes',
            label: `${t('wizard.notes_label')}: ${trimmedUserNotes}`,
          },
        ]
      : []),
    {
      key: 'characters',
      label: `${t('characters.title', { defaultValue: 'Characters' })}: ${
        selectedCharacterNames.length > 0
          ? selectedCharacterNames.join(', ')
          : t('wizard.summary_no_characters', { defaultValue: 'No extra characters' })
      }`,
    },
  ];
  const steps = [
    { key: 'basics', label: t('wizard.step_basics'), icon: 'sparkles-outline' as const },
    { key: 'details', label: t('wizard.step_details'), icon: 'options-outline' as const },
    { key: 'characters', label: t('wizard.step_characters'), icon: 'people-outline' as const },
  ];
  const isLastStep = activeStep === steps.length - 1;
  const handleNextStep = () => setActiveStep((step) => Math.min(steps.length - 1, step + 1));
  const formatUsageLimitLabel = (bucket: { remaining: number; limit: number }) =>
    bucket.limit < 0
      ? t('usage_summary.unlimited', { defaultValue: 'Unlimited' })
      : t('usage_summary.remaining_of_limit', {
          remaining: bucket.remaining,
          limit: bucket.limit,
          defaultValue: '{{remaining}} of {{limit}} left',
        });

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

    if (usesGraphicQuota && isChildSession) {
      Alert.alert(t('common.error') || 'Error', t('wizard.create_error'));
      return;
    }

    if (!storyLanguage) {
      Alert.alert(t('common.error') || 'Error', t('wizard.language_required'));
      return;
    }

    if (usage && usage.stories.limit >= 0 && usage.stories.remaining <= 0) {
      setPaywallKind('stories');
      setShowPaywall(true);
      return;
    }

    if (usesGraphicQuota && graphicNovelAccessLocked) {
      openGraphicNovelPaywall();
      return;
    }

    if (
      usesGraphicQuota &&
      usage?.graphicNovels &&
      usage.graphicNovels.limit >= 0 &&
      usage.graphicNovels.remaining <= 0
    ) {
      setPaywallKind('graphicNovels');
      setShowPaywall(true);
      return;
    }

    try {
      setIsGenerating(true);

      getAnalytics().capture('story_generation_started', {
        wizard_type: 'artisan',
        story_format: storyFormatAnalytics,
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

      const createMutation =
        storyFormat === 'comic'
          ? createGraphicNovel
          : storyFormat === 'mixed'
            ? createMixedStory
            : isChildSession
              ? createChildModeStory
              : createStory;

      const result = await createMutation.mutateAsync(payload);
      setRequestId(result.id);
    } catch (error: unknown) {
      console.error('Failed to create story:', error);
      setIsGenerating(false);
      const response = (error as {
        response?: { status?: number; data?: { code?: string; featureSlug?: string } };
      })?.response;
      const status = response?.status;
      const errorCode = response?.data?.code;
      const featureSlug = response?.data?.featureSlug;
      if (
        status === 403 &&
        (errorCode === 'GRAPHIC_NOVEL_LIMIT_REACHED' ||
          featureSlug === 'graphic_novels_per_month')
      ) {
        openGraphicNovelPaywall();
      } else if (status === 429) {
        setPaywallKind('stories');
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
        story_format: storyFormatAnalytics,
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
      <LinearGradient colors={modernGradients.page} style={styles.page}>
        <ScrollView contentContainerStyle={styles.content}>
          <AnimatedSection delay={0} trigger={enterKey}>
            <View style={styles.heroPanel}>
              <View style={styles.heroIcon}>
                <Ionicons name="sparkles-outline" size={24} color={theme.colors.primary[700]} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.title}>
                  {t('wizard.title', { defaultValue: 'Create story' })}
                </Text>
                <Text style={styles.subtitle}>
                  {t('wizard.subtitle', {
                    defaultValue:
                      "Pick a theme, heroes, and tiny details. We'll turn them into your story.",
                  })}
                </Text>
              </View>
            </View>
          </AnimatedSection>

          <View style={[styles.workspace, isWide && styles.workspaceWide]}>
            <View style={[styles.mainColumn, isWide && styles.mainColumnWide]}>
              <AnimatedSection delay={80} trigger={enterKey}>
                <View style={styles.stepperCard}>
                  <Text style={styles.stepperEyebrow}>
                    {t('wizard.step_progress', {
                      current: activeStep + 1,
                      total: steps.length,
                    })}
                  </Text>
                  <View style={styles.stepper}>
                    {steps.map((step, index) => {
                      const isActive = activeStep === index;
                      const isComplete = activeStep > index;
                      return (
                        <TouchableOpacity
                          key={step.key}
                          style={[
                            styles.stepButton,
                            isActive && styles.stepButtonActive,
                            isComplete && styles.stepButtonComplete,
                          ]}
                          onPress={() => setActiveStep(index)}
                          activeOpacity={0.8}
                        >
                          <View
                            style={[
                              styles.stepIcon,
                              (isActive || isComplete) && styles.stepIconActive,
                            ]}
                          >
                            <Ionicons
                              name={isComplete ? 'checkmark' : step.icon}
                              size={16}
                              color={
                                isActive || isComplete
                                  ? theme.colors.text.inverse
                                  : theme.colors.text.secondary
                              }
                            />
                          </View>
                          <Text
                            style={[
                              styles.stepLabel,
                              (isActive || isComplete) && styles.stepLabelActive,
                            ]}
                          >
                            {step.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </AnimatedSection>

              <AnimatedSection delay={140} trigger={`${enterKey}-${activeStep}`}>
                {activeStep === 0 ? (
                  <View style={styles.stepContent}>
                    {!isChildSession ? (
                      <View style={styles.formatPanel}>
                        <Text style={styles.formatTitle}>
                          {t('wizard.format_title', { defaultValue: 'Choose format' })}
                        </Text>
                        <View style={styles.formatOptions}>
                          {[
                            {
                              value: 'story' as const,
                              icon: 'book-outline' as const,
                              label: t('wizard.format_story', { defaultValue: 'Story' }),
                              description: t('wizard.format_story_desc', {
                                defaultValue: 'Narrative text with illustrations',
                              }),
                            },
                            {
                              value: 'comic' as const,
                              icon: 'chatbubbles-outline' as const,
                              label: t('wizard.format_comic', { defaultValue: 'Comic' }),
                              description: t('wizard.format_comic_desc', {
                                defaultValue: 'Panel pages with character dialogue',
                              }),
                            },
                            {
                              value: 'mixed' as const,
                              icon: 'albums-outline' as const,
                              label: t('wizard.format_mixed', { defaultValue: 'Story + comic' }),
                              description: t('wizard.format_mixed_desc', {
                                defaultValue: 'Comic strips alternating with short prose',
                              }),
                            },
                          ].map((option) => {
                            const selected = storyFormat === option.value;
                            const locked =
                              (option.value === 'comic' || option.value === 'mixed') &&
                              graphicNovelAccessLocked;
                            return (
                              <TouchableOpacity
                                key={option.value}
                                style={[
                                  styles.formatOption,
                                  selected && styles.formatOptionSelected,
                                  locked && styles.formatOptionLocked,
                                ]}
                                onPress={() => handleStoryFormatSelect(option.value)}
                                activeOpacity={0.85}
                              >
                                <View
                                  style={[
                                    styles.formatIcon,
                                    selected && styles.formatIconSelected,
                                    locked && styles.formatIconLocked,
                                  ]}
                                >
                                  <Ionicons
                                    name={locked ? 'lock-closed-outline' : option.icon}
                                    size={20}
                                    color={
                                      selected
                                        ? theme.colors.text.inverse
                                        : theme.colors.text.secondary
                                    }
                                  />
                                </View>
                                <View style={styles.formatText}>
                                  <View style={styles.formatLabelRow}>
                                    <Text
                                      style={[
                                        styles.formatOptionLabel,
                                        selected && styles.formatOptionLabelSelected,
                                        locked && styles.formatOptionLabelLocked,
                                      ]}
                                    >
                                      {option.label}
                                    </Text>
                                    {locked ? (
                                      <Ionicons
                                        name="lock-closed"
                                        size={14}
                                        color={theme.colors.text.tertiary}
                                      />
                                    ) : null}
                                  </View>
                                  <Text
                                    style={[
                                      styles.formatOptionDescription,
                                      locked && styles.formatOptionDescriptionLocked,
                                    ]}
                                  >
                                    {locked
                                      ? option.value === 'mixed'
                                        ? t('wizard.format_mixed_locked_hint', {
                                            defaultValue: 'Upgrade to create story + comic',
                                          })
                                        : t('wizard.format_comic_locked_hint', {
                                            defaultValue: 'Upgrade to create comics',
                                          })
                                      : option.description}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}
                    <ScenarioCardsGrid
                      scenarios={themesData?.scenarioCards || []}
                      selected={scenarioCardId}
                      onSelect={setScenarioCardId}
                    />
                    <LanguageSelector
                      selected={storyLanguage}
                      onSelect={setStoryLanguage}
                      defaultLanguage={i18n.language}
                      allowedLanguageCodes={allowedLanguageCodes}
                    />
                  </View>
                ) : null}

                {activeStep === 1 ? (
                  <View style={styles.detailsPanel}>
                    <AdvancedSettingsForm
                      childProfileId={childProfileId}
                      onChildProfileChange={setChildProfileId}
                      children={children}
                      onAddChild={
                        canCreateMoreChildren ? () => setIsChildModalVisible(true) : undefined
                      }
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
                  </View>
                ) : null}

                {activeStep === 2 ? (
                  <View style={styles.detailsPanel}>
                    <View style={styles.sectionHeading}>
                      <Ionicons name="people-outline" size={24} color={theme.colors.text.primary} />
                      <Text style={styles.sectionHeadingText}>{t('wizard.add_characters')}</Text>
                    </View>
                    <CharactersForm
                      characters={availableCharacters}
                      selectedCharacters={selectedCharacters}
                      onCharactersChange={setSelectedCharacters}
                      children={children}
                      selectedChildren={selectedChildren}
                      onChildrenChange={setSelectedChildren}
                      showChildren={!isChildSession}
                      onAddCharacter={() => setIsCharacterModalVisible(true)}
                      onAddChild={
                        canCreateMoreChildren ? () => setIsChildModalVisible(true) : undefined
                      }
                    />
                  </View>
                ) : null}
              </AnimatedSection>
            </View>

            <View
              style={[
                styles.summaryColumn,
                isWide && styles.summaryColumnFixed,
                !isWide && styles.summaryColumnFull,
              ]}
            >
              <View style={styles.summaryCard}>
                <Text style={styles.summaryEyebrow}>
                  {t('wizard.story_preview', { defaultValue: 'Story setup' })}
                </Text>
                <Text style={styles.summaryTitle}>
                  {t('wizard.your_story', { defaultValue: 'Your story' })}
                </Text>
                <View style={styles.summaryList}>
                  {summaryItems.map((item) => (
                    <View key={item.key} style={styles.summaryItem}>
                      <View style={styles.summaryDot} />
                      <Text style={styles.summaryItemText}>{item.label}</Text>
                    </View>
                  ))}
                </View>
                {usage ? (
                  <View style={styles.summaryLimits}>
                    <Text style={styles.summaryLimit}>
                      {t('usage_summary.stories', { defaultValue: 'Stories' })}:{' '}
                      {formatUsageLimitLabel(usage.stories)}
                    </Text>
                    {usesGraphicQuota && usage.graphicNovels ? (
                      <Text style={styles.summaryLimit}>
                        {t('usage_summary.graphic_novels_in_story_limit', {
                          defaultValue: 'Comics within stories',
                        })}:{' '}
                        {formatUsageLimitLabel(usage.graphicNovels)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.aiGenerationNotice}>
                  <TouchableOpacity
                    style={styles.aiGenerationNoticeToggle}
                    onPress={() => setIsAiNoticeExpanded((expanded) => !expanded)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isAiNoticeExpanded }}
                  >
                    <Ionicons name="sparkles-outline" size={16} color={theme.colors.text.tertiary} />
                    <Text numberOfLines={1} style={styles.aiGenerationNoticeTitle}>
                      {t('wizard.ai_generation_notice_title', {
                        defaultValue: 'About AI generation',
                      })}
                    </Text>
                    <Ionicons
                      name={isAiNoticeExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={theme.colors.text.tertiary}
                    />
                  </TouchableOpacity>
                  {isAiNoticeExpanded ? (
                    <Text style={styles.aiGenerationNoticeText}>
                      {t('wizard.ai_generation_notice', {
                        defaultValue:
                          'Your content will be created with AI. Minor image or text generation errors may occasionally appear, so a quick adult review of the result is recommended.',
                      })}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.summaryActions}>
                  {activeStep > 0 ? (
                    <AppButton
                      label={t('common.back')}
                      onPress={() => setActiveStep((step) => Math.max(0, step - 1))}
                      variant="secondary"
                      size="md"
                      leading={
                        <Ionicons name="chevron-back" size={18} color={theme.colors.text.secondary} />
                      }
                      style={styles.summaryBackButton}
                    />
                  ) : null}
                  <AppButton
                    label={
                      isLastStep
                        ? storyFormat === 'comic'
                          ? t('wizard.create_comic', { defaultValue: 'Create comic' })
                          : storyFormat === 'mixed'
                            ? t('wizard.create_mixed_story', {
                                defaultValue: 'Create story + comic',
                              })
                          : t('common.create')
                        : t('common.next')
                    }
                    onPress={isLastStep ? handleGenerate : handleNextStep}
                    size="md"
                    disabled={
                      isLastStep
                        ? !storyLanguage || isGenerating || !canGenerateStories
                        : isGenerating
                    }
                    loading={isLastStep && isGenerating}
                    trailing={
                      !isLastStep ? (
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={theme.colors.text.inverse}
                        />
                      ) : undefined
                    }
                    style={styles.summaryPrimaryButton}
                  />
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>

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
        onReport={
          storyStatus?.status === 'failed'
            ? () => {
                setShowFeedbackModal(true);
              }
            : undefined
        }
        allowManualClose={true}
      />

      {/* Child Form Modal */}
      <ChildFormModal visible={isChildModalVisible} onClose={() => setIsChildModalVisible(false)} />

      {/* Character Form Modal */}
      <CharacterFormModal
        visible={isCharacterModalVisible}
        onClose={() => setIsCharacterModalVisible(false)}
      />

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        title={
          paywallKind === 'graphicNovels'
            ? isGraphicNovelUpgradePaywall
              ? t('paywall.graphic_novels_upgrade_title', {
                  defaultValue: 'Comics are available on paid plans',
                })
              : t('paywall.graphic_novels_limit_title', {
                  defaultValue: 'Comic limit reached',
                })
            : undefined
        }
        message={
          paywallKind === 'graphicNovels' && isGraphicNovelUpgradePaywall
            ? t('paywall.graphic_novels_upgrade_message', {
                defaultValue:
                  'Upgrade your plan to create comics. They also count as stories in your monthly story limit.',
              })
            : paywallKind === 'graphicNovels' && usage?.graphicNovels
            ? t('paywall.graphic_novels_limit_message', {
                used: usage.graphicNovels.used,
                limit: usage.graphicNovels.limit,
                defaultValue: 'You have used {{used}} of {{limit}} comics for this billing period.',
              })
            : undefined
        }
        limitInfo={
          usage && !isGraphicNovelUpgradePaywall
            ? paywallKind === 'graphicNovels' && usage.graphicNovels
              ? { used: usage.graphicNovels.used, limit: usage.graphicNovels.limit }
              : { used: usage.stories.used, limit: usage.stories.limit }
            : undefined
        }
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
  page: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[8],
    minHeight: '100%',
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
  heroPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[5],
    padding: theme.spacing[5],
    marginBottom: theme.spacing[8],
    borderRadius: theme.borders.radius.xl,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surface,
    ...modernShadows.card,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borders.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: modernColors.accentWash,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    lineHeight: 22,
  },
  workspace: {
    gap: theme.spacing[8],
  },
  workspaceWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
  },
  mainColumnWide: {
    flexBasis: 0,
  },
  stepperCard: {
    padding: theme.spacing[5],
    marginBottom: theme.spacing[6],
    borderRadius: theme.borders.radius.xl,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surface,
    ...modernShadows.subtle,
  },
  stepperEyebrow: {
    marginBottom: theme.spacing[3],
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
  },
  stepper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  stepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceMuted,
  },
  stepButtonActive: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: modernColors.accentWash,
  },
  stepButtonComplete: {
    borderColor: theme.colors.primary[300],
    backgroundColor: modernColors.accentWash,
  },
  stepIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: modernColors.surface,
  },
  stepIconActive: {
    backgroundColor: theme.colors.interactive.primary,
  },
  stepLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
  },
  stepLabelActive: {
    color: theme.colors.text.primary,
  },
  stepContent: {
    gap: theme.spacing[6],
  },
  formatPanel: {
    padding: theme.spacing[5],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surface,
    ...modernShadows.subtle,
  },
  formatTitle: {
    marginBottom: theme.spacing[3],
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  formatOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[3],
  },
  formatOption: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceMuted,
  },
  formatOptionSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: modernColors.accentWash,
  },
  formatOptionLocked: {
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    opacity: 0.76,
  },
  formatIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: modernColors.surface,
  },
  formatIconSelected: {
    backgroundColor: theme.colors.interactive.primary,
  },
  formatIconLocked: {
    backgroundColor: theme.colors.background.primary,
  },
  formatText: {
    flex: 1,
    minWidth: 0,
  },
  formatLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  formatOptionLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  formatOptionLabelSelected: {
    color: theme.colors.primary[800],
  },
  formatOptionLabelLocked: {
    color: theme.colors.text.secondary,
  },
  formatOptionDescription: {
    marginTop: theme.spacing[1],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 19,
  },
  formatOptionDescriptionLocked: {
    color: theme.colors.text.tertiary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  summaryColumn: {
    width: 344,
    maxWidth: '100%',
  },
  summaryColumnFixed: {
    position: Platform.OS === 'web' ? ('sticky' as never) : 'absolute',
    top: Platform.OS === 'web' ? theme.spacing[6] : 96,
    alignSelf: 'flex-start',
    zIndex: 20,
  },
  summaryColumnFull: {
    width: '100%',
  },
  summaryCard: {
    gap: theme.spacing[5],
    padding: theme.spacing[6],
    borderRadius: theme.borders.radius.xl,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surface,
    ...modernShadows.card,
  },
  summaryEyebrow: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary[700],
    textTransform: 'uppercase',
  },
  summaryTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginTop: -theme.spacing[3],
  },
  summaryList: {
    gap: theme.spacing[3],
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.interactive.primary,
  },
  summaryItemText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  detailsPanel: {
    padding: theme.spacing[6],
    borderRadius: theme.borders.radius.xl,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surface,
    ...modernShadows.subtle,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  sectionHeadingText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  summaryLimits: {
    paddingTop: theme.spacing[2],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: modernColors.border,
    gap: theme.spacing[1],
  },
  summaryLimit: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  aiGenerationNotice: {
    paddingTop: theme.spacing[2],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: modernColors.border,
    gap: theme.spacing[2],
  },
  aiGenerationNoticeToggle: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  aiGenerationNoticeTitle: {
    flex: 1,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    lineHeight: 18,
    color: theme.colors.text.tertiary,
  },
  aiGenerationNoticeText: {
    fontSize: theme.typography.fontSize.xs,
    lineHeight: 18,
    color: theme.colors.text.tertiary,
  },
  summaryActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing[3],
  },
  summaryBackButton: {
    minWidth: 112,
  },
  summaryPrimaryButton: {
    flex: 1,
  },
});
