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
import DateTimePicker from '@react-native-community/datetimepicker';
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
import { StoryCreationNotice } from './components/StoryCreationNotice';
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
import { GenerationErrorModal } from '@/components/GenerationErrorModal';
import { LinearGradient } from '@/components/AppLinearGradient';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { getAnalytics } from '@/services/analytics';
import { formatSubscriptionPeriodEnd } from '@/utils/formatSubscriptionPeriodEnd';
import { getWebSearch } from '@/utils/webRuntime';
import { modernColors, modernGradients, modernShadows } from '@/theme/modernTheme';
import { IMAGE_STYLE_METADATA, planAllowsComicFormats, type ImageStyle } from '@wondertales/shared';
import { getWizardScenarioPreset } from './wizardRouteParams';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import {
  useSaveStorySchedule,
  useStorySchedule,
  type StoryScheduleRuleInput,
} from '@/api/storySchedule';

type StoryFormat = 'story' | 'comic' | 'mixed';

function isChildProfileCharacter(character: { type?: string; subtype?: string | null }): boolean {
  return character.type === 'child' || character.subtype === 'child';
}

export default function WizardScreen({ schedulerMode = false }: { schedulerMode?: boolean }) {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const route = useRoute<RouteProp<MainDrawerParamList, 'Wizard'>>();
  const queryClient = useQueryClient();
  const enterKey = useScreenEnter();
  const { width } = useWindowDimensions();
  const isWide = width >= 1100;
  const isMobile = width < theme.breakpoints.tablet;
  const presetScenarioCardId = useMemo(
    () => getWizardScenarioPreset(route.params, getWebSearch()),
    [route.params]
  );
  const presetScenarioAppliedRef = React.useRef(false);
  const wizardScrollRef = React.useRef<ScrollView | null>(null);
  const sessionMode = useAuthStore((state) => state.sessionMode);
  const activeChild = useAuthStore((state) => state.activeChild);
  const isChildSession = sessionMode === 'child';
  const isSchedulerMode = schedulerMode || route.params?.scheduler === true;
  const childModeSettings = activeChild?.childMode?.childModeSettings;
  const canGenerateStories = !isChildSession || childModeSettings?.storyGenerationEnabled === true;
  const notesEnabled = !isChildSession || childModeSettings?.freeTextPromptsEnabled === true;
  const allowedLanguageCodes = isChildSession
    ? (childModeSettings?.allowedLanguageCodes ?? [])
    : [];

  // Form state
  const [storyFormat, setStoryFormat] = useState<StoryFormat>('story');
  const [storyLanguage, setStoryLanguage] = useState('');
  const [scenarioCardId, setScenarioCardId] = useState<string | null>(null);
  const [childProfileId, setChildProfileId] = useState<string | undefined>(undefined);
  const [selectedGoals, setSelectedGoals] = useState<string[]>(isSchedulerMode ? ['__free__'] : []);
  const [imageStyle, setImageStyle] = useState<ImageStyle | undefined>(undefined);
  const [userNotes, setUserNotes] = useState('');
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [scheduleFormats, setScheduleFormats] = useState<StoryFormat[]>(['story']);
  const [scheduleScenarioIds, setScheduleScenarioIds] = useState<Array<string | null>>([null]);
  const [scheduleLanguages, setScheduleLanguages] = useState<string[]>([]);
  const [scheduleProfileIds, setScheduleProfileIds] = useState<string[]>([]);
  const [scheduleImageStyles, setScheduleImageStyles] = useState<ImageStyle[]>(['soft_watercolor']);
  const [scheduleCadence, setScheduleCadence] =
    useState<StoryScheduleRuleInput['cadence']>('daily');
  const [scheduleRunAtTime, setScheduleRunAtTime] = useState('18:00');
  const [showScheduleTimePicker, setShowScheduleTimePicker] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const activeStepScrollRef = React.useRef(activeStep);
  const [isMobileSummaryExpanded, setIsMobileSummaryExpanded] = useState(false);

  // Modal state
  const [isChildModalVisible, setIsChildModalVisible] = useState(false);
  const [isCharacterModalVisible, setIsCharacterModalVisible] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [generationErrorMessage, setGenerationErrorMessage] = useState<string | null>(null);

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
  const { data: savedSchedule } = useStorySchedule(isSchedulerMode);
  const saveSchedule = useSaveStorySchedule();
  const { data: storyStatus } = useStoryStatus(requestId || '', !!requestId);
  const { data: usage } = useSubscriptionUsage();
  const maxStoryCharacterSelections = usage?.storyCharacterSelectionLimit ?? 3;
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallKind, setPaywallKind] = useState<'stories' | 'graphicNovels' | 'mixedStories'>(
    'stories'
  );
  const periodEndFormatted = useMemo(
    () => formatSubscriptionPeriodEnd(usage?.currentPeriodEnd ?? usage?.resetsAt, i18n.language),
    [usage?.currentPeriodEnd, usage?.resetsAt, i18n.language]
  );
  const graphicNovelPlanLimit = usage?.graphicNovels?.planLimit ?? usage?.graphicNovels?.limit;
  const comicFormatsAccessLocked = !planAllowsComicFormats(graphicNovelPlanLimit);
  const graphicNovelAccessLocked = comicFormatsAccessLocked;
  const isGraphicNovelUpgradePaywall = paywallKind === 'graphicNovels' && graphicNovelAccessLocked;
  const mixedStoryAccessLocked = comicFormatsAccessLocked;
  const isMixedStoryUpgradePaywall = paywallKind === 'mixedStories' && mixedStoryAccessLocked;
  const usesGraphicQuota = storyFormat === 'comic';
  const usesMixedStoryQuota = storyFormat === 'mixed';
  const usesEnhancedStoryFormat = storyFormat === 'comic' || storyFormat === 'mixed';
  const storyFormatAnalytics =
    storyFormat === 'comic' ? 'graphic_novel' : storyFormat === 'mixed' ? 'mixed_story' : 'story';

  const openGraphicNovelPaywall = () => {
    setPaywallKind('graphicNovels');
    setShowPaywall(true);
  };

  const openMixedStoryPaywall = () => {
    setPaywallKind('mixedStories');
    setShowPaywall(true);
  };

  const handleStoryFormatSelect = (nextFormat: StoryFormat) => {
    if (nextFormat === 'comic' && graphicNovelAccessLocked) {
      openGraphicNovelPaywall();
      return;
    }
    if (nextFormat === 'mixed' && mixedStoryAccessLocked) {
      openMixedStoryPaywall();
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
    const localeLanguage = i18n.language?.split('-')[0];
    const childAllowedLanguages = childModeSettings?.allowedLanguageCodes ?? [];

    if (isChildSession && childAllowedLanguages.length > 0) {
      if (!childAllowedLanguages.includes(storyLanguage)) {
        setStoryLanguage(
          localeLanguage && childAllowedLanguages.includes(localeLanguage)
            ? localeLanguage
            : childAllowedLanguages[0]
        );
      }
      return;
    }

    if (!storyLanguage && localeLanguage) {
      setStoryLanguage(localeLanguage);
    }
  }, [childModeSettings?.allowedLanguageCodes, i18n.language, isChildSession, storyLanguage]);

  useEffect(() => {
    if (!isSchedulerMode || scheduleLanguages.length > 0) return;
    const locale = i18n.language?.split('-')[0];
    if (locale) setScheduleLanguages([locale]);
  }, [i18n.language, isSchedulerMode, scheduleLanguages.length]);

  useEffect(() => {
    if (!isSchedulerMode || !savedSchedule) return;
    setScheduleFormats(savedSchedule.formats);
    setScheduleScenarioIds(
      savedSchedule.themes.map((id: string) => (id === '__free__' ? null : id))
    );
    setSelectedGoals(savedSchedule.morals);
    setScheduleLanguages(savedSchedule.languages);
    setScheduleProfileIds(savedSchedule.childProfileIds);
    setScheduleImageStyles(savedSchedule.imageStyles as ImageStyle[]);
    setScheduleCadence(savedSchedule.cadence);
    setScheduleRunAtTime(savedSchedule.runAtTime);
    setUserNotes(savedSchedule.userNotes || '');
  }, [isSchedulerMode, savedSchedule]);

  useEffect(() => {
    if (!isChildSession || !activeChild?.id) return;
    setChildProfileId(activeChild.id);
  }, [activeChild?.id, isChildSession]);

  useEffect(() => {
    if (isChildSession && usesEnhancedStoryFormat) {
      setStoryFormat('story');
    }
  }, [isChildSession, storyFormat, usesEnhancedStoryFormat]);

  useEffect(() => {
    if (
      (storyFormat === 'comic' && graphicNovelAccessLocked) ||
      (storyFormat === 'mixed' && mixedStoryAccessLocked)
    ) {
      setStoryFormat('story');
    }
  }, [graphicNovelAccessLocked, mixedStoryAccessLocked, storyFormat]);

  useEffect(() => {
    if (isChildSession || !route.params?.childId) return;
    setChildProfileId(route.params.childId);
  }, [isChildSession, route.params?.childId]);

  useEffect(() => {
    if (isChildSession || childrenLoading) return;

    if (children.length === 0) {
      if (childProfileId) {
        setChildProfileId(undefined);
      }
      return;
    }

    const selectedProfileExists = childProfileId
      ? children.some((child) => child.id === childProfileId)
      : false;
    if (selectedProfileExists) return;

    const routeChild = route.params?.childId
      ? children.find((child) => child.id === route.params?.childId)
      : undefined;
    setChildProfileId((routeChild ?? children[0]).id);
  }, [childProfileId, children, childrenLoading, isChildSession, route.params?.childId]);

  const availableGoals = useMemo(() => {
    const goals = themesData?.goals || [];
    const allowed = childModeSettings?.allowedThemeSlugs ?? [];
    if (!isChildSession || allowed.length === 0) return goals;
    return goals.filter((goal) => allowed.includes(goal.slug));
  }, [childModeSettings?.allowedThemeSlugs, isChildSession, themesData?.goals]);

  const availableCharacters = useMemo(() => {
    const allCharacters = characters ?? [];
    const allowed = childModeSettings?.allowedCharacterIds ?? [];
    const siblingSafeCharacters =
      isChildSession && childModeSettings?.allowSiblingCharacters !== true
        ? allCharacters.filter((character) => {
            const characterChildProfileId = (
              character as {
                childProfileId?: string | null;
              }
            ).childProfileId;
            return !characterChildProfileId || characterChildProfileId === childProfileId;
          })
        : allCharacters;

    if (!isChildSession || allowed.length === 0) return siblingSafeCharacters;
    return siblingSafeCharacters.filter(
      (character) =>
        allowed.includes(character.id) ||
        (childProfileId &&
          (character as { childProfileId?: string | null }).childProfileId === childProfileId &&
          isChildProfileCharacter(character))
    );
  }, [
    characters,
    childModeSettings?.allowSiblingCharacters,
    childModeSettings?.allowedCharacterIds,
    childProfileId,
    isChildSession,
  ]);

  useEffect(() => {
    setSelectedCharacters((current) =>
      current.length > maxStoryCharacterSelections
        ? current.slice(0, maxStoryCharacterSelections)
        : current
    );
  }, [maxStoryCharacterSelections]);

  useEffect(() => {
    if (!childProfileId) return;
    if (!isChildSession && route.params?.childId !== childProfileId) return;

    const childCharacter = availableCharacters.find(
      (character) =>
        (character as { childProfileId?: string | null }).childProfileId === childProfileId &&
        isChildProfileCharacter(character)
    );
    if (!childCharacter) return;

    setSelectedCharacters((current) => {
      if (current.includes(childCharacter.id)) return current;
      if (current.length >= maxStoryCharacterSelections) return current;
      return [...current, childCharacter.id];
    });
  }, [
    availableCharacters,
    childProfileId,
    isChildSession,
    maxStoryCharacterSelections,
    route.params?.childId,
  ]);

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
        ? t('wizard.format_mixed', { defaultValue: 'Comic-to-text story' })
        : t('wizard.format_story', { defaultValue: 'Story' });
  const schedulerProfileNames = children
    .filter((child) => scheduleProfileIds.includes(child.id))
    .map((child) => child.name);
  const schedulerFormatLabels = scheduleFormats.map((format) =>
    format === 'comic'
      ? t('wizard.format_comic', { defaultValue: 'Comic' })
      : format === 'mixed'
        ? t('wizard.format_mixed', { defaultValue: 'Comic-to-text story' })
        : t('wizard.format_story', { defaultValue: 'Story' })
  );
  const schedulerThemeNames = scheduleScenarioIds.map((id) =>
    id === null
      ? t('wizard.free_theme')
      : (scenarioOptions.find((scenario) => scenario.id === id)?.name ?? id)
  );
  const schedulerMoralNames = selectedGoals.map((slug) =>
    slug === '__free__'
      ? t('scheduler_wizard.free_moral')
      : (availableGoals.find((goal) => goal.slug === slug)?.name ?? slug)
  );
  const schedulerLanguageNames = scheduleLanguages.map((language) =>
    t(`language_names.${language}`, { defaultValue: language.toUpperCase() })
  );
  const schedulerStyleNames = scheduleImageStyles.map((style) =>
    t(IMAGE_STYLE_METADATA[style]?.i18nKey ?? style, { defaultValue: style })
  );
  const summaryValues = (values: string[]) => values.join(', ') || '—';
  const scheduleTimePickerValue = useMemo(() => {
    const [hours, minutes] = scheduleRunAtTime.split(':').map(Number);
    const value = new Date();
    value.setHours(
      Number.isFinite(hours) ? hours : 18,
      Number.isFinite(minutes) ? minutes : 0,
      0,
      0
    );
    return value;
  }, [scheduleRunAtTime]);
  const updateScheduleTime = (value: Date) => {
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    setScheduleRunAtTime(`${hours}:${minutes}`);
  };
  const [scheduleHours, scheduleMinutes] = scheduleRunAtTime.split(':').map(Number);
  const selectedScheduleHour = Number.isFinite(scheduleHours) ? scheduleHours : 18;
  const selectedScheduleMinute = Number.isFinite(scheduleMinutes) ? scheduleMinutes : 0;
  const updateScheduleTimePart = (hour = selectedScheduleHour, minute = selectedScheduleMinute) => {
    setScheduleRunAtTime(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  };
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
  const schedulerSummaryItems = [
    {
      key: 'profiles',
      label: t('scheduler_wizard.summary_profiles', {
        values: summaryValues(schedulerProfileNames),
      }),
    },
    {
      key: 'formats',
      label: t('scheduler_wizard.summary_formats', {
        values: summaryValues(schedulerFormatLabels),
      }),
    },
    {
      key: 'themes',
      label: t('scheduler_wizard.summary_themes', {
        values: summaryValues(schedulerThemeNames),
      }),
    },
    {
      key: 'morals',
      label: t('scheduler_wizard.summary_morals', {
        values: summaryValues(schedulerMoralNames),
      }),
    },
    {
      key: 'languages',
      label: t('scheduler_wizard.summary_languages', {
        values: summaryValues(schedulerLanguageNames),
      }),
    },
    {
      key: 'styles',
      label: t('scheduler_wizard.summary_styles', {
        values: summaryValues(schedulerStyleNames),
      }),
    },
    {
      key: 'delivery',
      label: t('scheduler_wizard.summary_delivery', {
        cadence: t(`scheduler_wizard.cadence.${scheduleCadence}`),
        time: scheduleRunAtTime,
      }),
    },
  ];
  const visibleSummaryItems = isSchedulerMode ? schedulerSummaryItems : summaryItems;
  const summaryCompactLabel = isSchedulerMode
    ? [summaryValues(schedulerProfileNames), summaryValues(schedulerThemeNames)]
        .filter((value) => value !== '—')
        .join(' · ')
    : [
        selectedStoryFormatLabel,
        selectedScenario?.name ?? t('wizard.free_theme'),
        selectedLanguageLabel,
      ].join(' · ');
  const steps = isSchedulerMode
    ? [
        {
          key: 'basics',
          label: t('scheduler_wizard.step_basics'),
          icon: 'sparkles-outline' as const,
        },
        {
          key: 'details',
          label: t('wizard.step_details'),
          icon: 'options-outline' as const,
        },
        {
          key: 'schedule',
          label: t('scheduler_wizard.step_delivery'),
          icon: 'time-outline' as const,
        },
      ]
    : [
        { key: 'basics', label: t('wizard.step_basics'), icon: 'sparkles-outline' as const },
        { key: 'details', label: t('wizard.step_details'), icon: 'options-outline' as const },
        { key: 'characters', label: t('wizard.step_characters'), icon: 'people-outline' as const },
      ];
  const isLastStep = activeStep === steps.length - 1;
  const handleNextStep = () => setActiveStep((step) => Math.min(steps.length - 1, step + 1));
  const toggleScheduleFormat = (format: StoryFormat) => {
    setScheduleFormats((current) =>
      current.includes(format) ? current.filter((value) => value !== format) : [...current, format]
    );
  };
  const schedulerSelectionIncomplete =
    !scheduleProfileIds.length ||
    !scheduleFormats.length ||
    !scheduleScenarioIds.length ||
    !selectedGoals.length ||
    !scheduleLanguages.length ||
    !scheduleImageStyles.length;
  const primaryActionLabel = isLastStep
    ? isSchedulerMode
      ? t('scheduler_wizard.action')
      : storyFormat === 'comic'
        ? t('wizard.create_comic', { defaultValue: 'Create comic' })
        : storyFormat === 'mixed'
          ? t('wizard.create_mixed_story', { defaultValue: 'Create comic-to-text story' })
          : t('common.create')
    : t('common.next');
  const primaryActionDisabled = isLastStep
    ? isSchedulerMode
      ? schedulerSelectionIncomplete || saveSchedule.isPending
      : !storyLanguage ||
        (!isChildSession && !childProfileId) ||
        isGenerating ||
        !canGenerateStories
    : isGenerating;
  const primaryActionLoading =
    isLastStep && (isSchedulerMode ? saveSchedule.isPending : isGenerating);
  const formatUsageLimitLabel = (bucket: { remaining: number; limit: number }) =>
    bucket.limit < 0
      ? t('usage_summary.unlimited', { defaultValue: 'Unlimited' })
      : t('usage_summary.remaining_of_limit', {
          remaining: bucket.remaining,
          limit: bucket.limit,
          defaultValue: '{{remaining}} of {{limit}} left',
        });

  useEffect(() => {
    const tourStep = route.params?.tourStep;
    if (tourStep !== undefined) {
      setActiveStep(tourStep);
    }
  }, [route.params?.tourStep]);

  useEffect(() => {
    if (activeStepScrollRef.current === activeStep) return;
    activeStepScrollRef.current = activeStep;

    const scrollToTop = () => {
      wizardScrollRef.current?.scrollTo({ y: 0, animated: true });
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(scrollToTop);
    } else {
      setTimeout(scrollToTop, 0);
    }
  }, [activeStep]);

  useEffect(() => {
    const allowedGoalIds = new Set(availableGoals.map((goal) => goal.slug));
    setSelectedGoals((current) =>
      current.filter((slug) => allowedGoalIds.has(slug) || (isSchedulerMode && slug === '__free__'))
    );
  }, [availableGoals, isSchedulerMode]);

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
    if (isSchedulerMode) {
      if (
        !scheduleProfileIds.length ||
        !scheduleFormats.length ||
        !scheduleScenarioIds.length ||
        !selectedGoals.length ||
        !scheduleLanguages.length ||
        !scheduleImageStyles.length
      ) {
        Alert.alert(
          t('common.error') || 'Error',
          t('wizard.complete_all_fields', {
            defaultValue: 'Choose at least one option in every section.',
          })
        );
        return;
      }
      try {
        await saveSchedule.mutateAsync({
          childProfileIds: scheduleProfileIds,
          cadence: scheduleCadence,
          runAtTime: scheduleRunAtTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          formats: scheduleFormats,
          themes: scheduleScenarioIds.map((id) => id ?? '__free__'),
          morals: selectedGoals,
          languages: scheduleLanguages,
          imageStyles: scheduleImageStyles,
          userNotes: userNotes.trim() || null,
        });
        navigation.goBack();
      } catch (error) {
        setGenerationErrorMessage(
          getLocalizedApiError(t, error, 'wizard.generation_error_message')
        );
      }
      return;
    }
    if (!canGenerateStories) {
      Alert.alert(t('common.error') || 'Error', t('wizard.create_error'));
      return;
    }

    if (usesEnhancedStoryFormat && isChildSession) {
      Alert.alert(t('common.error') || 'Error', t('wizard.create_error'));
      return;
    }

    if (!storyLanguage) {
      Alert.alert(t('common.error') || 'Error', t('wizard.language_required'));
      return;
    }

    if (!isChildSession && !childProfileId) {
      Alert.alert(t('common.error') || 'Error', t('wizard.child_profile_required'));
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

    if (usesMixedStoryQuota && mixedStoryAccessLocked) {
      openMixedStoryPaywall();
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

    if (
      usesMixedStoryQuota &&
      usage?.mixedStories &&
      usage.mixedStories.limit >= 0 &&
      usage.mixedStories.remaining <= 0
    ) {
      setPaywallKind('mixedStories');
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
        has_goal: selectedGoals.length > 0,
        has_image_style: !!imageStyle,
        has_user_notes: userNotes.trim().length > 0,
        has_child_profile: !!childProfileId,
        character_count: selectedCharacters.length,
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
      const response = (
        error as {
          response?: { status?: number; data?: { code?: string; featureSlug?: string } };
        }
      )?.response;
      const status = response?.status;
      const errorCode = response?.data?.code;
      const featureSlug = response?.data?.featureSlug;
      if (
        status === 403 &&
        (errorCode === 'GRAPHIC_NOVEL_LIMIT_REACHED' || featureSlug === 'graphic_novels_per_month')
      ) {
        openGraphicNovelPaywall();
      } else if (
        status === 403 &&
        (errorCode === 'MIXED_STORY_NOT_AVAILABLE' || featureSlug === 'mixed_stories_per_month')
      ) {
        openMixedStoryPaywall();
      } else if (status === 429) {
        setPaywallKind('stories');
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
        // Modal stays open, requestId unchanged — useStoryStatus continues polling
      } catch (error) {
        console.error('Retry images failed:', error);
        setIsGenerating(false);
        Alert.alert(
          t('common.error') || 'Error',
          getLocalizedApiError(t, error, 'wizard.retry_error')
        );
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

  const paywallTitle =
    paywallKind === 'graphicNovels'
      ? isGraphicNovelUpgradePaywall
        ? t('paywall.graphic_novels_upgrade_title', {
            defaultValue: 'Comics are available on paid plans',
          })
        : t('paywall.graphic_novels_limit_title', {
            defaultValue: 'Comic limit reached',
          })
      : paywallKind === 'mixedStories'
        ? isMixedStoryUpgradePaywall
          ? t('paywall.mixed_stories_upgrade_title', {
              defaultValue: 'Comic-to-text stories are available from Golden Stars',
            })
          : t('paywall.mixed_stories_limit_title', {
              defaultValue: 'Comic-to-text story limit reached',
            })
        : undefined;
  const paywallMessage =
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
        : paywallKind === 'mixedStories' && isMixedStoryUpgradePaywall
          ? t('paywall.mixed_stories_upgrade_message', {
              defaultValue:
                'Upgrade to Golden Stars or higher to create comic-to-text stories. They use the same monthly story credits as regular stories.',
            })
          : paywallKind === 'mixedStories' && usage?.mixedStories
            ? t('paywall.mixed_stories_limit_message', {
                used: usage.mixedStories.used,
                limit: usage.mixedStories.limit,
                defaultValue:
                  'You have used {{used}} of {{limit}} comic-to-text stories for this billing period.',
              })
            : undefined;
  const paywallLimitInfo =
    usage && !isGraphicNovelUpgradePaywall && !isMixedStoryUpgradePaywall
      ? paywallKind === 'graphicNovels' && usage.graphicNovels
        ? { used: usage.graphicNovels.used, limit: usage.graphicNovels.limit }
        : paywallKind === 'mixedStories' && usage.mixedStories
          ? { used: usage.mixedStories.used, limit: usage.mixedStories.limit }
          : { used: usage.stories.used, limit: usage.stories.limit }
      : undefined;

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
        <ScrollView
          ref={wizardScrollRef}
          testID="wizard-artisan-screen"
          nativeID="tour-wizard-artisan"
          contentContainerStyle={[
            styles.content,
            isMobile && styles.contentMobile,
            isMobile && styles.contentMobileWithBottomPanel,
          ]}
        >
          <AnimatedSection delay={0} trigger={enterKey}>
            <View style={[styles.heroPanel, isMobile && styles.heroPanelMobile]}>
              <View style={styles.heroIcon}>
                <Ionicons name="sparkles-outline" size={24} color={theme.colors.primary[700]} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.title}>
                  {isSchedulerMode
                    ? t('scheduler_wizard.title')
                    : t('wizard.title', { defaultValue: 'Create story' })}
                </Text>
                <Text style={styles.subtitle}>
                  {isSchedulerMode
                    ? t('scheduler_wizard.subtitle')
                    : t('wizard.subtitle', {
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
                <View
                  nativeID="tour-wizard-steps"
                  style={[styles.stepperCard, isMobile && styles.stepperCardMobile]}
                >
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
                      const showStepLabel = !isMobile || isActive;
                      return (
                        <React.Fragment key={step.key}>
                          <TouchableOpacity
                            style={[
                              styles.stepButton,
                              isActive && styles.stepButtonActive,
                              isComplete && styles.stepButtonComplete,
                            ]}
                            onPress={() => setActiveStep(index)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={step.label}
                            testID={`wizard-step-${index}`}
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
                            {showStepLabel ? (
                              <Text
                                style={[
                                  styles.stepLabel,
                                  (isActive || isComplete) && styles.stepLabelActive,
                                ]}
                              >
                                {step.label}
                              </Text>
                            ) : null}
                          </TouchableOpacity>
                          {index < steps.length - 1 ? (
                            <View style={styles.stepSequenceArrow} pointerEvents="none">
                              <Ionicons
                                name="chevron-forward"
                                size={15}
                                color={theme.colors.text.tertiary}
                              />
                            </View>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </View>
                </View>
              </AnimatedSection>

              <AnimatedSection delay={140} trigger={`${enterKey}-${activeStep}`}>
                {activeStep === 0 ? (
                  <View style={styles.stepContent}>
                    {!isChildSession ? (
                      <View style={[styles.detailsPanel, isMobile && styles.detailsPanelMobile]}>
                        <AdvancedSettingsForm
                          childProfileId={childProfileId}
                          onChildProfileChange={setChildProfileId}
                          childProfileIds={isSchedulerMode ? scheduleProfileIds : undefined}
                          onChildProfilesChange={
                            isSchedulerMode ? setScheduleProfileIds : undefined
                          }
                          children={children}
                          onAddChild={
                            canCreateMoreChildren ? () => setIsChildModalVisible(true) : undefined
                          }
                          showChildProfileSelector
                          showOptions={false}
                          goals={availableGoals}
                          selectedGoals={selectedGoals}
                          onGoalsChange={setSelectedGoals}
                          imageStyle={imageStyle}
                          onImageStyleChange={setImageStyle}
                          userNotes={userNotes}
                          onNotesChange={setUserNotes}
                          notesEnabled={notesEnabled}
                          compactAddChild={isMobile}
                          schedulerMode={isSchedulerMode}
                        />
                      </View>
                    ) : null}
                    {!isChildSession ? (
                      <View style={[styles.formatPanel, isMobile && styles.formatPanelMobile]}>
                        <Text style={styles.formatTitle}>
                          {isSchedulerMode
                            ? t('scheduler_wizard.formats_title')
                            : t('wizard.format_title', { defaultValue: 'Choose format' })}
                        </Text>
                        {isSchedulerMode ? (
                          <Text style={styles.selectionHint}>
                            {t('scheduler_wizard.formats_hint')}
                          </Text>
                        ) : null}
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
                              label: t('wizard.format_mixed', {
                                defaultValue: 'Comic-to-text story',
                              }),
                              description: t('wizard.format_mixed_desc', {
                                defaultValue: 'Comic strips alternating with short prose',
                              }),
                            },
                          ].map((option) => {
                            const selected = isSchedulerMode
                              ? scheduleFormats.includes(option.value)
                              : storyFormat === option.value;
                            const locked =
                              option.value === 'comic'
                                ? graphicNovelAccessLocked
                                : option.value === 'mixed'
                                  ? mixedStoryAccessLocked
                                  : false;
                            return (
                              <TouchableOpacity
                                key={option.value}
                                style={[
                                  styles.formatOption,
                                  selected && styles.formatOptionSelected,
                                  locked && styles.formatOptionLocked,
                                ]}
                                onPress={() =>
                                  isSchedulerMode
                                    ? toggleScheduleFormat(option.value)
                                    : handleStoryFormatSelect(option.value)
                                }
                                activeOpacity={0.85}
                                testID={`wizard-format-${option.value}`}
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
                                            defaultValue: 'Upgrade to create comic-to-text stories',
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
                      selectedScenarios={isSchedulerMode ? scheduleScenarioIds : undefined}
                      onScenariosChange={isSchedulerMode ? setScheduleScenarioIds : undefined}
                      schedulerMode={isSchedulerMode}
                    />
                    <LanguageSelector
                      selected={storyLanguage}
                      onSelect={setStoryLanguage}
                      defaultLanguage={i18n.language}
                      allowedLanguageCodes={allowedLanguageCodes}
                      selectedLanguages={isSchedulerMode ? scheduleLanguages : undefined}
                      onLanguagesChange={isSchedulerMode ? setScheduleLanguages : undefined}
                      schedulerMode={isSchedulerMode}
                    />
                  </View>
                ) : null}

                {activeStep === 1 ? (
                  <View style={[styles.detailsPanel, isMobile && styles.detailsPanelMobile]}>
                    <AdvancedSettingsForm
                      childProfileId={childProfileId}
                      onChildProfileChange={setChildProfileId}
                      childProfileIds={isSchedulerMode ? scheduleProfileIds : undefined}
                      onChildProfilesChange={isSchedulerMode ? setScheduleProfileIds : undefined}
                      children={children}
                      onAddChild={
                        canCreateMoreChildren ? () => setIsChildModalVisible(true) : undefined
                      }
                      showChildProfileSelector={false}
                      goals={availableGoals}
                      selectedGoals={selectedGoals}
                      onGoalsChange={setSelectedGoals}
                      imageStyle={imageStyle}
                      onImageStyleChange={setImageStyle}
                      imageStyles={isSchedulerMode ? scheduleImageStyles : undefined}
                      onImageStylesChange={isSchedulerMode ? setScheduleImageStyles : undefined}
                      userNotes={userNotes}
                      onNotesChange={setUserNotes}
                      notesEnabled={!isSchedulerMode && notesEnabled}
                      compactAddChild={isMobile}
                      schedulerMode={isSchedulerMode}
                    />
                  </View>
                ) : null}

                {activeStep === 2 && isSchedulerMode ? (
                  <View style={[styles.detailsPanel, isMobile && styles.detailsPanelMobile]}>
                    <View style={styles.sectionHeading}>
                      <Ionicons name="time-outline" size={24} color={theme.colors.text.primary} />
                      <Text style={styles.sectionHeadingText}>
                        {t('scheduler_wizard.delivery_title')}
                      </Text>
                    </View>
                    <Text style={styles.scheduleHint}>{t('scheduler_wizard.delivery_hint')}</Text>
                    <View style={styles.scheduleCadenceRow}>
                      {(
                        [
                          'daily',
                          'every_2_days',
                          'twice_weekly',
                          'weekly',
                        ] as StoryScheduleRuleInput['cadence'][]
                      ).map((cadence) => (
                        <TouchableOpacity
                          key={cadence}
                          onPress={() => setScheduleCadence(cadence)}
                          style={[
                            styles.scheduleCadenceChip,
                            scheduleCadence === cadence && styles.scheduleCadenceChipSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.scheduleCadenceText,
                              scheduleCadence === cadence && styles.scheduleCadenceTextSelected,
                            ]}
                          >
                            {t(`scheduler_wizard.cadence.${cadence}`)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.scheduleTimeLabel}>
                      {t('scheduler_wizard.delivery_time')}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowScheduleTimePicker(true)}
                      style={styles.scheduleTimeInput}
                      accessibilityRole="button"
                      accessibilityLabel={t('scheduler_wizard.delivery_time')}
                      testID="scheduler-delivery-time"
                    >
                      <Text style={styles.scheduleTimeValue}>{scheduleRunAtTime}</Text>
                      <Ionicons name="time-outline" size={20} color={theme.colors.text.secondary} />
                    </TouchableOpacity>
                    {showScheduleTimePicker ? (
                      Platform.OS === 'web' ? (
                        <View style={styles.scheduleTimePicker} testID="scheduler-time-picker">
                          <View style={styles.scheduleTimePickerColumns}>
                            <ScrollView
                              style={styles.scheduleTimePickerColumn}
                              contentContainerStyle={styles.scheduleTimePickerColumnContent}
                              showsVerticalScrollIndicator={false}
                            >
                              {Array.from({ length: 24 }, (_, hour) => (
                                <TouchableOpacity
                                  key={hour}
                                  onPress={() => updateScheduleTimePart(hour)}
                                  style={[
                                    styles.scheduleTimeOption,
                                    selectedScheduleHour === hour &&
                                      styles.scheduleTimeOptionSelected,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.scheduleTimeOptionText,
                                      selectedScheduleHour === hour &&
                                        styles.scheduleTimeOptionTextSelected,
                                    ]}
                                  >
                                    {String(hour).padStart(2, '0')}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                            <ScrollView
                              style={styles.scheduleTimePickerColumn}
                              contentContainerStyle={styles.scheduleTimePickerColumnContent}
                              showsVerticalScrollIndicator={false}
                            >
                              {Array.from({ length: 60 }, (_, minute) => (
                                <TouchableOpacity
                                  key={minute}
                                  onPress={() => updateScheduleTimePart(undefined, minute)}
                                  style={[
                                    styles.scheduleTimeOption,
                                    selectedScheduleMinute === minute &&
                                      styles.scheduleTimeOptionSelected,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.scheduleTimeOptionText,
                                      selectedScheduleMinute === minute &&
                                        styles.scheduleTimeOptionTextSelected,
                                    ]}
                                  >
                                    {String(minute).padStart(2, '0')}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                          <TouchableOpacity
                            onPress={() => setShowScheduleTimePicker(false)}
                            style={styles.scheduleTimePickerClose}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.close')}
                          >
                            <Text style={styles.scheduleTimePickerCloseText}>
                              {t('common.close')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <DateTimePicker
                          value={scheduleTimePickerValue}
                          mode="time"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          locale="en_GB"
                          is24Hour
                          onChange={(_event, selectedTime) => {
                            setShowScheduleTimePicker(Platform.OS === 'ios');
                            if (selectedTime) updateScheduleTime(selectedTime);
                          }}
                        />
                      )
                    ) : null}
                  </View>
                ) : null}

                {activeStep === 2 && !isSchedulerMode ? (
                  <View style={[styles.detailsPanel, isMobile && styles.detailsPanelMobile]}>
                    <View style={styles.sectionHeading}>
                      <Ionicons name="people-outline" size={24} color={theme.colors.text.primary} />
                      <Text style={styles.sectionHeadingText}>{t('wizard.add_characters')}</Text>
                    </View>
                    <CharactersForm
                      characters={availableCharacters}
                      selectedCharacters={selectedCharacters}
                      maxSelections={maxStoryCharacterSelections}
                      onCharactersChange={setSelectedCharacters}
                      onAddCharacter={() => setIsCharacterModalVisible(true)}
                      onAddChild={
                        canCreateMoreChildren ? () => setIsChildModalVisible(true) : undefined
                      }
                    />
                  </View>
                ) : null}
              </AnimatedSection>
            </View>

            {!isMobile ? (
              <View
                style={[
                  styles.summaryColumn,
                  isWide && styles.summaryColumnFixed,
                  !isWide && styles.summaryColumnFull,
                ]}
              >
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryEyebrow}>
                    {isSchedulerMode
                      ? t('scheduler_wizard.summary_eyebrow')
                      : t('wizard.story_preview', { defaultValue: 'Story setup' })}
                  </Text>
                  <Text style={styles.summaryTitle}>
                    {isSchedulerMode
                      ? t('scheduler_wizard.summary_title')
                      : t('wizard.your_story', { defaultValue: 'Your story' })}
                  </Text>
                  <View style={styles.summaryList}>
                    {visibleSummaryItems.map((item) => (
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
                          })}
                          : {formatUsageLimitLabel(usage.graphicNovels)}
                        </Text>
                      ) : null}
                      {usesMixedStoryQuota && usage.mixedStories ? (
                        <Text style={styles.summaryLimit}>
                          {t('usage_summary.mixed_stories_in_story_limit', {
                            defaultValue: 'Comic-to-text stories',
                          })}
                          : {formatUsageLimitLabel(usage.mixedStories)}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {!isSchedulerMode ? (
                    <StoryCreationNotice testID="wizard-story-creation-notice" />
                  ) : null}
                  <View style={styles.summaryActions}>
                    {activeStep > 0 ? (
                      <AppButton
                        label={t('common.back')}
                        onPress={() => setActiveStep((step) => Math.max(0, step - 1))}
                        variant="secondary"
                        size="md"
                        leading={
                          <Ionicons
                            name="chevron-back"
                            size={18}
                            color={theme.colors.text.secondary}
                          />
                        }
                        style={styles.summaryBackButton}
                        testID="wizard-back"
                      />
                    ) : null}
                    <AppButton
                      label={primaryActionLabel}
                      onPress={isLastStep ? handleGenerate : handleNextStep}
                      size="md"
                      disabled={primaryActionDisabled}
                      loading={primaryActionLoading}
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
                      testID={isLastStep ? 'wizard-create' : 'wizard-next'}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {isMobile ? (
          <View style={styles.mobileSummaryDock} pointerEvents="box-none">
            <View style={styles.mobileSummaryPanel}>
              <TouchableOpacity
                style={styles.mobileSummaryToggle}
                onPress={() => setIsMobileSummaryExpanded((expanded) => !expanded)}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityState={{ expanded: isMobileSummaryExpanded }}
                accessibilityLabel={
                  isSchedulerMode
                    ? t('scheduler_wizard.summary_eyebrow')
                    : t('wizard.story_preview', { defaultValue: 'Story setup' })
                }
              >
                <View style={styles.mobileSummaryText}>
                  <Text style={styles.mobileSummaryEyebrow}>
                    {isSchedulerMode
                      ? t('scheduler_wizard.summary_eyebrow')
                      : t('wizard.story_preview', { defaultValue: 'Story setup' })}
                  </Text>
                  <Text numberOfLines={1} style={styles.mobileSummaryTitle}>
                    {summaryCompactLabel}
                  </Text>
                </View>
                <View style={styles.mobileSummaryChevron}>
                  <Ionicons
                    name={isMobileSummaryExpanded ? 'chevron-down' : 'chevron-up'}
                    size={18}
                    color={theme.colors.text.secondary}
                  />
                </View>
              </TouchableOpacity>

              {isMobileSummaryExpanded ? (
                <ScrollView
                  style={styles.mobileSummaryDetailsScroll}
                  contentContainerStyle={styles.mobileSummaryDetails}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.summaryList}>
                    {visibleSummaryItems.map((item) => (
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
                          })}
                          : {formatUsageLimitLabel(usage.graphicNovels)}
                        </Text>
                      ) : null}
                      {usesMixedStoryQuota && usage.mixedStories ? (
                        <Text style={styles.summaryLimit}>
                          {t('usage_summary.mixed_stories_in_story_limit', {
                            defaultValue: 'Comic-to-text stories',
                          })}
                          : {formatUsageLimitLabel(usage.mixedStories)}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </ScrollView>
              ) : null}

              <View style={styles.mobileSummaryActions}>
                {activeStep > 0 ? (
                  <AppButton
                    label={t('common.back')}
                    onPress={() => setActiveStep((step) => Math.max(0, step - 1))}
                    variant="secondary"
                    size="sm"
                    leading={
                      <Ionicons name="chevron-back" size={17} color={theme.colors.text.secondary} />
                    }
                    style={styles.mobileSummaryBackButton}
                    testID="wizard-back"
                  />
                ) : null}
                <AppButton
                  label={primaryActionLabel}
                  onPress={isLastStep ? handleGenerate : handleNextStep}
                  size="sm"
                  disabled={primaryActionDisabled}
                  loading={primaryActionLoading}
                  trailing={
                    !isLastStep ? (
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={theme.colors.text.inverse}
                      />
                    ) : undefined
                  }
                  style={styles.mobileSummaryPrimaryButton}
                  testID={isLastStep ? 'wizard-create' : 'wizard-next'}
                />
              </View>
            </View>
          </View>
        ) : null}
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
        title={paywallTitle}
        message={paywallMessage}
        limitInfo={paywallLimitInfo}
        periodEndFormatted={periodEndFormatted}
      />

      <GenerationErrorModal
        visible={generationErrorMessage !== null}
        message={generationErrorMessage}
        onClose={() => setGenerationErrorMessage(null)}
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
  contentMobile: {
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[4],
  },
  contentMobileWithBottomPanel: {
    paddingBottom: 156,
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
  heroPanelMobile: {
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
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
  stepperCardMobile: {
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
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
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  stepSequenceArrow: {
    width: 16,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  formatPanelMobile: {
    padding: theme.spacing[4],
  },
  formatTitle: {
    marginBottom: theme.spacing[3],
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  selectionHint: {
    marginTop: -theme.spacing[1],
    marginBottom: theme.spacing[3],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
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
  detailsPanelMobile: {
    padding: theme.spacing[4],
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
  scheduleHint: {
    marginTop: -theme.spacing[2],
    marginBottom: theme.spacing[5],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    lineHeight: 22,
  },
  scheduleCadenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[5],
  },
  scheduleCadenceChip: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceMuted,
  },
  scheduleCadenceChipSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: modernColors.accentWash,
  },
  scheduleCadenceText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
  },
  scheduleCadenceTextSelected: {
    color: theme.colors.primary[700],
  },
  scheduleTimeLabel: {
    marginBottom: theme.spacing[2],
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  scheduleTimeInput: {
    maxWidth: 180,
    minWidth: 152,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[3],
    paddingLeft: theme.spacing[5],
    paddingRight: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceMuted,
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  scheduleTimeValue: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  scheduleTimePicker: {
    width: 288,
    marginTop: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
    backgroundColor: modernColors.surface,
    ...modernShadows.card,
  },
  scheduleTimePickerColumns: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  scheduleTimePickerColumn: {
    flex: 1,
    maxHeight: 220,
    borderRadius: theme.borders.radius.md,
    backgroundColor: modernColors.surfaceMuted,
  },
  scheduleTimePickerColumnContent: {
    gap: theme.spacing[1],
    padding: theme.spacing[2],
  },
  scheduleTimeOption: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.sm,
  },
  scheduleTimeOptionSelected: {
    backgroundColor: theme.colors.interactive.primary,
  },
  scheduleTimeOptionText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  scheduleTimeOptionTextSelected: {
    color: theme.colors.text.inverse,
  },
  scheduleTimePickerClose: {
    alignSelf: 'flex-end',
    marginTop: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    backgroundColor: modernColors.accentWash,
  },
  scheduleTimePickerCloseText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary[700],
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
  mobileSummaryDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
    zIndex: 50,
  },
  mobileSummaryPanel: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borders.radius.xl,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: Platform.select({
      web: 'rgba(255, 255, 255, 0.72)',
      default: 'rgba(255, 255, 255, 0.92)',
    }),
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px) saturate(145%)' as any,
        WebkitBackdropFilter: 'blur(16px) saturate(145%)' as any,
      },
      default: {},
    }),
    ...modernShadows.card,
  },
  mobileSummaryToggle: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  mobileSummaryText: {
    flex: 1,
    minWidth: 0,
  },
  mobileSummaryEyebrow: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary[700],
    textTransform: 'uppercase',
  },
  mobileSummaryTitle: {
    marginTop: theme.spacing[1],
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  mobileSummaryChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: modernColors.surfaceMuted,
  },
  mobileSummaryDetailsScroll: {
    maxHeight: 220,
  },
  mobileSummaryDetails: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[1],
  },
  mobileSummaryActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing[2],
  },
  mobileSummaryBackButton: {
    minWidth: 104,
    paddingHorizontal: theme.spacing[3],
  },
  mobileSummaryPrimaryButton: {
    flex: 1,
    paddingHorizontal: theme.spacing[4],
  },
});
