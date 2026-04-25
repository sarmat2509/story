import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, Alert, ActivityIndicator, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { GlassPrimaryButton } from './GlassPrimaryButton';
import { useCreateChild, useUpdateChild, useAnalyzeChild } from '@/api/children';
import { CreateChildProfileSchema, DEFAULT_LOCALE, UpdateChildProfileSchema, LOCALE_IDS, ReferencePhoto } from '@wondertales/shared';

/** Normalize BCP 47 locale (e.g. uk-UA, en-US) to base code for API (uk, en) */
function toBaseLocale(locale: string | undefined): string {
  const base = (locale || '').split('-')[0]?.toLowerCase() || DEFAULT_LOCALE;
  return LOCALE_IDS.includes(base as any) ? base : DEFAULT_LOCALE;
}
import { UploadPhotoResult } from '@/utils/uploadPhoto';
import { formatAssetUrl, isServerAssetUrl } from '@/utils/assetUrl';
import { API_BASE_URL, APP_CONFIG } from '@/config/constants';

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
  const base = typeof window !== 'undefined'
    ? window.location.origin
    : API_BASE_URL.replace(/\/$/, '');
  const assetPath = withoutQuery.startsWith('/api/v1/assets/')
    ? withoutQuery
    : withoutQuery.startsWith('/')
      ? `/api/v1/assets/${withoutQuery.slice(1)}`
      : `/api/v1/assets/${withoutQuery}`;
  return `${base}${assetPath}`;
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
  AvoidTopic
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
}

interface Props {
  childId?: string;
  initialData?: ChildFormInitialData;
  onSuccess: () => void;
  onCancel?: () => void;
  variant?: 'modal' | 'inline';
}

export function ChildFormContent({ childId, initialData, onSuccess, onCancel, variant = 'modal' }: Props) {
  const { t, i18n } = useTranslation();
  const createChild = useCreateChild();
  const updateChild = useUpdateChild();
  const analyzeChild = useAnalyzeChild();
  const currentPreviewUrl = initialData?.turnaroundSheet?.frontUrl ?? null;

  const [currentStep, setCurrentStep] = useState(1);
  const scrollRef = useRef<ScrollView>(null);

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [photos, setPhotos] = useState<UploadPhotoResult[]>([]);
  const [description, setDescription] = useState('');
  const [descriptionLanguage, setDescriptionLanguage] = useState<string | undefined>(undefined);

  const [appearance, setAppearance] = useState({
    hairColor: undefined as HairColor | undefined,
    hairLength: undefined as HairLength | undefined,
    hairStyle: undefined as HairStyle | undefined,
    eyeColor: undefined as EyeColor | undefined,
    skinTone: undefined as SkinTone | undefined,
    distinctiveFeatures: [] as DistinctiveFeature[]
  });

  const [personality, setPersonality] = useState({
    traits: [] as PersonalityTrait[],
    favoriteActivities: [] as FavoriteActivity[]
  });

  const [interests, setInterests] = useState<Interest[]>([]);
  const [sensitivities, setSensitivities] = useState({
    fearLevel: undefined as 'none' | 'low' | 'medium' | 'high' | undefined,
    commonFears: [] as CommonFear[],
    avoidTopics: [] as AvoidTopic[]
  });
  const [familyCast, setFamilyCast] = useState<Record<string, string>>({});
  const [turnaroundElapsedSeconds, setTurnaroundElapsedSeconds] = useState(0);

  const TURNAROUND_ESTIMATED_SECONDS = 30;
  const turnaroundRemainingSeconds = Math.max(0, TURNAROUND_ESTIMATED_SECONDS - turnaroundElapsedSeconds);
  const turnaroundProgressPercent = Math.min(99, Math.round((turnaroundElapsedSeconds / TURNAROUND_ESTIMATED_SECONDS) * 100));
  const profileLanguages = initialData?.languages?.length
    ? initialData.languages
    : [toBaseLocale(i18n.language)];

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
      if (initialData.referencePhotos && initialData.referencePhotos.length > 0) {
        setPhotos(initialData.referencePhotos.map((photo, index) => ({
          id: `existing-${index}`,
          url: photo.url,
          uploadedAt: photo.uploadedAt,
          isUploading: false
        })));
      } else {
        setPhotos([]);
      }
      setDescription(initialData.aiGeneratedDescription || '');
      setDescriptionLanguage(initialData.descriptionLanguage || undefined);
      if (initialData.appearanceTraits) {
        setAppearance({
          hairColor: initialData.appearanceTraits.hairColor as HairColor | undefined,
          hairLength: initialData.appearanceTraits.hairLength as HairLength | undefined,
          hairStyle: initialData.appearanceTraits.hairStyle as HairStyle | undefined,
          eyeColor: initialData.appearanceTraits.eyeColor as EyeColor | undefined,
          skinTone: initialData.appearanceTraits.skinTone as SkinTone | undefined,
          distinctiveFeatures: (initialData.appearanceTraits.distinctiveFeatures || []) as DistinctiveFeature[]
        });
      } else {
        setAppearance({
          hairColor: undefined,
          hairLength: undefined,
          hairStyle: undefined,
          eyeColor: undefined,
          skinTone: undefined,
          distinctiveFeatures: []
        });
      }
      if (initialData.personality) {
        setPersonality({
          traits: (initialData.personality.traits || []) as PersonalityTrait[],
          favoriteActivities: (initialData.personality.favoriteActivities || []) as FavoriteActivity[]
        });
      } else {
        setPersonality({ traits: [], favoriteActivities: [] });
      }
        setInterests((initialData.interests || []) as Interest[]);
      if (initialData.sensitivities) {
        setSensitivities({
          fearLevel: initialData.sensitivities.fearLevel as 'none' | 'low' | 'medium' | 'high' | undefined,
          commonFears: (initialData.sensitivities.commonFears || []) as CommonFear[],
          avoidTopics: (initialData.sensitivities.avoidTopics || []) as AvoidTopic[]
        });
      } else {
        setSensitivities({ fearLevel: undefined, commonFears: [], avoidTopics: [] });
      }
      setFamilyCast(initialData.familyCast || {});
    } else {
      setName('');
      setBirthDate(new Date());
      setPhotos([]);
      setDescription('');
      setDescriptionLanguage(undefined);
      setAppearance({
        hairColor: undefined,
        hairLength: undefined,
        hairStyle: undefined,
        eyeColor: undefined,
        skinTone: undefined,
        distinctiveFeatures: []
      });
      setPersonality({ traits: [], favoriteActivities: [] });
      setInterests([]);
      setSensitivities({ fearLevel: undefined, commonFears: [], avoidTopics: [] });
      setFamilyCast({});
    }
    setErrors({});
  }, [initialData, childId]);

  // Auto-analyze on step 2 entry (create only, when photos exist)
  const hasAnalyzedRef = React.useRef(false);
  useEffect(() => {
    if (!childId && currentStep === 2 && !hasAnalyzedRef.current) {
      const uploadedPhotos = photos
        .filter(p => !p.isUploading && isServerAssetUrl(p.url))
        .map(p => p.url!);
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
                    distinctiveFeatures: (result.appearance.distinctiveFeatures || []) as DistinctiveFeature[]
                  });
                }
              }
            }
          );
        });
      }
    }
    if (currentStep === 1) {
      hasAnalyzedRef.current = false;
    }
  }, [childId, currentStep, photos, description, analyzeChild.mutate, i18n.language]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [currentStep]);

  const handleContinue = () => {
    if (!name.trim()) {
      Alert.alert(t('error') || 'Error', t('child_form.name_required') || 'Name is required');
      return;
    }
    if (!birthDate) {
      Alert.alert(t('error') || 'Error', t('child_form.birth_date_required') || 'Birth date is required');
      return;
    }
    const hasUploadingPhotos = photos.some(photo => photo.isUploading);
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
      if (appearance.distinctiveFeatures.length > 0) appearanceData.distinctiveFeatures = appearance.distinctiveFeatures;

      const personalityData = (personality.traits.length > 0 || personality.favoriteActivities.length > 0) ? personality : undefined;
      const sensitivitiesData = (sensitivities.fearLevel || sensitivities.commonFears.length > 0 || sensitivities.avoidTopics.length > 0) ? sensitivities : undefined;

      const hasUploadingPhotos = photos.some(photo => photo.isUploading);
      if (hasUploadingPhotos) {
        Alert.alert(
          t('child_form.upload_in_progress') || 'Завантаження',
          t('child_form.wait_for_upload') || 'Будь ласка, зачекайте поки завантажаться всі фото'
        );
        return;
      }

      const uploadedPhotos = photos
        .filter(photo => !photo.isUploading && isServerAssetUrl(photo.url))
        .map(({ url, uploadedAt }) => ({ url: toAbsoluteAssetUrl(url), uploadedAt }));

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
          familyCast: Object.keys(familyCast).length > 0 ? familyCast : undefined
        };
        const result = UpdateChildProfileSchema.safeParse(updateData);
        if (!result.success) {
          const newErrors: Record<string, string> = {};
          result.error.issues.forEach((issue) => {
            newErrors[issue.path.join('.')] = issue.message;
          });
          const firstMessage = result.error.issues[0]?.message || (t('child_form.validation_error_message') || 'Будь ласка, перевірте введені дані');
          newErrors.submit = firstMessage;
          setErrors(newErrors);
          Alert.alert(
            t('child_form.validation_error') || 'Помилка валідації',
            firstMessage
          );
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
          familyCast: Object.keys(familyCast).length > 0 ? familyCast : undefined
        };
        const result = CreateChildProfileSchema.safeParse(data);
        if (!result.success) {
          const newErrors: Record<string, string> = {};
          result.error.issues.forEach((issue) => {
            newErrors[issue.path.join('.')] = issue.message;
          });
          const firstMessage = result.error.issues[0]?.message || (t('child_form.validation_error_message') || 'Будь ласка, перевірте введені дані');
          newErrors.submit = firstMessage;
          setErrors(newErrors);
          Alert.alert(
            t('child_form.validation_error') || 'Помилка валідації',
            firstMessage
          );
          return;
        }
        await createChild.mutateAsync(result.data);
      }
      onSuccess();
    } catch {
      setErrors({ submit: 'Failed to save. Please try again.' });
    }
  };

  const showCloseButton = variant === 'modal' && !!onCancel;
  const showCancelInFooter = variant === 'modal' && !!onCancel;

  return (
    <View style={variant === 'inline' ? styles.inlineContainer : styles.modalContainer}>
      {createChild.isPending && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
          <Text style={styles.loadingOverlayText}>{t('child_form.creating_character') || 'Создаём образ ребёнка'}</Text>
          <View style={styles.loadingOverlayProgress}>
            <View style={[styles.loadingOverlayProgressBar, { width: `${turnaroundProgressPercent}%` }]} />
          </View>
          <Text style={styles.loadingOverlayTimer}>
            {turnaroundRemainingSeconds > 0
              ? t('child_form.generating_remaining_sec', { count: turnaroundRemainingSeconds }) || `~${turnaroundRemainingSeconds} сек`
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

      {variant === 'inline' && (
        <View style={styles.inlineHeader}>
          <Text style={styles.inlineTitle}>
            {childId ? t('child_form.title_edit') : t('child_form.title_create')}
          </Text>
          <Text style={styles.stepIndicator}>
            {t('child_form.step_indicator', { current: currentStep, total: 2 })}
          </Text>
        </View>
      )}

      <ScrollView ref={scrollRef} style={[styles.content, variant === 'modal' && styles.contentScrollable]} showsVerticalScrollIndicator={false}>
        {currentStep === 1 && (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>{t('child_form.name_label')}</Text>
              <TextInput
                style={[styles.input, errors.name && styles.inputError]}
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
                  value={birthDate && !isNaN(birthDate.getTime()) ? birthDate.toISOString().split('T')[0] : ''}
                  onChange={(e) => {
                    const newDate = new Date((e.target as HTMLInputElement).value);
                    if (!isNaN(newDate.getTime())) setBirthDate(newDate);
                  }}
                  max={new Date().toISOString().split('T')[0]}
                  style={{ ...styles.input, ...(errors.birthDate ? styles.inputError : {}) } as React.CSSProperties}
                />
              ) : (
                <>
                  <TouchableOpacity style={[styles.input, styles.dateInput]} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.dateText}>{birthDate.toLocaleDateString()}</Text>
                    <Ionicons name="calendar-outline" size={20} color={theme.colors.text.secondary} />
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
              {errors.birthDate && <Text style={styles.errorText}>{errors.birthDate}</Text>}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('child_form.photos_title')}</Text>
              <PhotoUploadGrid
                photos={photos}
                onPhotosChange={setPhotos}
                maxPhotos={5}
                photoType="child"
                formatUrl={formatAssetUrl}
              />
            </View>
          </>
        )}

        {currentStep === 2 && (
          <>
            {childId && currentPreviewUrl ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('child_form.current_image') || 'Аватар'}</Text>
                <View style={styles.currentImageCard}>
                  <Image
                    source={{ uri: formatAssetUrl(currentPreviewUrl) ?? currentPreviewUrl }}
                    style={styles.currentImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('child_form.description')}</Text>
              {photos.some(p => !p.isUploading && isServerAssetUrl(p.url)) && analyzeChild.isPending ? (
                <View style={styles.turnaroundGenerating}>
                  <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                  <Text style={styles.turnaroundGeneratingText}>{t('child_form.analyzing_photos')}</Text>
                </View>
              ) : (
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('child_form.description_placeholder')}
                  placeholderTextColor={theme.colors.text.disabled}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  editable={childId ? true : !photos.some(p => !p.isUploading && isServerAssetUrl(p.url))}
                />
              )}
              {description && !analyzeChild.isPending ? (
                <Text style={styles.hint}>{t('child_form.generated_by_ai_hint')}</Text>
              ) : null}
              {!photos.some(p => !p.isUploading && isServerAssetUrl(p.url)) ? (
                <Text style={styles.hint}>{t('child_form.description_upload_photos_first')}</Text>
              ) : null}
            </View>

            <ExpandableCard title={t('child_form.appearance_title')} defaultExpanded={false}>
              <ChipSelector label={t('character_form.hair_color')} options={HAIR_COLORS} selected={appearance.hairColor || ''} onSelect={(val) => setAppearance({ ...appearance, hairColor: val as HairColor })} translationPrefix="character_form.hair_colors" getTranslation={t} />
              <ChipSelector label={t('character_form.hair_length')} options={HAIR_LENGTHS} selected={appearance.hairLength || ''} onSelect={(val) => setAppearance({ ...appearance, hairLength: val as HairLength })} translationPrefix="character_form.hair_lengths" getTranslation={t} />
              <ChipSelector label={t('character_form.hair_style')} options={HAIR_STYLES} selected={appearance.hairStyle || ''} onSelect={(val) => setAppearance({ ...appearance, hairStyle: val as HairStyle })} translationPrefix="character_form.hair_styles" getTranslation={t} />
              <ChipSelector label={t('character_form.eye_color')} options={EYE_COLORS} selected={appearance.eyeColor || ''} onSelect={(val) => setAppearance({ ...appearance, eyeColor: val as EyeColor })} translationPrefix="character_form.eye_colors" getTranslation={t} />
              <ChipSelector label={t('character_form.skin_tone')} options={SKIN_TONES} selected={appearance.skinTone || ''} onSelect={(val) => setAppearance({ ...appearance, skinTone: val as SkinTone })} translationPrefix="character_form.skin_tones" getTranslation={t} />
              <ChipSelector label={t('character_form.distinctive_features')} options={DISTINCTIVE_FEATURES} selected={appearance.distinctiveFeatures} onSelect={(val) => setAppearance({ ...appearance, distinctiveFeatures: val as DistinctiveFeature[] })} multiple max={3} translationPrefix="child_form.features" getTranslation={t} />
            </ExpandableCard>

            <ExpandableCard title={t('child_form.personality_title')} defaultExpanded={false}>
              <ChipSelector label={t('character_form.personality_traits')} options={PERSONALITY_TRAITS} selected={personality.traits} onSelect={(val) => setPersonality({ ...personality, traits: val as PersonalityTrait[] })} multiple max={5} translationPrefix="child_form.traits" getTranslation={t} />
              <ChipSelector label={t('character_form.favorite_activities')} options={FAVORITE_ACTIVITIES} selected={personality.favoriteActivities} onSelect={(val) => setPersonality({ ...personality, favoriteActivities: val as FavoriteActivity[] })} multiple max={5} translationPrefix="child_form.activities" getTranslation={t} />
            </ExpandableCard>

            <ExpandableCard title={t('child_form.interests_title')} defaultExpanded={false}>
              <ChipSelector label={t('child_form.interests_title')} options={INTERESTS} selected={interests} onSelect={(val) => setInterests(val as Interest[])} multiple max={7} translationPrefix="child_form.interests" getTranslation={t} />
            </ExpandableCard>

            <ExpandableCard title={t('child_form.sensitivities_title')} defaultExpanded={false}>
              <View style={styles.field}>
                <Text style={styles.label}>{t('child_form.fear_level_label')}</Text>
                <View style={styles.genderButtons}>
                  {(['none', 'low', 'medium', 'high'] as const).map((level) => (
                    <TouchableOpacity
                      key={level}
                      style={[styles.genderButton, sensitivities.fearLevel === level && styles.genderButtonSelected]}
                      onPress={() => setSensitivities({ ...sensitivities, fearLevel: level })}
                    >
                      <Text style={[styles.genderButtonText, sensitivities.fearLevel === level && styles.genderButtonTextSelected]}>
                        {t(`child_form.fear_level_${level}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <ChipSelector label={t('child_form.common_fears_label')} options={COMMON_FEARS} selected={sensitivities.commonFears} onSelect={(val) => setSensitivities({ ...sensitivities, commonFears: val as CommonFear[] })} multiple max={5} translationPrefix="child_form.fears" getTranslation={t} />
              <ChipSelector label={t('child_form.avoid_topics_label')} options={AVOID_TOPICS} selected={sensitivities.avoidTopics} onSelect={(val) => setSensitivities({ ...sensitivities, avoidTopics: val as AvoidTopic[] })} multiple max={5} translationPrefix="child_form.avoid" getTranslation={t} />
            </ExpandableCard>

            {errors.submit && <Text style={[styles.errorText, styles.submitError]}>{errors.submit}</Text>}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, variant === 'inline' && styles.footerInline]}>
        {currentStep === 1 ? (
          <>
            {showCancelInFooter && (
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>{t('child_form.cancel_button')}</Text>
              </TouchableOpacity>
            )}
            <GlassPrimaryButton
              title={t('child_form.continue_button') || 'Continue'}
              onPress={handleContinue}
              disabled={!name.trim() || photos.some(p => p.isUploading)}
              size="footer"
              style={[styles.button, !showCancelInFooter && styles.buttonFull]}
            />
          </>
        ) : (
          <>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setCurrentStep(1)}>
              <Text style={styles.cancelButtonText}>{t('child_form.back') || 'Back'}</Text>
            </TouchableOpacity>
            <GlassPrimaryButton
              title={t('child_form.save_button')}
              onPress={handleSubmit}
              disabled={createChild.isPending || updateChild.isPending || (!childId && !description.trim()) || (!childId && analyzeChild.isPending)}
              loading={createChild.isPending || updateChild.isPending}
              size="footer"
              style={styles.button}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineContainer: {
    flex: 1,
  },
  modalContainer: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  inlineHeader: {
    marginBottom: theme.spacing[4],
  },
  inlineTitle: {
    fontSize: theme.typography.fontSize.xl,
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
  closeButton: {
    padding: theme.spacing[1],
  },
  content: {
    padding: theme.spacing[5],
  },
  contentScrollable: {
    flex: 1,
  },
  field: {
    marginBottom: theme.spacing[5],
  },
  currentImageCard: {
    padding: theme.spacing[3],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
  },
  currentImage: {
    width: '100%',
    height: 180,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.primary,
  },
  label: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
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
  footerInline: {
    borderTopWidth: 0,
    paddingTop: theme.spacing[2],
  },
  button: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  buttonFull: {
    flex: 1,
  },
  cancelButton: {
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
  },
  cancelButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
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
  hint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[2],
    fontStyle: 'italic',
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
