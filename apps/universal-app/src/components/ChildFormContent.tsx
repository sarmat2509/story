import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { AppButton } from './AppButton';
import { useCreateChild, useUpdateChild, useAnalyzeChild } from '@/api/children';
import {
  CreateChildProfileSchema,
  DEFAULT_LOCALE,
  DEFAULT_STORY_COMPLEXITY_ADJUSTMENT,
  DEFAULT_STORY_TEXT_SIZE_MULTIPLIER,
  UpdateChildProfileSchema,
  LOCALE_IDS,
  ReferencePhoto,
  STORY_COMPLEXITY_ADJUSTMENT_STEPS,
  STORY_TEXT_SIZE_MULTIPLIER_STEPS,
  SUPPORTED_LANGUAGES,
  type Locale,
  type StoryComplexityAdjustment,
  type StoryComplexityAdjustments,
  type StoryTextSizeMultiplier,
  getBaseStoryTextSizePxForAgeYears,
  getStoryTextSizePx,
  normalizeStoryComplexityAdjustments,
  normalizeStoryTextSizeMultiplier,
} from '@wondertales/shared';
import { UploadPhotoResult } from '@/utils/uploadPhoto';
import { formatAssetUrl, isServerAssetUrl } from '@/utils/assetUrl';
import { API_BASE_URL, APP_CONFIG } from '@/config/constants';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import { useResponsive } from '@/hooks/useResponsive';
import { getWebOrigin } from '@/utils/webRuntime';

/** Normalize BCP 47 locale (e.g. uk-UA, en-US) to base code for API (uk, en) */
function toBaseLocale(locale: string | undefined): string {
  const base = (locale || '').split('-')[0]?.toLowerCase() || DEFAULT_LOCALE;
  return LOCALE_IDS.includes(base as any) ? base : DEFAULT_LOCALE;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateFormatHint(locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
    .formatToParts(new Date(2006, 10, 22))
    .map((part) => {
      if (part.type === 'day') return 'DD';
      if (part.type === 'month') return 'MM';
      if (part.type === 'year') return 'YYYY';
      return part.value;
    })
    .join('');
}

/** Convert relative asset path to absolute URL for Zod .url() validation */
function toAbsoluteAssetUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url.split('?')[0];
    }
  }

  const withoutQuery = url.split('?')[0];
  const base = getWebOrigin(API_BASE_URL.replace(/\/$/, '')) ?? API_BASE_URL.replace(/\/$/, '');
  const assetPath = withoutQuery.startsWith('/api/v1/assets/')
    ? withoutQuery
    : withoutQuery.startsWith('/')
      ? `/api/v1/assets/${withoutQuery.slice(1)}`
      : `/api/v1/assets/${withoutQuery}`;
  return `${base}${assetPath}`;
}

function getFullAgeYears(date: Date): number | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let ageYears = now.getFullYear() - date.getFullYear();
  const birthdayThisYear = new Date(now.getFullYear(), date.getMonth(), date.getDate());
  if (birthdayThisYear > now) {
    ageYears -= 1;
  }
  return Math.max(0, ageYears);
}

import { storage } from '@/utils/storage';
import {
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_STYLES,
  EYE_COLORS,
  SKIN_TONES,
  DISTINCTIVE_FEATURES,
  PERSONALITY_TRAITS,
  FAVORITE_ACTIVITIES,
  INTERESTS,
  COMMON_FEARS,
  AVOID_TOPICS,
  HairColor,
  HairLength,
  HairStyle,
  EyeColor,
  SkinTone,
  DistinctiveFeature,
  PersonalityTrait,
  FavoriteActivity,
  Interest,
  CommonFear,
  AvoidTopic,
} from '@wondertales/shared';
import { ChipSelector } from './form/ChipSelector';
import { PhotoUploadGrid } from './form/PhotoUploadGrid';
import { ExpandableCard } from './ExpandableCard';

export interface ChildFormInitialData {
  name: string;
  birthDate: Date;
  languages?: string[];
  referencePhotos?: ReferencePhoto[];
  appearanceTraits?: Record<string, unknown>;
  personality?: Record<string, unknown>;
  interests?: Interest[] | unknown[];
  sensitivities?: Record<string, unknown>;
  familyCast?: Record<string, string>;
  aiGeneratedDescription?: string;
  descriptionLanguage?: string;
  turnaroundSheet?: { url: string; frontUrl?: string; generatedAt: string };
  authorPseudonym?: string | null;
  authorAboutMe?: string | null;
  storyTextSizeMultiplier?: number | string | null;
  storyComplexityAdjustments?: StoryComplexityAdjustments | null;
}

interface Props {
  childId?: string;
  initialData?: ChildFormInitialData;
  onSuccess: () => void;
  onCancel?: () => void;
  variant?: 'modal' | 'inline';
  inlineSection?: 'full' | 'identity' | 'childProfile' | 'storyAuthor';
  saveLabel?: string;
}

export function ChildFormContent({
  childId,
  initialData,
  onSuccess,
  onCancel,
  variant = 'modal',
  inlineSection = 'full',
  saveLabel,
}: Props) {
  const { t, i18n } = useTranslation();
  const { isMobile } = useResponsive();
  const createChild = useCreateChild();
  const updateChild = useUpdateChild();
  const analyzeChild = useAnalyzeChild();
  const [currentStep, setCurrentStep] = useState(1);
  const scrollRef = useRef<ScrollView>(null);
  const currentPreviewUrl =
    initialData?.turnaroundSheet?.frontUrl ?? initialData?.turnaroundSheet?.url ?? null;
  const isInline = variant === 'inline';
  const activeInlineSection = isInline ? inlineSection : 'full';
  const isSectionedInline = isInline && activeInlineSection !== 'full';
  const showInlineHeader = isInline && !isSectionedInline;
  const showFullStepTwo = activeInlineSection === 'full' && currentStep === 2;
  const showIdentityFields =
    activeInlineSection === 'identity' || (activeInlineSection === 'full' && currentStep === 1);
  const showStoryAuthorFields = activeInlineSection === 'storyAuthor' || showFullStepTwo;
  const showChildProfileFields = activeInlineSection === 'childProfile' || showFullStepTwo;
  const shouldShowImageRightsNotice = isSectionedInline || currentStep === 2;
  const resolvedSaveLabel = saveLabel ?? t('child_form.save_button');

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState(new Date());
  const [profileLanguages, setProfileLanguages] = useState<string[]>([toBaseLocale(i18n.language)]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [photos, setPhotos] = useState<UploadPhotoResult[]>([]);
  const [description, setDescription] = useState('');
  const [descriptionLanguage, setDescriptionLanguage] = useState<string | undefined>(undefined);
  const [authorPseudonym, setAuthorPseudonym] = useState('');
  const [authorAboutMe, setAuthorAboutMe] = useState('');
  const [storyTextSizeMultiplier, setStoryTextSizeMultiplier] = useState<StoryTextSizeMultiplier>(
    DEFAULT_STORY_TEXT_SIZE_MULTIPLIER
  );
  const [storyComplexityAdjustments, setStoryComplexityAdjustments] =
    useState<StoryComplexityAdjustments>({});
  const [childDataConsentAccepted, setChildDataConsentAccepted] = useState(false);

  const [appearance, setAppearance] = useState({
    hairColor: undefined as HairColor | undefined,
    hairLength: undefined as HairLength | undefined,
    hairStyle: undefined as HairStyle | undefined,
    eyeColor: undefined as EyeColor | undefined,
    skinTone: undefined as SkinTone | undefined,
    distinctiveFeatures: [] as DistinctiveFeature[],
  });

  const [personality, setPersonality] = useState({
    traits: [] as PersonalityTrait[],
    favoriteActivities: [] as FavoriteActivity[],
  });

  const [interests, setInterests] = useState<Interest[]>([]);
  const [sensitivities, setSensitivities] = useState({
    fearLevel: undefined as 'none' | 'low' | 'medium' | 'high' | undefined,
    commonFears: [] as CommonFear[],
    avoidTopics: [] as AvoidTopic[],
  });
  const [familyCast, setFamilyCast] = useState<Record<string, string>>({});
  const [turnaroundElapsedSeconds, setTurnaroundElapsedSeconds] = useState(0);

  const TURNAROUND_ESTIMATED_SECONDS = 30;
  const turnaroundRemainingSeconds = Math.max(
    0,
    TURNAROUND_ESTIMATED_SECONDS - turnaroundElapsedSeconds
  );
  const turnaroundProgressPercent = Math.min(
    99,
    Math.round((turnaroundElapsedSeconds / TURNAROUND_ESTIMATED_SECONDS) * 100)
  );
  const storyTextAgeYears = getFullAgeYears(birthDate);
  const baseStoryTextSizePx = getBaseStoryTextSizePxForAgeYears(storyTextAgeYears);
  const effectiveStoryTextSizePx = getStoryTextSizePx(baseStoryTextSizePx, storyTextSizeMultiplier);
  const storyTextPreviewLineHeight = Math.round(effectiveStoryTextSizePx * 1.45);

  useEffect(() => {
    if (!createChild.isPending) {
      setTurnaroundElapsedSeconds(0);
      return;
    }
    setTurnaroundElapsedSeconds(0);
    const interval = setInterval(() => {
      setTurnaroundElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [createChild.isPending]);

  useEffect(() => {
    setCurrentStep(1);
    if (initialData) {
      setName(initialData.name);
      setBirthDate(initialData.birthDate);
      setProfileLanguages(
        initialData.languages?.length ? initialData.languages : [toBaseLocale(i18n.language)]
      );
      if (initialData.referencePhotos && initialData.referencePhotos.length > 0) {
        setPhotos(
          initialData.referencePhotos.map((photo, index) => ({
            id: `existing-${index}`,
            url: photo.url,
            uploadedAt: photo.uploadedAt,
            isUploading: false,
          }))
        );
      } else {
        setPhotos([]);
      }
      setDescription(initialData.aiGeneratedDescription || '');
      setDescriptionLanguage(initialData.descriptionLanguage || undefined);
      setAuthorPseudonym(initialData.authorPseudonym || '');
      setAuthorAboutMe(initialData.authorAboutMe || '');
      setStoryTextSizeMultiplier(
        normalizeStoryTextSizeMultiplier(initialData.storyTextSizeMultiplier)
      );
      setStoryComplexityAdjustments(
        normalizeStoryComplexityAdjustments(initialData.storyComplexityAdjustments)
      );
      setChildDataConsentAccepted(!!childId);
      if (initialData.appearanceTraits) {
        setAppearance({
          hairColor: initialData.appearanceTraits.hairColor as HairColor | undefined,
          hairLength: initialData.appearanceTraits.hairLength as HairLength | undefined,
          hairStyle: initialData.appearanceTraits.hairStyle as HairStyle | undefined,
          eyeColor: initialData.appearanceTraits.eyeColor as EyeColor | undefined,
          skinTone: initialData.appearanceTraits.skinTone as SkinTone | undefined,
          distinctiveFeatures: (initialData.appearanceTraits.distinctiveFeatures ||
            []) as DistinctiveFeature[],
        });
      } else {
        setAppearance({
          hairColor: undefined,
          hairLength: undefined,
          hairStyle: undefined,
          eyeColor: undefined,
          skinTone: undefined,
          distinctiveFeatures: [],
        });
      }
      if (initialData.personality) {
        setPersonality({
          traits: (initialData.personality.traits || []) as PersonalityTrait[],
          favoriteActivities: (initialData.personality.favoriteActivities ||
            []) as FavoriteActivity[],
        });
      } else {
        setPersonality({ traits: [], favoriteActivities: [] });
      }
      setInterests((initialData.interests || []) as Interest[]);
      if (initialData.sensitivities) {
        setSensitivities({
          fearLevel: initialData.sensitivities.fearLevel as
            | 'none'
            | 'low'
            | 'medium'
            | 'high'
            | undefined,
          commonFears: (initialData.sensitivities.commonFears || []) as CommonFear[],
          avoidTopics: (initialData.sensitivities.avoidTopics || []) as AvoidTopic[],
        });
      } else {
        setSensitivities({ fearLevel: undefined, commonFears: [], avoidTopics: [] });
      }
      setFamilyCast(initialData.familyCast || {});
    } else {
      setName('');
      setBirthDate(new Date());
      setProfileLanguages([toBaseLocale(i18n.language)]);
      setPhotos([]);
      setDescription('');
      setDescriptionLanguage(undefined);
      setAuthorPseudonym('');
      setAuthorAboutMe('');
      setStoryTextSizeMultiplier(DEFAULT_STORY_TEXT_SIZE_MULTIPLIER);
      setStoryComplexityAdjustments({});
      setChildDataConsentAccepted(false);
      setAppearance({
        hairColor: undefined,
        hairLength: undefined,
        hairStyle: undefined,
        eyeColor: undefined,
        skinTone: undefined,
        distinctiveFeatures: [],
      });
      setPersonality({ traits: [], favoriteActivities: [] });
      setInterests([]);
      setSensitivities({ fearLevel: undefined, commonFears: [], avoidTopics: [] });
      setFamilyCast({});
    }
    setErrors({});
  }, [initialData, childId, i18n.language]);

  const toggleProfileLanguage = (language: string) => {
    setProfileLanguages((current) => {
      if (current.includes(language)) {
        return current.length > 1 ? current.filter((item) => item !== language) : current;
      }
      return current.length < 3 ? [...current, language] : current;
    });
  };

  const setLanguageComplexity = (language: Locale, adjustment: StoryComplexityAdjustment) => {
    setStoryComplexityAdjustments((current) => ({
      ...current,
      [language]: adjustment,
    }));
  };

  // Auto-analyze on the child-profile step (create only, when photos exist)
  const hasAnalyzedRef = React.useRef(false);
  useEffect(() => {
    const childProfileSectionActive =
      currentStep === 2 || (isInline && activeInlineSection === 'childProfile');
    if (!childId && childProfileSectionActive && !hasAnalyzedRef.current) {
      const uploadedPhotos = photos
        .filter((p) => !p.isUploading && isServerAssetUrl(p.url))
        .map((p) => p.url!);
      if (uploadedPhotos.length > 0 && !description.trim()) {
        hasAnalyzedRef.current = true;
        let userLanguage = i18n.language;
        storage.getLanguage().then((saved) => {
          if (!userLanguage || userLanguage === 'en-US') {
            userLanguage = saved || APP_CONFIG.defaultLanguage;
          }
          const apiLanguage = toBaseLocale(userLanguage);
          analyzeChild.mutate(
            { photos: uploadedPhotos, language: apiLanguage },
            {
              onSuccess: (result) => {
                setDescription(result.description || '');
                setDescriptionLanguage(apiLanguage);
                if (result.appearance) {
                  setAppearance({
                    hairColor: result.appearance.hairColor as HairColor | undefined,
                    hairLength: result.appearance.hairLength as HairLength | undefined,
                    hairStyle: result.appearance.hairStyle as HairStyle | undefined,
                    eyeColor: result.appearance.eyeColor as EyeColor | undefined,
                    skinTone: result.appearance.skinTone as SkinTone | undefined,
                    distinctiveFeatures: (result.appearance.distinctiveFeatures ||
                      []) as DistinctiveFeature[],
                  });
                }
              },
              onError: (error) => {
                const message = getLocalizedApiError(
                  t,
                  error,
                  'child_form.analysis_failed_message'
                );
                setErrors({ submit: message });
                Alert.alert(t('child_form.analysis_failed_title'), message);
              },
            }
          );
        });
      }
    }
    if (currentStep === 1) {
      hasAnalyzedRef.current = false;
    }
  }, [
    activeInlineSection,
    childId,
    currentStep,
    description,
    analyzeChild.mutate,
    i18n.language,
    isInline,
    photos,
    t,
  ]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [currentStep]);

  const handleContinue = () => {
    if (!childId && !childDataConsentAccepted) {
      Alert.alert(
        t('child_form.child_data_consent_required_title'),
        t('child_form.child_data_consent_required_message')
      );
      return;
    }
    if (!name.trim()) {
      Alert.alert(t('error') || 'Error', t('child_form.name_required') || 'Name is required');
      return;
    }
    if (!birthDate) {
      Alert.alert(
        t('error') || 'Error',
        t('child_form.birth_date_required') || 'Birth date is required'
      );
      return;
    }
    const hasUploadingPhotos = photos.some((photo) => photo.isUploading);
    if (hasUploadingPhotos) {
      Alert.alert(
        t('child_form.upload_in_progress') || 'Upload in progress',
        t('child_form.wait_for_upload') || 'Please wait for photo upload to complete'
      );
      return;
    }
    setCurrentStep(2);
  };

  const handleSubmit = async () => {
    try {
      setErrors({});
      const appearanceData: Record<string, unknown> = {};
      if (appearance.hairColor) appearanceData.hairColor = appearance.hairColor;
      if (appearance.hairLength) appearanceData.hairLength = appearance.hairLength;
      if (appearance.hairStyle) appearanceData.hairStyle = appearance.hairStyle;
      if (appearance.eyeColor) appearanceData.eyeColor = appearance.eyeColor;
      if (appearance.skinTone) appearanceData.skinTone = appearance.skinTone;
      if (appearance.distinctiveFeatures.length > 0)
        appearanceData.distinctiveFeatures = appearance.distinctiveFeatures;

      const personalityData =
        personality.traits.length > 0 || personality.favoriteActivities.length > 0
          ? personality
          : undefined;
      const sensitivitiesData =
        sensitivities.fearLevel ||
        sensitivities.commonFears.length > 0 ||
        sensitivities.avoidTopics.length > 0
          ? sensitivities
          : undefined;

      const hasUploadingPhotos = photos.some((photo) => photo.isUploading);
      if (hasUploadingPhotos) {
        Alert.alert(
          t('child_form.upload_in_progress') || 'Завантаження',
          t('child_form.wait_for_upload') || 'Будь ласка, зачекайте поки завантажаться всі фото'
        );
        return;
      }

      const uploadedPhotos = photos
        .filter((photo) => !photo.isUploading && isServerAssetUrl(photo.url))
        .map(({ url, uploadedAt }) => ({ url: toAbsoluteAssetUrl(url), uploadedAt }));
      if (uploadedPhotos.length === 0 && description.trim().length === 0) {
        const message = t('child_form.photo_or_description_required', {
          defaultValue: 'Upload at least one photo or describe the child.',
        });
        setErrors({ aiGeneratedDescription: message, submit: message });
        Alert.alert(t('child_form.validation_error'), message);
        return;
      }
      const submittedComplexityAdjustments = Object.fromEntries(
        profileLanguages.map((language) => [
          language,
          storyComplexityAdjustments[language as Locale] ?? DEFAULT_STORY_COMPLEXITY_ADJUSTMENT,
        ])
      ) as StoryComplexityAdjustments;

      if (childId) {
        // Edit: use UpdateChildProfileSchema (no referencePhotos, no URL validation)
        const updateData = {
          name,
          birthDate,
          languages: profileLanguages,
          aiGeneratedDescription: description || undefined,
          descriptionLanguage: descriptionLanguage || undefined,
          appearanceTraits: Object.keys(appearanceData).length > 0 ? appearanceData : undefined,
          personality: personalityData,
          interests: interests.length > 0 ? interests : undefined,
          sensitivities: sensitivitiesData,
          familyCast: Object.keys(familyCast).length > 0 ? familyCast : undefined,
          authorPseudonym: authorPseudonym.trim() || null,
          authorAboutMe: authorAboutMe.trim() || null,
          storyTextSizeMultiplier,
          storyComplexityAdjustments: submittedComplexityAdjustments,
        };
        const result = UpdateChildProfileSchema.safeParse(updateData);
        if (!result.success) {
          const newErrors: Record<string, string> = {};
          result.error.issues.forEach((issue) => {
            newErrors[issue.path.join('.')] = issue.message;
          });
          const firstMessage =
            result.error.issues[0]?.message ||
            t('child_form.validation_error_message') ||
            'Будь ласка, перевірте введені дані';
          newErrors.submit = firstMessage;
          setErrors(newErrors);
          Alert.alert(t('child_form.validation_error') || 'Помилка валідації', firstMessage);
          return;
        }
        await updateChild.mutateAsync({ id: childId, data: result.data });
      } else {
        // Create: use CreateChildProfileSchema (requires referencePhotos or aiGeneratedDescription)
        const data = {
          name,
          birthDate,
          languages: profileLanguages,
          referencePhotos: uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
          aiGeneratedDescription: description || undefined,
          descriptionLanguage: descriptionLanguage || undefined,
          appearanceTraits: Object.keys(appearanceData).length > 0 ? appearanceData : undefined,
          personality: personalityData,
          interests: interests.length > 0 ? interests : undefined,
          sensitivities: sensitivitiesData,
          familyCast: Object.keys(familyCast).length > 0 ? familyCast : undefined,
          authorPseudonym: authorPseudonym.trim() || null,
          authorAboutMe: authorAboutMe.trim() || null,
          storyTextSizeMultiplier,
          storyComplexityAdjustments: submittedComplexityAdjustments,
        };
        const result = CreateChildProfileSchema.safeParse(data);
        if (!result.success) {
          const newErrors: Record<string, string> = {};
          result.error.issues.forEach((issue) => {
            newErrors[issue.path.join('.')] = issue.message;
          });
          const firstMessage =
            result.error.issues[0]?.message ||
            t('child_form.validation_error_message') ||
            'Будь ласка, перевірте введені дані';
          newErrors.submit = firstMessage;
          setErrors(newErrors);
          Alert.alert(t('child_form.validation_error') || 'Помилка валідації', firstMessage);
          return;
        }
        await createChild.mutateAsync({
          ...result.data,
          childDataConsentAccepted,
        });
      }
      onSuccess();
    } catch (error) {
      const message = getLocalizedApiError(t, error, 'errors.try_again');
      setErrors({ submit: message });
      Alert.alert(t('common.error'), message);
    }
  };

  const showCloseButton = variant === 'modal' && !!onCancel;
  const showCancelInFooter = variant === 'modal' && !!onCancel;
  const isStorySettingsInlineSection = isInline && activeInlineSection === 'storyAuthor';
  const inlineButtonStyle = isInline
    ? isMobile
      ? styles.inlineButtonMobile
      : isStorySettingsInlineSection
        ? styles.inlineButtonStorySettings
        : styles.inlineButton
    : null;
  const inlineSaveLabelStyle = isStorySettingsInlineSection
    ? styles.inlineSaveLabelStorySettings
    : undefined;

  const imageRightsNotice = shouldShowImageRightsNotice ? (
    <View style={styles.footerImageRightsNotice}>
      <Ionicons name="information-circle-outline" size={15} color={theme.colors.text.tertiary} />
      <Text style={styles.footerImageRightsNoticeText}>
        {t('image_rights.child_inline_notice', {
          defaultValue:
            'By saving, you confirm that you have permission to use the photos in this form and are the child’s parent or legal guardian, or have their permission.',
        })}
      </Text>
    </View>
  ) : null;
  const birthDateFormatHint = getDateFormatHint(i18n.language);

  return (
    <View style={isInline ? styles.inlineContainer : styles.modalContainer}>
      {createChild.isPending && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
          <Text style={styles.loadingOverlayText}>
            {t('child_form.creating_character') || 'Создаём образ ребёнка'}
          </Text>
          <View style={styles.loadingOverlayProgress}>
            <View
              style={[styles.loadingOverlayProgressBar, { width: `${turnaroundProgressPercent}%` }]}
            />
          </View>
          <Text style={styles.loadingOverlayTimer}>
            {turnaroundRemainingSeconds > 0
              ? t('child_form.generating_remaining_sec', { count: turnaroundRemainingSeconds }) ||
                `~${turnaroundRemainingSeconds} сек`
              : t('child_form.generating_almost_done') || 'Майже готово...'}
          </Text>
        </View>
      )}
      {variant === 'modal' && (
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              {childId ? t('child_form.title_edit') : t('child_form.title_create')}
            </Text>
            <Text style={styles.stepIndicator}>
              {t('child_form.step_indicator', { current: currentStep, total: 2 })}
            </Text>
          </View>
          {showCloseButton && (
            <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {showInlineHeader && (
        <View style={styles.inlineHeader}>
          <Text style={styles.inlineTitle}>
            {childId ? t('child_form.title_edit') : t('child_form.title_create')}
          </Text>
          <Text style={[styles.stepIndicator, styles.stepIndicatorInline]}>
            {t('child_form.step_indicator', { current: currentStep, total: 2 })}
          </Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={[
          styles.content,
          variant === 'modal' && styles.contentScrollable,
          isInline && styles.contentInline,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {showIdentityFields && (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>{t('child_form.name_label')}</Text>
              <TextInput
                style={[
                  styles.input,
                  isInline && styles.inputInline,
                  errors.name && styles.inputError,
                ]}
                value={name}
                onChangeText={setName}
                placeholder={t('child_form.name_placeholder')}
                placeholderTextColor={theme.colors.text.disabled}
              />
              {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('child_form.birth_date_label')}</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={
                    birthDate && !isNaN(birthDate.getTime()) ? toDateInputValue(birthDate) : ''
                  }
                  onChange={(e) => {
                    const newDate = new Date((e.target as HTMLInputElement).value);
                    if (!isNaN(newDate.getTime())) setBirthDate(newDate);
                  }}
                  max={toDateInputValue(new Date())}
                  placeholder={birthDateFormatHint}
                  style={
                    {
                      width: '100%',
                      boxSizing: 'border-box',
                      border: `${theme.borders.width.thin}px solid ${
                        errors.birthDate
                          ? theme.colors.status.error
                          : isInline
                            ? theme.colors.border.light
                            : theme.colors.border.medium
                      }`,
                      borderRadius: theme.borders.radius.md,
                      padding: theme.spacing[3],
                      fontSize: theme.typography.fontSize.base,
                      fontFamily: 'inherit',
                      color: theme.colors.text.primary,
                      backgroundColor: isInline
                        ? theme.colors.neutral[50]
                        : theme.colors.background.secondary,
                      outline: 'none',
                    } as React.CSSProperties
                  }
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.input, isInline && styles.inputInline, styles.dateInput]}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={styles.dateText}>{birthDate.toLocaleDateString()}</Text>
                    <Ionicons
                      name="calendar-outline"
                      size={20}
                      color={theme.colors.text.secondary}
                    />
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={birthDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(_event, selectedDate) => {
                        setShowDatePicker(Platform.OS === 'ios');
                        if (selectedDate) setBirthDate(selectedDate);
                      }}
                      maximumDate={new Date()}
                    />
                  )}
                </>
              )}
              <Text style={styles.dateHint}>{birthDateFormatHint}</Text>
              {errors.birthDate && <Text style={styles.errorText}>{errors.birthDate}</Text>}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('child_form.languages_label')}</Text>
              <View style={styles.languageGrid}>
                {APP_CONFIG.supportedLanguages.map((language) => {
                  const locale = language as Locale;
                  const selected = profileLanguages.includes(language);
                  const languageConfig = SUPPORTED_LANGUAGES[locale];
                  return (
                    <TouchableOpacity
                      key={language}
                      style={[styles.languageChip, selected && styles.languageChipSelected]}
                      activeOpacity={0.8}
                      onPress={() => toggleProfileLanguage(language)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      testID={`child-profile-language-${language}`}
                    >
                      <Text style={styles.languageFlag}>{languageConfig.flag}</Text>
                      <Text
                        style={[
                          styles.languageChipText,
                          selected && styles.languageChipTextSelected,
                        ]}
                      >
                        {t(`language_names.${language}`, {
                          defaultValue: languageConfig.nativeName,
                        })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.hint}>{t('child_form.languages_hint')}</Text>
            </View>

            <View style={styles.field}>
              <View style={styles.photoLabelRow}>
                <Text style={styles.label}>{t('child_form.photos_title')}</Text>
                <Text style={styles.photoCounter}>
                  {t('photo_upload.counter', { count: photos.length, max: 5 })}
                </Text>
              </View>
              {!childId && (
                <TouchableOpacity
                  style={styles.consentRow}
                  onPress={() => setChildDataConsentAccepted((value) => !value)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[styles.checkbox, childDataConsentAccepted && styles.checkboxChecked]}
                  >
                    {childDataConsentAccepted && (
                      <Ionicons name="checkmark" size={16} color={theme.colors.text.inverse} />
                    )}
                  </View>
                  <Text style={styles.consentText}>{t('child_form.child_data_consent')}</Text>
                </TouchableOpacity>
              )}
              <PhotoUploadGrid
                photos={photos}
                onPhotosChange={setPhotos}
                maxPhotos={5}
                photoType="child"
                imageRightsConsentMode="story-submit"
                showCounter={false}
                disabled={!childId && !childDataConsentAccepted}
                childDataConsentAccepted={childDataConsentAccepted}
                formatUrl={formatAssetUrl}
              />
            </View>
          </>
        )}

        {(showStoryAuthorFields || showChildProfileFields) && (
          <>
            {showChildProfileFields && childId && currentPreviewUrl ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('child_form.current_image') || 'Аватар'}</Text>
                <View style={[styles.currentImageCard, isInline && styles.currentImageCardInline]}>
                  <Image
                    source={{ uri: formatAssetUrl(currentPreviewUrl) ?? currentPreviewUrl }}
                    style={[styles.currentImage, isInline && styles.currentImageInline]}
                    resizeMode="contain"
                  />
                </View>
              </View>
            ) : null}

            {showStoryAuthorFields && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {t('child_form.story_text_size_section_title')}
                </Text>
                <View style={styles.textSizeHeader}>
                  <Text style={[styles.label, styles.textSizeLabel]}>
                    {t('child_form.story_text_size_label')}
                  </Text>
                  <Text style={styles.textSizeValue}>
                    {t('child_form.story_text_size_current', {
                      size: effectiveStoryTextSizePx,
                    })}
                  </Text>
                </View>
                <View style={styles.textSizeControl}>
                  <Ionicons name="text-outline" size={18} color={theme.colors.text.tertiary} />
                  <View style={styles.textSizeSteps}>
                    <View style={styles.textSizeTrack} />
                    {STORY_TEXT_SIZE_MULTIPLIER_STEPS.map((step) => {
                      const selected = step === storyTextSizeMultiplier;
                      return (
                        <TouchableOpacity
                          key={step}
                          style={styles.textSizeStep}
                          activeOpacity={0.8}
                          onPress={() => setStoryTextSizeMultiplier(step)}
                        >
                          <View
                            style={[styles.textSizeDot, selected && styles.textSizeDotSelected]}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Ionicons name="text-outline" size={26} color={theme.colors.text.tertiary} />
                </View>
                <View style={styles.textSizePreviewCard}>
                  <Text style={styles.textSizePreviewLabel}>
                    {t('child_form.story_text_size_preview_label')}
                  </Text>
                  <Text
                    style={[
                      styles.textSizePreviewText,
                      {
                        fontSize: effectiveStoryTextSizePx,
                        lineHeight: storyTextPreviewLineHeight,
                      },
                    ]}
                  >
                    {t('child_form.story_text_size_preview_text')}
                  </Text>
                </View>
              </View>
            )}

            {showStoryAuthorFields && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {t('child_form.story_complexity_section_title')}
                </Text>
                <Text style={styles.complexityDescription}>
                  {t('child_form.story_complexity_description')}
                </Text>
                <View style={styles.complexityLanguages}>
                  {profileLanguages.map((language) => {
                    const locale = language as Locale;
                    const languageConfig = SUPPORTED_LANGUAGES[locale];
                    const adjustment =
                      storyComplexityAdjustments[locale] ?? DEFAULT_STORY_COMPLEXITY_ADJUSTMENT;
                    return (
                      <View key={language} style={styles.complexityLanguageCard}>
                        <View style={styles.complexityLanguageHeader}>
                          <Text style={styles.complexityLanguageName}>
                            {languageConfig.flag}{' '}
                            {t(`language_names.${language}`, {
                              defaultValue: languageConfig.nativeName,
                            })}
                          </Text>
                          <Text style={styles.complexityValue}>
                            {t(`child_form.story_complexity_${adjustment}`)}
                          </Text>
                        </View>
                        <View style={styles.textSizeControl}>
                          <Ionicons
                            name="book-outline"
                            size={18}
                            color={theme.colors.text.tertiary}
                          />
                          <View style={styles.textSizeSteps}>
                            <View style={styles.textSizeTrack} />
                            {STORY_COMPLEXITY_ADJUSTMENT_STEPS.map((step) => {
                              const selected = adjustment === step;
                              return (
                                <TouchableOpacity
                                  key={step}
                                  style={styles.textSizeStep}
                                  activeOpacity={0.8}
                                  onPress={() => setLanguageComplexity(locale, step)}
                                  accessibilityRole="radio"
                                  accessibilityState={{ checked: selected }}
                                  accessibilityLabel={t(`child_form.story_complexity_${step}`)}
                                  testID={`child-story-complexity-${language}-${step}`}
                                >
                                  <View
                                    style={[
                                      styles.textSizeDot,
                                      selected && styles.textSizeDotSelected,
                                    ]}
                                  />
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          <Ionicons
                            name="book-outline"
                            size={26}
                            color={theme.colors.text.tertiary}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {showStoryAuthorFields && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {t('child_form.author_section_title', { defaultValue: 'Author profile' })}
                </Text>
                <View style={styles.field}>
                  <Text style={styles.label}>
                    {t('child_form.author_pseudonym_label', { defaultValue: 'Pseudonym' })}
                  </Text>
                  <TextInput
                    style={[styles.input, isInline && styles.inputInline]}
                    value={authorPseudonym}
                    onChangeText={setAuthorPseudonym}
                    placeholder={t('child_form.author_pseudonym_placeholder', {
                      defaultValue: name || 'Story author',
                    })}
                    placeholderTextColor={theme.colors.text.disabled}
                    maxLength={100}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>
                    {t('child_form.author_about_label', { defaultValue: 'About the author' })}
                  </Text>
                  <TextInput
                    style={[styles.input, isInline && styles.inputInline, styles.multilineInput]}
                    value={authorAboutMe}
                    onChangeText={setAuthorAboutMe}
                    placeholder={t('child_form.author_about_placeholder', {
                      defaultValue: 'A short public bio for published stories',
                    })}
                    placeholderTextColor={theme.colors.text.disabled}
                    multiline
                    numberOfLines={3}
                    maxLength={1000}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            )}

            {showChildProfileFields && (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('child_form.description')}</Text>
                  {photos.some((p) => !p.isUploading && isServerAssetUrl(p.url)) &&
                  analyzeChild.isPending ? (
                    <View style={styles.turnaroundGenerating}>
                      <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                      <Text style={styles.turnaroundGeneratingText}>
                        {t('child_form.analyzing_photos')}
                      </Text>
                    </View>
                  ) : (
                    <TextInput
                      style={[
                        styles.input,
                        isInline && styles.inputInline,
                        styles.multilineInput,
                        isInline && styles.descriptionInputInline,
                      ]}
                      value={description}
                      onChangeText={setDescription}
                      placeholder={t('child_form.description_placeholder')}
                      placeholderTextColor={theme.colors.text.disabled}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      editable={
                        childId
                          ? true
                          : !photos.some((p) => !p.isUploading && isServerAssetUrl(p.url))
                      }
                    />
                  )}
                  {description && !analyzeChild.isPending ? (
                    <Text style={styles.hint}>{t('child_form.generated_by_ai_hint')}</Text>
                  ) : null}
                  {!photos.some((p) => !p.isUploading && isServerAssetUrl(p.url)) ? (
                    <Text style={styles.hint}>
                      {t('child_form.description_upload_photos_first')}
                    </Text>
                  ) : null}
                </View>

                <ExpandableCard title={t('child_form.appearance_title')} defaultExpanded={false}>
                  <ChipSelector
                    label={t('character_form.hair_color')}
                    options={HAIR_COLORS}
                    selected={appearance.hairColor || ''}
                    onSelect={(val) =>
                      setAppearance({ ...appearance, hairColor: val as HairColor })
                    }
                    translationPrefix="character_form.hair_colors"
                    getTranslation={t}
                  />
                  <ChipSelector
                    label={t('character_form.hair_length')}
                    options={HAIR_LENGTHS}
                    selected={appearance.hairLength || ''}
                    onSelect={(val) =>
                      setAppearance({ ...appearance, hairLength: val as HairLength })
                    }
                    translationPrefix="character_form.hair_lengths"
                    getTranslation={t}
                  />
                  <ChipSelector
                    label={t('character_form.hair_style')}
                    options={HAIR_STYLES}
                    selected={appearance.hairStyle || ''}
                    onSelect={(val) =>
                      setAppearance({ ...appearance, hairStyle: val as HairStyle })
                    }
                    translationPrefix="character_form.hair_styles"
                    getTranslation={t}
                  />
                  <ChipSelector
                    label={t('character_form.eye_color')}
                    options={EYE_COLORS}
                    selected={appearance.eyeColor || ''}
                    onSelect={(val) => setAppearance({ ...appearance, eyeColor: val as EyeColor })}
                    translationPrefix="character_form.eye_colors"
                    getTranslation={t}
                  />
                  <ChipSelector
                    label={t('character_form.skin_tone')}
                    options={SKIN_TONES}
                    selected={appearance.skinTone || ''}
                    onSelect={(val) => setAppearance({ ...appearance, skinTone: val as SkinTone })}
                    translationPrefix="character_form.skin_tones"
                    getTranslation={t}
                  />
                  <ChipSelector
                    label={t('character_form.distinctive_features')}
                    options={DISTINCTIVE_FEATURES}
                    selected={appearance.distinctiveFeatures}
                    onSelect={(val) =>
                      setAppearance({
                        ...appearance,
                        distinctiveFeatures: val as DistinctiveFeature[],
                      })
                    }
                    multiple
                    max={3}
                    translationPrefix="child_form.features"
                    getTranslation={t}
                  />
                </ExpandableCard>

                <ExpandableCard title={t('child_form.personality_title')} defaultExpanded={false}>
                  <ChipSelector
                    label={t('character_form.personality_traits')}
                    options={PERSONALITY_TRAITS}
                    selected={personality.traits}
                    onSelect={(val) =>
                      setPersonality({ ...personality, traits: val as PersonalityTrait[] })
                    }
                    multiple
                    max={5}
                    translationPrefix="child_form.traits"
                    getTranslation={t}
                  />
                  <ChipSelector
                    label={t('character_form.favorite_activities')}
                    options={FAVORITE_ACTIVITIES}
                    selected={personality.favoriteActivities}
                    onSelect={(val) =>
                      setPersonality({
                        ...personality,
                        favoriteActivities: val as FavoriteActivity[],
                      })
                    }
                    multiple
                    max={5}
                    translationPrefix="child_form.activities"
                    getTranslation={t}
                  />
                </ExpandableCard>

                <ExpandableCard title={t('child_form.interests_title')} defaultExpanded={false}>
                  <ChipSelector
                    label={t('child_form.interests_title')}
                    options={INTERESTS}
                    selected={interests}
                    onSelect={(val) => setInterests(val as Interest[])}
                    multiple
                    max={7}
                    translationPrefix="child_form.interests"
                    getTranslation={t}
                  />
                </ExpandableCard>

                <ExpandableCard title={t('child_form.sensitivities_title')} defaultExpanded={false}>
                  <View style={styles.field}>
                    <Text style={styles.label}>{t('child_form.fear_level_label')}</Text>
                    <View style={styles.genderButtons}>
                      {(['none', 'low', 'medium', 'high'] as const).map((level) => (
                        <TouchableOpacity
                          key={level}
                          style={[
                            styles.genderButton,
                            sensitivities.fearLevel === level && styles.genderButtonSelected,
                          ]}
                          onPress={() => setSensitivities({ ...sensitivities, fearLevel: level })}
                        >
                          <Text
                            style={[
                              styles.genderButtonText,
                              sensitivities.fearLevel === level && styles.genderButtonTextSelected,
                            ]}
                          >
                            {t(`child_form.fear_level_${level}`)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <ChipSelector
                    label={t('child_form.common_fears_label')}
                    options={COMMON_FEARS}
                    selected={sensitivities.commonFears}
                    onSelect={(val) =>
                      setSensitivities({ ...sensitivities, commonFears: val as CommonFear[] })
                    }
                    multiple
                    max={5}
                    translationPrefix="child_form.fears"
                    getTranslation={t}
                  />
                  <ChipSelector
                    label={t('child_form.avoid_topics_label')}
                    options={AVOID_TOPICS}
                    selected={sensitivities.avoidTopics}
                    onSelect={(val) =>
                      setSensitivities({ ...sensitivities, avoidTopics: val as AvoidTopic[] })
                    }
                    multiple
                    max={5}
                    translationPrefix="child_form.avoid"
                    getTranslation={t}
                  />
                </ExpandableCard>
              </>
            )}

            {errors.submit && (
              <Text style={[styles.errorText, styles.submitError]}>{errors.submit}</Text>
            )}
          </>
        )}
      </ScrollView>

      <View
        style={[styles.footer, isInline && styles.footerInline, isMobile && styles.footerMobile]}
      >
        {isSectionedInline ? (
          <View style={styles.footerSaveColumn}>
            {imageRightsNotice}
            <AppButton
              label={resolvedSaveLabel}
              onPress={handleSubmit}
              disabled={updateChild.isPending || !name.trim() || photos.some((p) => p.isUploading)}
              loading={updateChild.isPending}
              style={[styles.footerAction, inlineButtonStyle, styles.footerSaveAction]}
              labelStyle={inlineSaveLabelStyle}
            />
          </View>
        ) : currentStep === 1 ? (
          <>
            {showCancelInFooter && (
              <AppButton
                label={t('child_form.cancel_button')}
                onPress={onCancel}
                variant="secondary"
                style={styles.footerAction}
              />
            )}
            <AppButton
              label={t('child_form.continue_button') || 'Continue'}
              onPress={handleContinue}
              disabled={!name.trim() || photos.some((p) => p.isUploading)}
              style={[
                styles.footerAction,
                !showCancelInFooter && !isInline && styles.footerActionFull,
                inlineButtonStyle,
              ]}
            />
          </>
        ) : (
          <>
            <AppButton
              label={t('child_form.back') || 'Back'}
              onPress={() => setCurrentStep(1)}
              variant="secondary"
              style={[styles.footerAction, inlineButtonStyle]}
            />
            <View style={styles.footerSaveColumn}>
              {imageRightsNotice}
              <AppButton
                label={resolvedSaveLabel}
                onPress={handleSubmit}
                disabled={
                  createChild.isPending ||
                  updateChild.isPending ||
                  (!childId && !childDataConsentAccepted) ||
                  (!childId && !description.trim()) ||
                  (!childId && analyzeChild.isPending)
                }
                loading={createChild.isPending || updateChild.isPending}
                style={[styles.footerAction, inlineButtonStyle, styles.footerSaveAction]}
                labelStyle={inlineSaveLabelStyle}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineContainer: {
    width: '100%',
    backgroundColor: theme.colors.background.primary,
  },
  modalContainer: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[5],
    paddingBottom: theme.spacing[4],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
  },
  inlineTitle: {
    flexShrink: 1,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing[5],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  stepIndicator: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[1],
  },
  stepIndicatorInline: {
    marginTop: 0,
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.neutral[50],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    overflow: 'hidden',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  closeButton: {
    padding: theme.spacing[1],
  },
  content: {
    padding: theme.spacing[5],
  },
  contentInline: {
    backgroundColor: theme.colors.background.primary,
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[6],
    paddingBottom: theme.spacing[2],
  },
  contentScrollable: {
    flex: 1,
  },
  field: {
    marginBottom: theme.spacing[6],
  },
  photoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  photoCounter: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    marginBottom: theme.spacing[2],
  },
  currentImageCard: {
    padding: theme.spacing[3],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
  },
  currentImageCardInline: {
    width: 300,
    maxWidth: '100%',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.neutral[50],
  },
  currentImage: {
    width: '100%',
    height: 180,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.primary,
  },
  currentImageInline: {
    height: 220,
    backgroundColor: theme.colors.background.primary,
  },
  label: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: theme.borders.radius.sm,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.secondary,
    marginTop: 1,
  },
  checkboxChecked: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  consentText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
    color: theme.colors.text.secondary,
  },
  input: {
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[3],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.secondary,
  },
  inputInline: {
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.neutral[50],
  },
  inputError: {
    borderColor: theme.colors.status.error,
  },
  dateInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
  },
  dateHint: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing[1],
  },
  errorText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.status.error,
    marginTop: theme.spacing[1],
  },
  genderButtons: {
    flexDirection: 'row',
    gap: theme.spacing[2],
  },
  genderButton: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
    backgroundColor: theme.colors.background.secondary,
  },
  genderButtonSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  genderButtonText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
  },
  genderButtonTextSelected: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  submitError: {
    textAlign: 'center',
    marginTop: theme.spacing[2],
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    padding: theme.spacing[5],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: theme.colors.border.light,
  },
  footerSaveColumn: {
    flex: 1,
    alignItems: 'stretch',
  },
  footerSaveAction: {
    alignSelf: 'flex-end',
  },
  footerImageRightsNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
    alignSelf: 'flex-end',
    maxWidth: 520,
    marginBottom: theme.spacing[2],
  },
  footerImageRightsNoticeText: {
    flex: 1,
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.fontSize.xs,
    lineHeight: 17,
    textAlign: 'right',
  },
  footerInline: {
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.background.primary,
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[6],
  },
  footerMobile: {
    flexDirection: 'column',
  },
  footerAction: {
    flex: 1,
  },
  footerActionFull: {
    flex: 1,
  },
  inlineButton: {
    flex: 0,
    width: 288,
    minWidth: 288,
    maxWidth: 288,
    alignSelf: 'center',
  },
  inlineButtonStorySettings: {
    flex: 0,
    width: 360,
    minWidth: 360,
    maxWidth: 360,
    alignSelf: 'center',
  },
  inlineButtonMobile: {
    flex: 0,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  inlineSaveLabelStorySettings: {
    fontSize: theme.typography.fontSize.sm,
  },
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  descriptionInputInline: {
    minHeight: 132,
  },
  hint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[2],
    fontStyle: 'italic',
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  languageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.secondary,
  },
  languageChipSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  languageFlag: {
    fontSize: theme.typography.fontSize.base,
  },
  languageChipText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  languageChipTextSelected: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  textSizeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  textSizeLabel: {
    flex: 1,
    marginBottom: 0,
  },
  textSizeValue: {
    flexShrink: 0,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
  },
  textSizeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  textSizeSteps: {
    flex: 1,
    minHeight: 44,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  textSizeTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 19,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border.light,
  },
  textSizeStep: {
    width: 46,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  textSizeDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.primary,
  },
  textSizeDotSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  textSizePreviewCard: {
    marginTop: theme.spacing[3],
    padding: theme.spacing[4],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
  },
  textSizePreviewLabel: {
    marginBottom: theme.spacing[2],
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
  },
  textSizePreviewText: {
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeight.regular,
  },
  complexityDescription: {
    marginBottom: theme.spacing[4],
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
    color: theme.colors.text.secondary,
  },
  complexityLanguages: {
    gap: theme.spacing[3],
  },
  complexityLanguageCard: {
    padding: theme.spacing[4],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
  },
  complexityLanguageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  complexityLanguageName: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  complexityValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingOverlayText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
  },
  loadingOverlayProgress: {
    marginTop: theme.spacing[4],
    width: 200,
    height: 6,
    backgroundColor: theme.colors.border.light,
    borderRadius: 3,
    overflow: 'hidden',
  },
  loadingOverlayProgressBar: {
    height: '100%',
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: 3,
  },
  loadingOverlayTimer: {
    marginTop: theme.spacing[2],
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.tertiary,
    fontVariant: ['tabular-nums'],
  },
  turnaroundGenerating: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
  },
  turnaroundGeneratingText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
});
