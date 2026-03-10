import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, Alert, ActivityIndicator, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { useCreateChild, useUpdateChild, useAnalyzeChild, useGenerateChildTurnaround } from '@/api/children';
import { CreateChildProfileSchema, LOCALE_IDS, ReferencePhoto } from '@wondertales/shared';
import { UploadPhotoResult } from '@/utils/uploadPhoto';
import { formatAssetUrl, isServerAssetUrl } from '@/utils/assetUrl';
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

interface Props {
  visible: boolean;
  onClose: () => void;
  childId?: string;
  initialData?: {
    name: string;
    birthDate: Date;
    gender?: 'girl' | 'boy' | 'other';
    languages: string[];
    referencePhotos?: ReferencePhoto[];
    appearanceTraits?: any;
    personality?: any;
    interests?: Interest[];
    sensitivities?: any;
    familyCast?: Record<string, string>;
    aiGeneratedDescription?: string;
    descriptionLanguage?: string;
    turnaroundSheet?: { url: string; generatedAt: string };
  };
}

export function ChildFormModal({ visible, onClose, childId, initialData }: Props) {
  const { t, i18n } = useTranslation();
  const createChild = useCreateChild();
  const updateChild = useUpdateChild();
  const analyzeChild = useAnalyzeChild();
  const generateTurnaround = useGenerateChildTurnaround();
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);

  // Turnaround sheet (read-only, from backend)
  const [turnaroundSheetUrl, setTurnaroundSheetUrl] = useState<string | undefined>(undefined);
  
  // Basic fields
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<'girl' | 'boy' | 'other' | undefined>(undefined);
  const [languages, setLanguages] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Photos
  const [photos, setPhotos] = useState<UploadPhotoResult[]>([]);

  // Description (AI-generated, in UI language)
  const [description, setDescription] = useState('');
  const [descriptionLanguage, setDescriptionLanguage] = useState<string | undefined>(undefined);

  // Appearance
  const [appearance, setAppearance] = useState({
    hairColor: undefined as HairColor | undefined,
    hairLength: undefined as HairLength | undefined,
    hairStyle: undefined as HairStyle | undefined,
    eyeColor: undefined as EyeColor | undefined,
    skinTone: undefined as SkinTone | undefined,
    distinctiveFeatures: [] as DistinctiveFeature[]
  });

  // Personality
  const [personality, setPersonality] = useState({
    traits: [] as PersonalityTrait[],
    favoriteActivities: [] as FavoriteActivity[]
  });

  // Interests
  const [interests, setInterests] = useState<Interest[]>([]);

  // Sensitivities
  const [sensitivities, setSensitivities] = useState({
    fearLevel: undefined as 'none' | 'low' | 'medium' | 'high' | undefined,
    commonFears: [] as CommonFear[],
    avoidTopics: [] as AvoidTopic[]
  });

  // Family cast
  const [familyCast, setFamilyCast] = useState<Record<string, string>>({});

  // Reset form when modal opens/closes
  useEffect(() => {
    if (visible) {
      setCurrentStep(1);
      
      console.log('[ChildFormModal] initialData:', {
        hasInitialData: !!initialData,
        hasPhotos: !!initialData?.referencePhotos,
        photosCount: initialData?.referencePhotos?.length || 0,
        photos: initialData?.referencePhotos
      });
      
      if (initialData) {
        setName(initialData.name);
        setBirthDate(initialData.birthDate);
        setGender(initialData.gender);
        setLanguages(initialData.languages);
        
        // Load existing photos
        if (initialData.referencePhotos && initialData.referencePhotos.length > 0) {
          const mappedPhotos = initialData.referencePhotos.map((photo, index) => ({
            id: `existing-${index}`,
            url: photo.url,
            uploadedAt: photo.uploadedAt,
            isUploading: false
          }));
          console.log('[ChildFormModal] Setting photos:', mappedPhotos);
          setPhotos(mappedPhotos);
        } else {
          console.log('[ChildFormModal] No photos to load');
          setPhotos([]);
        }
        
        // Load AI-generated description
        if (initialData.aiGeneratedDescription) {
          setDescription(initialData.aiGeneratedDescription);
        } else {
          setDescription('');
        }
        setDescriptionLanguage((initialData as any).descriptionLanguage || undefined);
        
        // Load appearance traits
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
        
        // Load personality
        if (initialData.personality) {
          setPersonality({
            traits: (initialData.personality.traits || []) as PersonalityTrait[],
            favoriteActivities: (initialData.personality.favoriteActivities || []) as FavoriteActivity[]
          });
        } else {
          setPersonality({
            traits: [],
            favoriteActivities: []
          });
        }
        
        // Load interests
        if (initialData.interests) {
          setInterests(initialData.interests);
        } else {
          setInterests([]);
        }
        
        // Load sensitivities
        if (initialData.sensitivities) {
          setSensitivities({
            fearLevel: initialData.sensitivities.fearLevel,
            commonFears: (initialData.sensitivities.commonFears || []) as CommonFear[],
            avoidTopics: (initialData.sensitivities.avoidTopics || []) as AvoidTopic[]
          });
        } else {
          setSensitivities({
            fearLevel: undefined,
            commonFears: [],
            avoidTopics: []
          });
        }
        
        // Load family cast
        if (initialData.familyCast) {
          setFamilyCast(initialData.familyCast);
        } else {
          setFamilyCast({});
        }

        // Load turnaround sheet URL if available
        setTurnaroundSheetUrl(initialData.turnaroundSheet?.url || undefined);
        
        // Skip to step 2 if editing and has description/appearance
        if (childId && (initialData.appearanceTraits || initialData.personality)) {
          setCurrentStep(2);
        }
      } else {
        // Reset all fields for new child
        setName('');
        setBirthDate(new Date());
        setGender(undefined);
        setLanguages([]);
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
        setPersonality({
          traits: [],
          favoriteActivities: []
        });
        setInterests([]);
        setSensitivities({
          fearLevel: undefined,
          commonFears: [],
          avoidTopics: []
        });
        setFamilyCast({});
        setTurnaroundSheetUrl(undefined);
      }
      setErrors({});
    }
  }, [visible, initialData, childId]);

  const toggleLanguage = (lang: string) => {
    if (languages.includes(lang)) {
      setLanguages(languages.filter(l => l !== lang));
    } else {
      if (languages.length < 3) {
        setLanguages([...languages, lang]);
      }
    }
  };

  // Handler for Step 1 "Continue" button
  const handleContinue = () => {
    // Basic validation
    if (!name.trim()) {
      Alert.alert(t('error') || 'Error', t('child_form.name_required') || 'Name is required');
      return;
    }
    if (!birthDate) {
      Alert.alert(t('error') || 'Error', t('child_form.birth_date_required') || 'Birth date is required');
      return;
    }
    if (languages.length === 0) {
      Alert.alert(t('error') || 'Error', t('child_form.languages_required') || 'At least one language is required');
      return;
    }

    // Check for uploading photos
    const hasUploadingPhotos = photos.some(photo => photo.isUploading);
    if (hasUploadingPhotos) {
      Alert.alert(
        t('child_form.upload_in_progress') || 'Upload in progress',
        t('child_form.wait_for_upload') || 'Please wait for photo upload to complete'
      );
      return;
    }

    // Move to step 2
    setCurrentStep(2);
  };

  // Handler for "Generate Description" button on Step 2
  const handleAnalyzePhotos = async () => {
    const uploadedPhotos = photos
      .filter(p => !p.isUploading && isServerAssetUrl(p.url))
      .map(p => p.url!);

    if (uploadedPhotos.length === 0) return;

    try {
      // Get user's language
      let userLanguage = i18n.language;
      if (!userLanguage || userLanguage === 'en-US') {
        const savedLanguage = await storage.getLanguage();
        userLanguage = savedLanguage || 'uk';
      }

      const result = await analyzeChild.mutateAsync({
        photos: uploadedPhotos,
        language: userLanguage,
      });

      // Populate description and remember analysis language
      setDescription(result.description || '');
      setDescriptionLanguage(userLanguage);

      // Populate appearance fields if present
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
    } catch (error) {
      console.error('[ChildFormModal] Photo analysis failed:', error);
      Alert.alert(
        t('child_form.analysis_failed_title') || 'Analysis Failed',
        t('child_form.analysis_failed_message') || 'Could not analyze photos. You can fill in details manually.'
      );
    }
  };

  // onDateChange not needed anymore - handled inline

  const handleSubmit = async () => {
    try {
      // Prepare appearance traits
      const appearanceData: any = {};
      if (appearance.hairColor) appearanceData.hairColor = appearance.hairColor;
      if (appearance.hairLength) appearanceData.hairLength = appearance.hairLength;
      if (appearance.hairStyle) appearanceData.hairStyle = appearance.hairStyle;
      if (appearance.eyeColor) appearanceData.eyeColor = appearance.eyeColor;
      if (appearance.skinTone) appearanceData.skinTone = appearance.skinTone;
      if (appearance.distinctiveFeatures.length > 0) {
        appearanceData.distinctiveFeatures = appearance.distinctiveFeatures;
      }

      // Prepare personality
      const personalityData = (personality.traits.length > 0 || personality.favoriteActivities.length > 0)
        ? personality
        : undefined;

      // Prepare sensitivities
      const sensitivitiesData = (sensitivities.fearLevel || sensitivities.commonFears.length > 0 || sensitivities.avoidTopics.length > 0)
        ? sensitivities
        : undefined;

      // Check if any photos are still uploading
      const hasUploadingPhotos = photos.some(photo => photo.isUploading);
      if (hasUploadingPhotos) {
        Alert.alert(
          t('child_form.upload_in_progress') || 'Завантаження',
          t('child_form.wait_for_upload') || 'Будь ласка, зачекайте поки завантажаться всі фото'
        );
        return;
      }

      // Filter only uploaded photos with valid URLs (exclude blob/file URIs)
      const uploadedPhotos = photos
        .filter(photo => 
          !photo.isUploading && 
          isServerAssetUrl(photo.url)
        )
        .map(({ url, uploadedAt }) => ({ url, uploadedAt })); // Strip UI-only fields

      // Prepare data
      const data = {
        name,
        birthDate,
        gender,
        languages,
        referencePhotos: uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
        aiGeneratedDescription: description || undefined,
        descriptionLanguage: descriptionLanguage || undefined,
        appearanceTraits: Object.keys(appearanceData).length > 0 ? appearanceData : undefined,
        personality: personalityData,
        interests: interests.length > 0 ? interests : undefined,
        sensitivities: sensitivitiesData,
        familyCast: Object.keys(familyCast).length > 0 ? familyCast : undefined
      };

      // Validate with zod
      const result = CreateChildProfileSchema.safeParse(data);
      
      if (!result.success) {
        console.error('Child validation failed:', result.error.issues);
        const newErrors: Record<string, string> = {};
        result.error.issues.forEach((issue) => {
          const path = issue.path.join('.');
          newErrors[path] = issue.message;
        });
        setErrors(newErrors);
        Alert.alert(
          t('child_form.validation_error') || 'Помилка валідації',
          t('child_form.validation_error_message') || 'Будь ласка, перевірте введені дані'
        );
        return;
      }

      // Submit
      if (childId) {
        await updateChild.mutateAsync({ id: childId, data: result.data });
      } else {
        await createChild.mutateAsync(result.data);
      }

      // Close modal on success
      onClose();
    } catch (error) {
      console.error('Failed to save child:', error);
      setErrors({ submit: 'Failed to save. Please try again.' });
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                {childId ? t('child_form.title_edit') : t('child_form.title_create')}
              </Text>
              <Text style={styles.stepIndicator}>
                {t('child_form.step_indicator', { current: currentStep, total: 2 })}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* STEP 1: Basic Information + Photos */}
            {currentStep === 1 && (
              <>
                {/* Name */}
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

            {/* Birth Date */}
            <View style={styles.field}>
              <Text style={styles.label}>{t('child_form.birth_date_label')}</Text>
              
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  className={errors.birthDate ? 'input-error' : ''}
                  defaultValue={birthDate && !isNaN(birthDate.getTime()) 
                    ? birthDate.toISOString().split('T')[0] 
                    : ''
                  }
                  onBlur={(e) => {
                    const newDate = new Date((e.target as HTMLInputElement).value);
                    if (!isNaN(newDate.getTime())) {
                      setBirthDate(newDate);
                    }
                  }}
                  max={new Date().toISOString().split('T')[0]}
                  style={{
                    ...styles.input,
                    ...(errors.birthDate ? styles.inputError : {})
                  }}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.input, styles.dateInput]}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={styles.dateText}>
                      {birthDate.toLocaleDateString()}
                    </Text>
                    <Ionicons name="calendar-outline" size={20} color={theme.colors.text.secondary} />
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={birthDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(_event, selectedDate) => {
                        setShowDatePicker(Platform.OS === 'ios');
                        if (selectedDate) {
                          setBirthDate(selectedDate);
                        }
                      }}
                      maximumDate={new Date()}
                    />
                  )}
                </>
              )}
              
              {errors.birthDate && <Text style={styles.errorText}>{errors.birthDate}</Text>}
            </View>

            {/* Gender */}
            <View style={styles.field}>
              <Text style={styles.label}>{t('child_form.gender_label')}</Text>
              <View style={styles.genderButtons}>
                {(['girl', 'boy', 'other'] as const).map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.genderButton,
                      gender === g && styles.genderButtonSelected
                    ]}
                    onPress={() => setGender(gender === g ? undefined : g)}
                  >
                    <Text style={[
                      styles.genderButtonText,
                      gender === g && styles.genderButtonTextSelected
                    ]}>
                      {t(`child_form.gender_${g}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Languages */}
            <View style={styles.field}>
              <Text style={styles.label}>{t('child_form.languages_label')}</Text>
              <View style={styles.languageButtons}>
                {LOCALE_IDS.map((lang) => (
                  <TouchableOpacity
                    key={lang}
                    style={[
                      styles.languageChip,
                      languages.includes(lang) && styles.languageChipSelected,
                      languages.length >= 3 && !languages.includes(lang) && styles.languageChipDisabled
                    ]}
                    onPress={() => toggleLanguage(lang)}
                    disabled={languages.length >= 3 && !languages.includes(lang)}
                  >
                    <Text style={[
                      styles.languageChipText,
                      languages.includes(lang) && styles.languageChipTextSelected
                    ]}>
                      {lang.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {errors.languages && <Text style={styles.errorText}>{errors.languages}</Text>}
            </View>

            {/* Photos Section - NO ACCORDION */}
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

        {/* STEP 2: Appearance, Personality, Interests, Sensitivities */}
        {currentStep === 2 && (
          <>
            {/* AI-Generated Description */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t('child_form.description')}
              </Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('child_form.description_placeholder')}
                placeholderTextColor={theme.colors.text.disabled}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              {description && (
                <Text style={styles.hint}>
                  {t('child_form.generated_by_ai_hint')}
                </Text>
              )}
              {/* Generate / Regenerate Description button */}
              {photos.some(p => !p.isUploading && isServerAssetUrl(p.url)) ? (
                analyzeChild.isPending ? (
                  <View style={styles.turnaroundGenerating}>
                    <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                    <Text style={styles.turnaroundGeneratingText}>
                      {t('child_form.analyzing_photos')}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.turnaroundButton,
                      description ? styles.turnaroundButtonSecondary : undefined,
                    ]}
                    onPress={handleAnalyzePhotos}
                  >
                    <Ionicons
                      name={description ? 'refresh-outline' : 'sparkles-outline'}
                      size={18}
                      color={description ? theme.colors.interactive.primary : theme.colors.text.inverse}
                    />
                    <Text
                      style={[
                        styles.turnaroundButtonText,
                        description ? styles.turnaroundButtonTextSecondary : undefined,
                      ]}
                    >
                      {description
                        ? t('child_form.regenerate_description')
                        : t('child_form.generate_description')}
                    </Text>
                  </TouchableOpacity>
                )
              ) : (
                <Text style={styles.hint}>
                  {t('child_form.description_upload_photos_first')}
                </Text>
              )}
            </View>

            {/* Turnaround Sheet */}
            <View style={styles.field}>
              <Text style={styles.label}>{t('child_form.turnaround_sheet') || '3D Model Sheet'}</Text>
              {turnaroundSheetUrl && (
                <View style={styles.turnaroundContainer}>
                  <Image
                    source={{ uri: formatAssetUrl(turnaroundSheetUrl) || turnaroundSheetUrl }}
                    style={styles.turnaroundImage}
                    resizeMode="contain"
                  />
                </View>
              )}
              {childId ? (
                generateTurnaround.isPending ? (
                  <View style={styles.turnaroundGenerating}>
                    <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                    <Text style={styles.turnaroundGeneratingText}>
                      {t('child_form.generating_turnaround') || 'Generating 3D model...'}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.turnaroundButton,
                      turnaroundSheetUrl && styles.turnaroundButtonSecondary,
                    ]}
                    onPress={async () => {
                      try {
                        const result = await generateTurnaround.mutateAsync({
                          childId,
                          description: description || undefined,
                        });
                        setTurnaroundSheetUrl(result.url);
                      } catch (error) {
                        Alert.alert(
                          t('error') || 'Error',
                          t('child_form.turnaround_error') || 'Failed to generate model sheet',
                        );
                      }
                    }}
                  >
                    <Ionicons
                      name={turnaroundSheetUrl ? 'refresh-outline' : 'image-outline'}
                      size={18}
                      color={turnaroundSheetUrl ? theme.colors.interactive.primary : theme.colors.text.inverse}
                    />
                    <Text
                      style={[
                        styles.turnaroundButtonText,
                        turnaroundSheetUrl && styles.turnaroundButtonTextSecondary,
                      ]}
                    >
                      {turnaroundSheetUrl
                        ? (t('child_form.regenerate_turnaround') || 'Regenerate 3D Model')
                        : (t('child_form.generate_turnaround') || 'Generate 3D Model')}
                    </Text>
                  </TouchableOpacity>
                )
              ) : (
                <Text style={styles.hint}>
                  {t('child_form.turnaround_save_first') || 'Save the profile first to generate a 3D model sheet'}
                </Text>
              )}
            </View>

            {/* Appearance Section */}
            <ExpandableCard title={t('child_form.appearance_title')} defaultExpanded={false}>
              <ChipSelector
                label={t('character_form.hair_color')}
                options={HAIR_COLORS}
                selected={appearance.hairColor || ''}
                onSelect={(val) => setAppearance({...appearance, hairColor: val as HairColor})}
                translationPrefix="character_form.hair_colors"
                getTranslation={t}
              />

              <ChipSelector
                label={t('character_form.hair_length')}
                options={HAIR_LENGTHS}
                selected={appearance.hairLength || ''}
                onSelect={(val) => setAppearance({...appearance, hairLength: val as HairLength})}
                translationPrefix="character_form.hair_lengths"
                getTranslation={t}
              />

              <ChipSelector
                label={t('character_form.hair_style')}
                options={HAIR_STYLES}
                selected={appearance.hairStyle || ''}
                onSelect={(val) => setAppearance({...appearance, hairStyle: val as HairStyle})}
                translationPrefix="character_form.hair_styles"
                getTranslation={t}
              />

              <ChipSelector
                label={t('character_form.eye_color')}
                options={EYE_COLORS}
                selected={appearance.eyeColor || ''}
                onSelect={(val) => setAppearance({...appearance, eyeColor: val as EyeColor})}
                translationPrefix="character_form.eye_colors"
                getTranslation={t}
              />

              <ChipSelector
                label={t('character_form.skin_tone')}
                options={SKIN_TONES}
                selected={appearance.skinTone || ''}
                onSelect={(val) => setAppearance({...appearance, skinTone: val as SkinTone})}
                translationPrefix="character_form.skin_tones"
                getTranslation={t}
              />

              <ChipSelector
                label={t('character_form.distinctive_features')}
                options={DISTINCTIVE_FEATURES}
                selected={appearance.distinctiveFeatures}
                onSelect={(val) => setAppearance({...appearance, distinctiveFeatures: val as DistinctiveFeature[]})}
                multiple
                max={3}
                translationPrefix="child_form.features"
                getTranslation={t}
              />
            </ExpandableCard>

            {/* Personality Section */}
            <ExpandableCard title={t('child_form.personality_title')} defaultExpanded={false}>
              <ChipSelector
                label={t('character_form.personality_traits')}
                options={PERSONALITY_TRAITS}
                selected={personality.traits}
                onSelect={(val) => setPersonality({...personality, traits: val as PersonalityTrait[]})}
                multiple
                max={5}
                translationPrefix="child_form.traits"
                getTranslation={t}
              />

              <ChipSelector
                label={t('character_form.favorite_activities')}
                options={FAVORITE_ACTIVITIES}
                selected={personality.favoriteActivities}
                onSelect={(val) => setPersonality({...personality, favoriteActivities: val as FavoriteActivity[]})}
                multiple
                max={5}
                translationPrefix="child_form.activities"
                getTranslation={t}
              />
            </ExpandableCard>

            {/* Interests Section */}
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

            {/* Sensitivities Section */}
            <ExpandableCard title={t('child_form.sensitivities_title')} defaultExpanded={false}>
              {/* Fear Level */}
              <View style={styles.field}>
                <Text style={styles.label}>{t('child_form.fear_level_label')}</Text>
                <View style={styles.genderButtons}>
                  {(['none', 'low', 'medium', 'high'] as const).map((level) => (
                    <TouchableOpacity
                      key={level}
                      style={[
                        styles.genderButton,
                        sensitivities.fearLevel === level && styles.genderButtonSelected
                      ]}
                      onPress={() => setSensitivities({...sensitivities, fearLevel: level})}
                    >
                      <Text style={[
                        styles.genderButtonText,
                        sensitivities.fearLevel === level && styles.genderButtonTextSelected
                      ]}>
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
                onSelect={(val) => setSensitivities({...sensitivities, commonFears: val as CommonFear[]})}
                multiple
                max={5}
                translationPrefix="child_form.fears"
                getTranslation={t}
              />

              <ChipSelector
                label={t('child_form.avoid_topics_label')}
                options={AVOID_TOPICS}
                selected={sensitivities.avoidTopics}
                onSelect={(val) => setSensitivities({...sensitivities, avoidTopics: val as AvoidTopic[]})}
                multiple
                max={5}
                translationPrefix="child_form.avoid"
                getTranslation={t}
              />
            </ExpandableCard>

            {/* Submit error */}
            {errors.submit && (
              <Text style={[styles.errorText, styles.submitError]}>{errors.submit}</Text>
            )}
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {currentStep === 1 ? (
          <>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>{t('child_form.cancel_button')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleContinue}
              disabled={!name.trim() || photos.some(p => p.isUploading)}
            >
              <Text style={styles.saveButtonText}>
                {t('child_form.continue_button') || 'Continue'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => setCurrentStep(1)}
            >
              <Text style={styles.cancelButtonText}>{t('child_form.back') || 'Back'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSubmit}
              disabled={createChild.isPending || updateChild.isPending}
            >
              <Text style={styles.saveButtonText}>
                {(createChild.isPending || updateChild.isPending) 
                  ? t('child_form.saving') 
                  : t('child_form.save_button')}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[4],
  },
  modal: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.lg,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
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
  field: {
    marginBottom: theme.spacing[5],
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
  languageButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  languageChip: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.secondary,
  },
  languageChipSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  languageChipDisabled: {
    opacity: 0.4,
  },
  languageChipText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  languageChipTextSelected: {
    color: theme.colors.interactive.primary,
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
  button: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
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
  saveButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  saveButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
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
  turnaroundContainer: {
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.secondary,
    marginBottom: theme.spacing[3],
  },
  turnaroundImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  turnaroundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.interactive.primary,
  },
  turnaroundButtonSecondary: {
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
  },
  turnaroundButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  turnaroundButtonTextSecondary: {
    color: theme.colors.interactive.primary,
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
