import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { useCreateCharacter, useUpdateCharacter, useAnalyzeCharacter } from '@/api/characters';
import { UploadPhotoResult } from '@/utils/uploadPhoto';
import { storage } from '@/utils/storage';
import { 
  CreateCharacterSchema,
  ReferencePhoto,
  CHARACTER_TYPES as CHAR_TYPES,
  CharacterType,
  isPetType,
  isHumanType,
  isImaginaryType,
  FUR_COLORS,
  FUR_PATTERNS,
  FUR_LENGTHS,
  PET_SIZES,
  PET_EYE_COLORS,
  PET_DISTINCTIVE_FEATURES,
  PET_PERSONALITY_TRAITS,
  PET_ACTIVITIES,
  AGE_RANGES,
  HUMAN_HAIR_COLORS,
  HUMAN_HAIR_LENGTHS,
  HUMAN_HAIR_STYLES,
  EYE_COLORS,
  SKIN_TONES,
  HEIGHTS,
  BUILDS,
  CLOTHING_STYLES,
  HUMAN_DISTINCTIVE_FEATURES,
  IMAGINARY_SPECIES_SUGGESTIONS,
  SIZE_SUGGESTIONS,
  MAGICAL_FEATURES_SUGGESTIONS,
  FurColor,
  FurPattern,
  FurLength,
  PetSize,
  PetEyeColor,
  PetDistinctiveFeature,
  PetPersonalityTrait,
  PetActivity,
  AgeRange,
  HumanHairColor,
  HumanHairLength,
  HumanHairStyle,
  EyeColor,
  SkinTone,
  Height,
  Build,
  ClothingStyle,
  HumanDistinctiveFeature
} from '@kazka/shared';
import { ChipSelector } from './form/ChipSelector';
import { TagsInput } from './form/TagsInput';
import { PhotoUploadGrid } from './form/PhotoUploadGrid';
import { ExpandableCard } from './ExpandableCard';

interface Props {
  visible: boolean;
  onClose: () => void;
  characterId?: string;
  initialData?: {
    name: string;
    type: CharacterType;
    description?: string;
    referencePhotos?: ReferencePhoto[];
    appearanceTraits?: any;
    personality?: any;
  };
}

const CHARACTER_TYPES = [
  { value: 'pet' as CharacterType, icon: '🐾', key: 'pet' },
  { value: 'family_member' as CharacterType, icon: '👨‍👩‍👧', key: 'family_member' },
  { value: 'friend' as CharacterType, icon: '👫', key: 'friend' },
  { value: 'neighbor' as CharacterType, icon: '🏘️', key: 'neighbor' },
  { value: 'imaginary_friend' as CharacterType, icon: '🦄', key: 'imaginary_friend' },
] as const;

export function CharacterFormModal({ visible, onClose, characterId, initialData }: Props) {
  const { t, i18n } = useTranslation();
  const createCharacter = useCreateCharacter();
  const updateCharacter = useUpdateCharacter();
  const analyzeCharacter = useAnalyzeCharacter();
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Basic fields
  const [name, setName] = useState('');
  const [type, setType] = useState<CharacterType>('pet');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Photos
  const [photos, setPhotos] = useState<UploadPhotoResult[]>([]);

  // Pet appearance
  const [petAppearance, setPetAppearance] = useState({
    breed: undefined as string | undefined,
    furColor: undefined as FurColor | undefined,
    furPattern: undefined as FurPattern | undefined,
    furLength: undefined as FurLength | undefined,
    size: undefined as PetSize | undefined,
    eyeColor: undefined as PetEyeColor | undefined,
    distinctiveFeatures: [] as PetDistinctiveFeature[]
  });

  // Human appearance
  const [humanAppearance, setHumanAppearance] = useState({
    ageRange: undefined as AgeRange | undefined,
    hairColor: undefined as HumanHairColor | undefined,
    hairLength: undefined as HumanHairLength | undefined,
    hairStyle: undefined as HumanHairStyle | undefined,
    eyeColor: undefined as EyeColor | undefined,
    skinTone: undefined as SkinTone | undefined,
    height: undefined as Height | undefined,
    build: undefined as Build | undefined,
    clothingStyle: undefined as ClothingStyle | undefined,
    distinctiveFeatures: [] as HumanDistinctiveFeature[]
  });

  // Imaginary appearance
  const [imaginaryAppearance, setImaginaryAppearance] = useState({
    species: '',
    primaryColor: '',
    secondaryColor: '',
    size: '',
    magicalFeatures: [] as string[],
    customDescription: ''
  });

  // Personality (universal structure)
  const [personality, setPersonality] = useState({
    traits: [] as (PetPersonalityTrait | string)[],
    favoriteActivities: [] as (PetActivity | string)[]
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (visible) {
      setCurrentStep(1);
      setIsAnalyzing(false);
      if (initialData) {
        setName(initialData.name);
        setType(initialData.type);
        setDescription(initialData.description || '');
        
        // Load existing photos
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
        
        // Load appearance traits based on character type
        if (initialData.appearanceTraits) {
          if (isPetType(initialData.type)) {
            setPetAppearance({
              breed: initialData.appearanceTraits.breed || undefined,
              furColor: initialData.appearanceTraits.furColor as FurColor | undefined,
              furPattern: initialData.appearanceTraits.furPattern as FurPattern | undefined,
              furLength: initialData.appearanceTraits.furLength as FurLength | undefined,
              size: initialData.appearanceTraits.size as PetSize | undefined,
              eyeColor: initialData.appearanceTraits.eyeColor as PetEyeColor | undefined,
              distinctiveFeatures: (initialData.appearanceTraits.distinctiveFeatures || []) as PetDistinctiveFeature[]
            });
          } else if (isHumanType(initialData.type)) {
            setHumanAppearance({
              ageRange: initialData.appearanceTraits.ageRange as AgeRange | undefined,
              hairColor: initialData.appearanceTraits.hairColor as HumanHairColor | undefined,
              hairLength: initialData.appearanceTraits.hairLength as HumanHairLength | undefined,
              hairStyle: initialData.appearanceTraits.hairStyle as HumanHairStyle | undefined,
              eyeColor: initialData.appearanceTraits.eyeColor as EyeColor | undefined,
              skinTone: initialData.appearanceTraits.skinTone as SkinTone | undefined,
              height: initialData.appearanceTraits.height as Height | undefined,
              build: initialData.appearanceTraits.build as Build | undefined,
              clothingStyle: initialData.appearanceTraits.clothingStyle as ClothingStyle | undefined,
              distinctiveFeatures: (initialData.appearanceTraits.distinctiveFeatures || []) as HumanDistinctiveFeature[]
            });
          } else if (isImaginaryType(initialData.type)) {
            setImaginaryAppearance({
              species: initialData.appearanceTraits.species || '',
              primaryColor: initialData.appearanceTraits.primaryColor || '',
              secondaryColor: initialData.appearanceTraits.secondaryColor || '',
              size: initialData.appearanceTraits.size || '',
              magicalFeatures: initialData.appearanceTraits.magicalFeatures || [],
              customDescription: initialData.appearanceTraits.customDescription || ''
            });
          }
        } else {
          // Reset appearance if no data
          setPetAppearance({
            breed: undefined,
            furColor: undefined,
            furPattern: undefined,
            furLength: undefined,
            size: undefined,
            eyeColor: undefined,
            distinctiveFeatures: []
          });
          setHumanAppearance({
            ageRange: undefined,
            hairColor: undefined,
            hairLength: undefined,
            hairStyle: undefined,
            eyeColor: undefined,
            skinTone: undefined,
            height: undefined,
            build: undefined,
            clothingStyle: undefined,
            distinctiveFeatures: []
          });
          setImaginaryAppearance({
            species: '',
            primaryColor: '',
            secondaryColor: '',
            size: '',
            magicalFeatures: [],
            customDescription: ''
          });
        }
        
        // Load personality
        if (initialData.personality) {
          setPersonality({
            traits: initialData.personality.traits || [],
            favoriteActivities: initialData.personality.favoriteActivities || []
          });
        } else {
          setPersonality({
            traits: [],
            favoriteActivities: []
          });
        }
        
        // Skip to step 2 if editing and has description
        if (characterId && initialData.description) {
          setCurrentStep(2);
        }
      } else {
        setName('');
        setType('pet');
        setDescription('');
        setPhotos([]);
        setPetAppearance({
          breed: undefined,
          furColor: undefined,
          furPattern: undefined,
          furLength: undefined,
          size: undefined,
          eyeColor: undefined,
          distinctiveFeatures: []
        });
        setHumanAppearance({
          ageRange: undefined,
          hairColor: undefined,
          hairLength: undefined,
          hairStyle: undefined,
          eyeColor: undefined,
          skinTone: undefined,
          height: undefined,
          build: undefined,
          clothingStyle: undefined,
          distinctiveFeatures: []
        });
        setImaginaryAppearance({
          species: '',
          primaryColor: '',
          secondaryColor: '',
          size: '',
          magicalFeatures: [],
          customDescription: ''
        });
        setPersonality({
          traits: [],
          favoriteActivities: []
        });
      }
      setErrors({});
    }
  }, [visible, initialData, characterId]);

  // Helper function to map character type to analysis type
  function getAnalysisCharacterType(type: CharacterType): 'person' | 'animal' | 'imaginary' {
    if (isPetType(type)) return 'animal';
    if (isImaginaryType(type)) return 'imaginary';
    return 'person';
  }

  // Handler for Step 1 "Continue" button
  const handleContinue = async () => {
    // Basic validation
    if (!name.trim()) {
      Alert.alert(t('error') || 'Error', t('character_form.name_required'));
      return;
    }

    // Check for uploading photos
    const hasUploadingPhotos = photos.some(photo => photo.isUploading);
    if (hasUploadingPhotos) {
      Alert.alert(
        t('character_form.upload_in_progress') || 'Upload in progress',
        t('character_form.wait_for_upload') || 'Please wait for photo upload to complete'
      );
      return;
    }

    // For imaginary characters, skip analysis
    if (isImaginaryType(type)) {
      setCurrentStep(2);
      return;
    }

    // Check if we have photos to analyze
    const uploadedPhotos = photos
      .filter(p => !p.isUploading && p.url && p.url.startsWith('http'))
      .map(p => p.url);

    if (uploadedPhotos.length > 0) {
      // Perform analysis
      setIsAnalyzing(true);
      
      try {
        const characterType = getAnalysisCharacterType(type);
        
        // Get user's language - try i18n first, then storage, then fallback to 'uk'
        let userLanguage = i18n.language;
        if (!userLanguage || userLanguage === 'en-US') {
          const savedLanguage = await storage.getLanguage();
          userLanguage = savedLanguage || 'uk';
        }
        
        console.log('[CharacterFormModal] Analyzing with language:', userLanguage);
        
        const analysis = await analyzeCharacter.mutateAsync({
          photos: uploadedPhotos,
          characterType,
          language: userLanguage // Pass user's UI language
        });

        // Populate description
        setDescription(analysis.description || '');

        // Populate appearance fields based on type
        if (analysis.petAppearance && isPetType(type)) {
          setPetAppearance({
            breed: analysis.petAppearance.breed || undefined,
            furColor: analysis.petAppearance.furColor as FurColor || undefined,
            furPattern: analysis.petAppearance.furPattern as FurPattern || undefined,
            furLength: analysis.petAppearance.furLength as FurLength || undefined,
            size: analysis.petAppearance.size as PetSize || undefined,
            eyeColor: analysis.petAppearance.eyeColor as PetEyeColor || undefined,
            distinctiveFeatures: (analysis.petAppearance.distinctiveFeatures || []) as PetDistinctiveFeature[]
          });
        } else if (analysis.humanAppearance && isHumanType(type)) {
          setHumanAppearance({
            ageRange: analysis.humanAppearance.ageRange as AgeRange || undefined,
            hairColor: analysis.humanAppearance.hairColor as HumanHairColor || undefined,
            hairLength: analysis.humanAppearance.hairLength as HumanHairLength || undefined,
            hairStyle: analysis.humanAppearance.hairStyle as HumanHairStyle || undefined,
            eyeColor: analysis.humanAppearance.eyeColor as EyeColor || undefined,
            skinTone: analysis.humanAppearance.skinTone as SkinTone || undefined,
            height: analysis.humanAppearance.height as Height || undefined,
            build: analysis.humanAppearance.build as Build || undefined,
            clothingStyle: analysis.humanAppearance.clothingStyle as ClothingStyle || undefined,
            distinctiveFeatures: (analysis.humanAppearance.distinctiveFeatures || []) as HumanDistinctiveFeature[]
          });
        }

      } catch (error) {
        console.error('Photo analysis failed:', error);
        // Don't block progression - user can fill manually
        Alert.alert(
          t('character_form.analysis_failed_title'),
          t('character_form.analysis_failed_message')
        );
      } finally {
        setIsAnalyzing(false);
      }
    }

    // Move to step 2
    setCurrentStep(2);
  };

  const handleSubmit = async () => {
    try {
      // Prepare appearance traits based on type
      let appearanceTraits;
      if (isPetType(type)) {
        // Only include defined fields
        const petData: any = {};
        if (petAppearance.breed) petData.breed = petAppearance.breed;
        if (petAppearance.furColor) petData.furColor = petAppearance.furColor;
        if (petAppearance.furPattern) petData.furPattern = petAppearance.furPattern;
        if (petAppearance.furLength) petData.furLength = petAppearance.furLength;
        if (petAppearance.size) petData.size = petAppearance.size;
        if (petAppearance.eyeColor) petData.eyeColor = petAppearance.eyeColor;
        if (petAppearance.distinctiveFeatures.length > 0) {
          petData.distinctiveFeatures = petAppearance.distinctiveFeatures;
        }
        appearanceTraits = Object.keys(petData).length > 0 ? petData : undefined;
      } else if (isHumanType(type)) {
        const humanData: any = {};
        if (humanAppearance.ageRange) humanData.ageRange = humanAppearance.ageRange;
        if (humanAppearance.hairColor) humanData.hairColor = humanAppearance.hairColor;
        if (humanAppearance.hairLength) humanData.hairLength = humanAppearance.hairLength;
        if (humanAppearance.hairStyle) humanData.hairStyle = humanAppearance.hairStyle;
        if (humanAppearance.eyeColor) humanData.eyeColor = humanAppearance.eyeColor;
        if (humanAppearance.skinTone) humanData.skinTone = humanAppearance.skinTone;
        if (humanAppearance.height) humanData.height = humanAppearance.height;
        if (humanAppearance.build) humanData.build = humanAppearance.build;
        if (humanAppearance.clothingStyle) humanData.clothingStyle = humanAppearance.clothingStyle;
        if (humanAppearance.distinctiveFeatures.length > 0) {
          humanData.distinctiveFeatures = humanAppearance.distinctiveFeatures;
        }
        appearanceTraits = Object.keys(humanData).length > 0 ? humanData : undefined;
      } else if (isImaginaryType(type)) {
        const imagData: any = {};
        if (imaginaryAppearance.species) imagData.species = imaginaryAppearance.species;
        if (imaginaryAppearance.primaryColor) imagData.primaryColor = imaginaryAppearance.primaryColor;
        if (imaginaryAppearance.secondaryColor) imagData.secondaryColor = imaginaryAppearance.secondaryColor;
        if (imaginaryAppearance.size) imagData.size = imaginaryAppearance.size;
        if (imaginaryAppearance.magicalFeatures.length > 0) {
          imagData.magicalFeatures = imaginaryAppearance.magicalFeatures;
        }
        if (imaginaryAppearance.customDescription) {
          imagData.customDescription = imaginaryAppearance.customDescription;
        }
        appearanceTraits = Object.keys(imagData).length > 0 ? imagData : undefined;
      }

      // Prepare personality
      const personalityData = (personality.traits.length > 0 || personality.favoriteActivities.length > 0)
        ? personality
        : undefined;

      // Check if any photos are still uploading
      const hasUploadingPhotos = photos.some(photo => photo.isUploading);
      if (hasUploadingPhotos) {
        Alert.alert(
          t('character_form.upload_in_progress') || 'Завантаження',
          t('character_form.wait_for_upload') || 'Будь ласка, зачекайте поки завантажаться всі фото'
        );
        return;
      }

      // Filter only uploaded photos with valid URLs (exclude blob/file URIs)
      const uploadedPhotos = photos
        .filter(photo => 
          !photo.isUploading && 
          photo.url && 
          photo.url.startsWith('http')
        )
        .map(({ url, uploadedAt }) => ({ url, uploadedAt })); // Strip UI-only fields

      // Prepare data
      const data = {
        name,
        type,
        description: description || undefined,
        referencePhotos: uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
        appearanceTraits,
        personality: personalityData
      };

      // Validate with zod
      const result = CreateCharacterSchema.safeParse(data);
      
      if (!result.success) {
        console.error('Character validation failed:', result.error.issues);
        const newErrors: Record<string, string> = {};
        result.error.issues.forEach((issue) => {
          const path = issue.path.join('.');
          newErrors[path] = issue.message;
        });
        setErrors(newErrors);
        Alert.alert(
          t('character_form.validation_error') || 'Помилка валідації',
          t('character_form.validation_error_message') || 'Будь ласка, перевірте введені дані'
        );
        return;
      }

      // Submit
      if (characterId) {
        await updateCharacter.mutateAsync({ id: characterId, data: result.data });
      } else {
        await createCharacter.mutateAsync(result.data);
      }

      // Close modal on success
      onClose();
    } catch (error) {
      console.error('Failed to save character:', error);
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
                {characterId ? t('character_form.title_edit') : t('character_form.title_create')}
              </Text>
              <Text style={styles.stepIndicator}>
                {t('character_form.step_indicator', { current: currentStep, total: 2 })}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text.primary} />
            </TouchableOpacity>
          </View>

          {/* Loading overlay for analysis */}
          {isAnalyzing && (
            <View style={styles.analyzingOverlay}>
              <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
              <Text style={styles.analyzingText}>
                {t('character_form.analyzing_photos')}
              </Text>
            </View>
          )}

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* STEP 1: Basic Info */}
            {currentStep === 1 && (
              <>
                {/* Name */}
                <View style={styles.field}>
                  <Text style={styles.label}>{t('character_form.name_label')}</Text>
                  <TextInput
                    style={[styles.input, errors.name && styles.inputError]}
                    value={name}
                    onChangeText={setName}
                    placeholder={t('character_form.name_placeholder')}
                    placeholderTextColor={theme.colors.text.disabled}
                  />
                  {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
                </View>

                {/* Type */}
                <View style={styles.field}>
                  <Text style={styles.label}>{t('character_form.type_label')}</Text>
                  <View style={styles.typeGrid}>
                    {CHARACTER_TYPES.map((charType) => (
                      <TouchableOpacity
                        key={charType.value}
                        style={[
                          styles.typeButton,
                          type === charType.value && styles.typeButtonSelected
                        ]}
                        onPress={() => setType(charType.value)}
                      >
                        <Text style={styles.typeIcon}>{charType.icon}</Text>
                        <Text style={[
                          styles.typeText,
                          type === charType.value && styles.typeTextSelected
                        ]}>
                          {t(`characters.character_types.${charType.key}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {errors.type && <Text style={styles.errorText}>{errors.type}</Text>}
                </View>

                {/* Photos - NO ACCORDION */}
                {!isImaginaryType(type) && (
                  <View style={styles.field}>
                    <Text style={styles.label}>{t('character_form.photos_title')}</Text>
                    <PhotoUploadGrid
                      photos={photos}
                      onPhotosChange={setPhotos}
                      maxPhotos={5}
                      photoType="character"
                    />
                  </View>
                )}
              </>
            )}

            {/* STEP 2: Details */}
            {currentStep === 2 && (
              <>
                {/* Back Button */}
                <TouchableOpacity 
                  onPress={() => setCurrentStep(1)} 
                  style={styles.backButton}
                >
                  <Ionicons name="arrow-back" size={20} color={theme.colors.interactive.primary} />
                  <Text style={styles.backButtonText}>{t('character_form.back')}</Text>
                </TouchableOpacity>

                {/* Description */}
                <View style={styles.field}>
                  <Text style={styles.label}>{t('character_form.description_label')}</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, errors.description && styles.inputError]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder={t('character_form.description_placeholder')}
                    placeholderTextColor={theme.colors.text.disabled}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  {description && (
                    <Text style={styles.hint}>
                      {t('character_form.ai_generated_hint')}
                    </Text>
                  )}
                  {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
                </View>

                {/* Appearance Section */}
                <ExpandableCard title={t('character_form.appearance_title')} defaultExpanded={true}>
                  {/* Pet Appearance */}
                  {isPetType(type) && (
                <View>
                  {/* Breed - free text input */}
                  <View style={styles.field}>
                    <Text style={styles.label}>{t('character_form.breed')}</Text>
                    <TextInput
                      style={styles.input}
                      value={petAppearance.breed || ''}
                      onChangeText={(val) => setPetAppearance({...petAppearance, breed: val || undefined})}
                      placeholder="e.g. Golden Retriever, Persian"
                      placeholderTextColor={theme.colors.text.disabled}
                    />
                  </View>

                  <ChipSelector
                    label={t('character_form.fur_color')}
                    options={FUR_COLORS}
                    selected={petAppearance.furColor || ''}
                    onSelect={(val) => setPetAppearance({...petAppearance, furColor: val as FurColor})}
                    translationPrefix="character_form.fur_colors"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.fur_pattern')}
                    options={FUR_PATTERNS}
                    selected={petAppearance.furPattern || ''}
                    onSelect={(val) => setPetAppearance({...petAppearance, furPattern: val as FurPattern})}
                    translationPrefix="character_form.fur_patterns"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.fur_length')}
                    options={FUR_LENGTHS}
                    selected={petAppearance.furLength || ''}
                    onSelect={(val) => setPetAppearance({...petAppearance, furLength: val as FurLength})}
                    translationPrefix="character_form.fur_lengths"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.size')}
                    options={PET_SIZES}
                    selected={petAppearance.size || ''}
                    onSelect={(val) => setPetAppearance({...petAppearance, size: val as PetSize})}
                    translationPrefix="character_form.sizes"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.eye_color')}
                    options={PET_EYE_COLORS}
                    selected={petAppearance.eyeColor || ''}
                    onSelect={(val) => setPetAppearance({...petAppearance, eyeColor: val as PetEyeColor})}
                    translationPrefix="character_form.eye_colors"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.distinctive_features')}
                    options={PET_DISTINCTIVE_FEATURES}
                    selected={petAppearance.distinctiveFeatures}
                    onSelect={(val) => setPetAppearance({...petAppearance, distinctiveFeatures: val as PetDistinctiveFeature[]})}
                    multiple
                    max={5}
                    translationPrefix="character_form.pet_features"
                    getTranslation={t}
                  />
                </View>
              )}

              {/* Human Appearance */}
              {isHumanType(type) && (
                <View>
                  <ChipSelector
                    label={t('character_form.age_range')}
                    options={AGE_RANGES}
                    selected={humanAppearance.ageRange || ''}
                    onSelect={(val) => setHumanAppearance({...humanAppearance, ageRange: val as AgeRange})}
                    translationPrefix="character_form.age_ranges"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.hair_color')}
                    options={HUMAN_HAIR_COLORS}
                    selected={humanAppearance.hairColor || ''}
                    onSelect={(val) => setHumanAppearance({...humanAppearance, hairColor: val as HumanHairColor})}
                    translationPrefix="character_form.hair_colors"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.hair_length')}
                    options={HUMAN_HAIR_LENGTHS}
                    selected={humanAppearance.hairLength || ''}
                    onSelect={(val) => setHumanAppearance({...humanAppearance, hairLength: val as HumanHairLength})}
                    translationPrefix="character_form.hair_lengths"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.hair_style')}
                    options={HUMAN_HAIR_STYLES}
                    selected={humanAppearance.hairStyle || ''}
                    onSelect={(val) => setHumanAppearance({...humanAppearance, hairStyle: val as HumanHairStyle})}
                    translationPrefix="character_form.hair_styles"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.eye_color')}
                    options={EYE_COLORS}
                    selected={humanAppearance.eyeColor || ''}
                    onSelect={(val) => setHumanAppearance({...humanAppearance, eyeColor: val as EyeColor})}
                    translationPrefix="character_form.eye_colors"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.skin_tone')}
                    options={SKIN_TONES}
                    selected={humanAppearance.skinTone || ''}
                    onSelect={(val) => setHumanAppearance({...humanAppearance, skinTone: val as SkinTone})}
                    translationPrefix="character_form.skin_tones"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.height')}
                    options={HEIGHTS}
                    selected={humanAppearance.height || ''}
                    onSelect={(val) => setHumanAppearance({...humanAppearance, height: val as Height})}
                    translationPrefix="character_form.heights"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.build')}
                    options={BUILDS}
                    selected={humanAppearance.build || ''}
                    onSelect={(val) => setHumanAppearance({...humanAppearance, build: val as Build})}
                    translationPrefix="character_form.builds"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.clothing_style')}
                    options={CLOTHING_STYLES}
                    selected={humanAppearance.clothingStyle || ''}
                    onSelect={(val) => setHumanAppearance({...humanAppearance, clothingStyle: val as ClothingStyle})}
                    translationPrefix="character_form.clothing_styles"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.distinctive_features')}
                    options={HUMAN_DISTINCTIVE_FEATURES}
                    selected={humanAppearance.distinctiveFeatures}
                    onSelect={(val) => setHumanAppearance({...humanAppearance, distinctiveFeatures: val as HumanDistinctiveFeature[]})}
                    multiple
                    max={5}
                    translationPrefix="character_form.human_features"
                    getTranslation={t}
                  />
                </View>
              )}

              {/* Imaginary Appearance */}
              {isImaginaryType(type) && (
                <View>
                  <View style={styles.field}>
                    <Text style={styles.label}>{t('character_form.species')}</Text>
                    <TextInput
                      style={styles.input}
                      value={imaginaryAppearance.species}
                      onChangeText={(val) => setImaginaryAppearance({...imaginaryAppearance, species: val})}
                      placeholder="e.g. Dragon, Unicorn, Cloud creature"
                      placeholderTextColor={theme.colors.text.disabled}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>{t('character_form.primary_color')}</Text>
                    <TextInput
                      style={styles.input}
                      value={imaginaryAppearance.primaryColor}
                      onChangeText={(val) => setImaginaryAppearance({...imaginaryAppearance, primaryColor: val})}
                      placeholder="e.g. Rainbow, Sparkly gold"
                      placeholderTextColor={theme.colors.text.disabled}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>{t('character_form.secondary_color')}</Text>
                    <TextInput
                      style={styles.input}
                      value={imaginaryAppearance.secondaryColor}
                      onChangeText={(val) => setImaginaryAppearance({...imaginaryAppearance, secondaryColor: val})}
                      placeholder="e.g. Silver stars"
                      placeholderTextColor={theme.colors.text.disabled}
                    />
                  </View>

                  <TagsInput
                    label={t('character_form.size')}
                    tags={imaginaryAppearance.size ? [imaginaryAppearance.size] : []}
                    onTagsChange={(tags) => setImaginaryAppearance({...imaginaryAppearance, size: tags[0] || ''})}
                    suggestions={SIZE_SUGGESTIONS}
                    max={1}
                    placeholder="e.g. Tiny as a mouse, Giant as a mountain"
                  />

                  <TagsInput
                    label={t('character_form.magical_features')}
                    tags={imaginaryAppearance.magicalFeatures}
                    onTagsChange={(tags) => setImaginaryAppearance({...imaginaryAppearance, magicalFeatures: tags})}
                    suggestions={MAGICAL_FEATURES_SUGGESTIONS}
                    max={10}
                    placeholder="Add magical feature..."
                  />

                  <View style={styles.field}>
                    <Text style={styles.label}>{t('character_form.custom_description')}</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={imaginaryAppearance.customDescription}
                      onChangeText={(val) => setImaginaryAppearance({...imaginaryAppearance, customDescription: val})}
                      placeholder="Full description of appearance..."
                      placeholderTextColor={theme.colors.text.disabled}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                    />
                  </View>
                </View>
              )}
            </ExpandableCard>

            {/* Personality Section */}
            <ExpandableCard title={t('character_form.personality_title')} defaultExpanded={false}>
              {isPetType(type) ? (
                <View>
                  <ChipSelector
                    label={t('character_form.personality_traits')}
                    options={PET_PERSONALITY_TRAITS}
                    selected={personality.traits}
                    onSelect={(val) => setPersonality({...personality, traits: val as PetPersonalityTrait[]})}
                    multiple
                    max={5}
                    translationPrefix="character_form.pet_traits"
                    getTranslation={t}
                  />

                  <ChipSelector
                    label={t('character_form.favorite_activities')}
                    options={PET_ACTIVITIES}
                    selected={personality.favoriteActivities}
                    onSelect={(val) => setPersonality({...personality, favoriteActivities: val as PetActivity[]})}
                    multiple
                    max={5}
                    translationPrefix="character_form.pet_activities"
                    getTranslation={t}
                  />
                </View>
              ) : (
                <View>
                  <TagsInput
                    label={t('character_form.personality_traits')}
                    tags={personality.traits}
                    onTagsChange={(tags) => setPersonality({...personality, traits: tags})}
                    max={5}
                    placeholder="Add trait..."
                  />

                  <TagsInput
                    label={t('character_form.favorite_activities')}
                    tags={personality.favoriteActivities}
                    onTagsChange={(tags) => setPersonality({...personality, favoriteActivities: tags})}
                    max={5}
                    placeholder="Add activity..."
                  />
                </View>
              )}
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
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>{t('character_form.cancel_button')}</Text>
            </TouchableOpacity>

            {currentStep === 1 ? (
              <TouchableOpacity
                style={[styles.button, styles.continueButton]}
                onPress={handleContinue}
                disabled={isAnalyzing || !name.trim() || photos.some(p => p.isUploading)}
              >
                <Text style={styles.continueButtonText}>
                  {isAnalyzing 
                    ? t('character_form.analyzing') 
                    : t('character_form.continue_button')}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSubmit}
                disabled={createCharacter.isPending || updateCharacter.isPending}
              >
                <Text style={styles.saveButtonText}>
                  {(createCharacter.isPending || updateCharacter.isPending)
                    ? t('character_form.saving')
                    : t('character_form.save_button')}
                </Text>
              </TouchableOpacity>
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
  analyzingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    borderRadius: theme.borders.radius.lg,
  },
  analyzingText: {
    marginTop: theme.spacing[3],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.fontWeight.medium,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  backButtonText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.interactive.primary,
    marginLeft: theme.spacing[2],
    fontWeight: theme.typography.fontWeight.medium,
  },
  hint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[1],
    fontStyle: 'italic',
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
  textArea: {
    minHeight: 100,
  },
  errorText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.status.error,
    marginTop: theme.spacing[1],
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  typeButton: {
    width: '48%',
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[3],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
    backgroundColor: theme.colors.background.secondary,
  },
  typeButtonSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  typeIcon: {
    fontSize: 32,
    marginBottom: theme.spacing[2],
  },
  typeText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  typeTextSelected: {
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
  continueButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  continueButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
});
