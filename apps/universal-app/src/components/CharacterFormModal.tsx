import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { useCreateCharacter, useUpdateCharacter, useAnalyzeCharacter, useGenerateTurnaround } from '@/api/characters';
import { UploadPhotoResult, deletePhoto } from '@/utils/uploadPhoto';
import { storage } from '@/utils/storage';
import { 
  CreateCharacterSchema,
  ReferencePhoto,
  CHARACTER_TYPES as CHAR_TYPES,
  CharacterType,
  PERSON_SUBTYPES,
  ANIMAL_SUBTYPES,
  IMAGINARY_SUBTYPES,
  PersonSubtype,
  AnimalSubtype,
  ImaginarySubtype,
  CharacterSubtype,
  isAnimalType,
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
    turnaroundSheet?: { url: string; generatedAt: string };
  };
}

const CATEGORY_TYPES = [
  { value: 'person' as CharacterType, icon: '👤', key: 'person' },
  { value: 'animal' as CharacterType, icon: '🐾', key: 'animal' },
  { value: 'imaginary' as CharacterType, icon: '🦄', key: 'imaginary' },
] as const;

type SubtypeOption = { value: string; key: string };
type SubtypeSection = { section?: string; items?: SubtypeOption[] } & Partial<SubtypeOption>;

const SUBTYPE_OPTIONS: Record<CharacterType, SubtypeSection[]> = {
  person: [
    { section: 'family', items: [
      { value: 'mother', key: 'mother' },
      { value: 'father', key: 'father' },
      { value: 'grandmother', key: 'grandmother' },
      { value: 'grandfather', key: 'grandfather' },
      { value: 'brother', key: 'brother' },
      { value: 'sister', key: 'sister' },
      { value: 'aunt', key: 'aunt' },
      { value: 'uncle', key: 'uncle' },
      { value: 'cousin_brother', key: 'cousin_brother' },
      { value: 'cousin_sister', key: 'cousin_sister' },
    ]},
    { section: 'friends', items: [
      { value: 'best_friend', key: 'best_friend' },
      { value: 'classmate', key: 'classmate' },
      { value: 'neighbor', key: 'neighbor' },
      { value: 'teacher', key: 'teacher' },
      { value: 'godparent', key: 'godparent' },
      { value: 'nanny', key: 'nanny' },
    ]},
    { section: 'other', items: [
      { value: 'doctor', key: 'doctor' },
      { value: 'other_adult', key: 'other_adult' },
      { value: 'other_child', key: 'other_child' },
    ]},
  ],
  animal: [
    { value: 'dog', key: 'dog' },
    { value: 'cat', key: 'cat' },
    { value: 'hamster', key: 'hamster' },
    { value: 'parrot', key: 'parrot' },
    { value: 'rabbit', key: 'rabbit' },
    { value: 'turtle', key: 'turtle' },
    { value: 'fish', key: 'fish' },
    { value: 'goat', key: 'goat' },
    { value: 'cow', key: 'cow' },
    { value: 'horse', key: 'horse' },
    { value: 'other_animal', key: 'other_animal' },
  ],
  imaginary: [
    { section: 'mythical', items: [
      { value: 'dragon', key: 'dragon' },
      { value: 'unicorn', key: 'unicorn' },
      { value: 'fairy', key: 'fairy' },
      { value: 'elf', key: 'elf' },
      { value: 'gnome', key: 'gnome' },
    ]},
    { section: 'magical', items: [
      { value: 'wizard', key: 'wizard' },
      { value: 'witch', key: 'witch' },
      { value: 'ghost', key: 'ghost' },
      { value: 'robot', key: 'robot' },
      { value: 'alien', key: 'alien' },
    ]},
    { section: 'animated', items: [
      { value: 'toy', key: 'toy' },
      { value: 'drawing', key: 'drawing' },
      { value: 'imaginary_friend', key: 'imaginary_friend' },
      { value: 'other_creature', key: 'other_creature' },
    ]},
  ],
};

export function CharacterFormModal({ visible, onClose, characterId, initialData }: Props) {
  const { t, i18n } = useTranslation();
  const createCharacter = useCreateCharacter();
  const updateCharacter = useUpdateCharacter();
  const analyzeCharacter = useAnalyzeCharacter();
  const generateTurnaround = useGenerateTurnaround();
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  
  // Basic fields
  const [name, setName] = useState('');
  const [type, setType] = useState<CharacterType>('person');
  const [subtype, setSubtype] = useState<CharacterSubtype | null>(null);
  const [description, setDescription] = useState('');
  const [descriptionLanguage, setDescriptionLanguage] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Turnaround sheet (read-only, from backend)
  const [turnaroundSheetUrl, setTurnaroundSheetUrl] = useState<string | undefined>(undefined);

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
    magicalFeatures: [] as string[]
  });

  // Personality (universal structure)
  const [personality, setPersonality] = useState({
    traits: [] as (PetPersonalityTrait | string)[],
    favoriteActivities: [] as (PetActivity | string)[]
  });

  // Handle close with cleanup: delete orphaned photos for new characters
  const handleClose = async () => {
    // Only cleanup uploaded photos for NEW characters (not when editing existing ones)
    if (!characterId) {
      const uploadedPhotos = photos.filter(p => !p.isUploading && p.url?.startsWith('http'));
      if (uploadedPhotos.length > 0) {
        // Best-effort: delete in parallel, don't block UI on failures
        await Promise.allSettled(
          uploadedPhotos.map(photo => deletePhoto(photo.url))
        );
      }
    }
    onClose();
  };

  // Reset form when modal opens/closes
  useEffect(() => {
    if (visible) {
      setCurrentStep(1);
      if (initialData) {
        setName(initialData.name);
        setType(initialData.type);
        setDescription(initialData.description || '');
        setDescriptionLanguage((initialData as any).descriptionLanguage || undefined);
        
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
          if (isAnimalType(initialData.type)) {
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
              magicalFeatures: initialData.appearanceTraits.magicalFeatures || []
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
            magicalFeatures: []
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
        
        // Load turnaround sheet URL if available
        setTurnaroundSheetUrl(initialData.turnaroundSheet?.url || undefined);

        // Skip to step 2 if editing and has description
        if (characterId && initialData.description) {
          setCurrentStep(2);
        }
      } else {
        setName('');
        setType('animal');
        setDescription('');
        setDescriptionLanguage(undefined);
        setTurnaroundSheetUrl(undefined);
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
          magicalFeatures: []
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
    if (isAnimalType(type)) return 'animal';
    if (isImaginaryType(type)) return 'imaginary';
    return 'person';
  }

  // Handler for Step 1 "Continue" button
  const handleContinue = () => {
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

    // Move to step 2
    setCurrentStep(2);
  };

  // Handler for "Generate Description" button on Step 2
  const handleAnalyzePhotos = async () => {
    const uploadedPhotos = photos
      .filter(p => !p.isUploading && p.url && p.url.startsWith('http'))
      .map(p => p.url);

    if (uploadedPhotos.length === 0) return;

    try {
      const characterType = getAnalysisCharacterType(type);

      // Get user's language - try i18n first, then storage, then fallback to 'uk'
      let userLanguage = i18n.language;
      if (!userLanguage || userLanguage === 'en-US') {
        const savedLanguage = await storage.getLanguage();
        userLanguage = savedLanguage || 'uk';
      }

      const analysis = await analyzeCharacter.mutateAsync({
        photos: uploadedPhotos,
        characterType,
        language: userLanguage,
      });

      // Populate description and remember analysis language
      setDescription(analysis.description || '');
      setDescriptionLanguage(userLanguage);

      // Populate appearance fields based on type
      if (analysis.petAppearance && isAnimalType(type)) {
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
      } else if (analysis.imaginaryAppearance && isImaginaryType(type)) {
        setImaginaryAppearance({
          species: analysis.imaginaryAppearance.species || '',
          primaryColor: analysis.imaginaryAppearance.primaryColor || '',
          secondaryColor: analysis.imaginaryAppearance.secondaryColor || '',
          size: analysis.imaginaryAppearance.size || '',
          magicalFeatures: analysis.imaginaryAppearance.magicalFeatures || []
        });
      }
    } catch (error) {
      console.error('Photo analysis failed:', error);
      Alert.alert(
        t('character_form.analysis_failed_title'),
        t('character_form.analysis_failed_message')
      );
    }
  };

  const handleSubmit = async () => {
    try {
      // Prepare appearance traits based on type
      let appearanceTraits;
      if (isAnimalType(type)) {
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
        subtype: subtype || undefined,
        description: description || undefined,
        descriptionLanguage: descriptionLanguage || undefined,
        referencePhotos: uploadedPhotos,
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
      onRequestClose={handleClose}
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
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text.primary} />
            </TouchableOpacity>
          </View>

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

                {/* Category */}
                <View style={styles.field}>
                  <Text style={styles.label}>{t('character_form.category_label')}</Text>
                  <View style={styles.typeGrid}>
                    {CATEGORY_TYPES.map((category) => (
                      <TouchableOpacity
                        key={category.value}
                        style={[
                          styles.typeButton,
                          type === category.value && styles.typeButtonSelected
                        ]}
                        onPress={() => {
                          setType(category.value);
                          setSubtype(null); // Reset subtype when category changes
                        }}
                      >
                        <Text style={styles.typeIcon}>{category.icon}</Text>
                        <Text style={[
                          styles.typeText,
                          type === category.value && styles.typeTextSelected
                        ]}>
                          {t(`characters.categories.${category.key}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {errors.type && <Text style={styles.errorText}>{errors.type}</Text>}
                </View>

                {/* Photos - Available for all character types */}
                <View style={styles.field}>
                  <Text style={styles.label}>{t('character_form.photos_title')}</Text>
                  {isImaginaryType(type) && (
                    <Text style={styles.hint}>
                      {t('character_form.imaginary_photos_hint')}
                    </Text>
                  )}
                  <PhotoUploadGrid
                    photos={photos}
                    onPhotosChange={setPhotos}
                    maxPhotos={5}
                    photoType="character"
                  />
                </View>
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

                {/* Subtype selection */}
                <View style={styles.field}>
                  <Text style={styles.label}>{t('character_form.subtype_label')}</Text>
                  <ScrollView style={styles.subtypeList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                    {SUBTYPE_OPTIONS[type].map((section, index) => (
                      <View key={section.section || `section-${index}`}>
                        {section.section && (
                          <Text style={styles.subtypeSection}>
                            {t(`characters.subtype_sections.${section.section}`)}
                          </Text>
                        )}
                        <View style={styles.subtypeGrid}>
                          {(section.items || [section]).map((item) => {
                            const itemValue = item.value || section.value;
                            const itemKey = item.key || section.key;
                            if (!itemValue || !itemKey) return null;
                            return (
                              <TouchableOpacity
                                key={itemValue}
                                style={[
                                  styles.subtypeButton,
                                  subtype === itemValue && styles.subtypeButtonSelected
                                ]}
                                onPress={() => setSubtype(itemValue as CharacterSubtype)}
                              >
                                <Text style={[
                                  styles.subtypeText,
                                  subtype === itemValue && styles.subtypeTextSelected
                                ]}>
                                  {t(`characters.subtypes.${itemKey}`)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>

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
                  {/* Generate / Regenerate Description button */}
                  {photos.some(p => !p.isUploading && p.url?.startsWith('http')) ? (
                    analyzeCharacter.isPending ? (
                      <View style={styles.turnaroundGenerating}>
                        <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                        <Text style={styles.turnaroundGeneratingText}>
                          {t('character_form.analyzing_photos')}
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
                            ? t('character_form.regenerate_description')
                            : t('character_form.generate_description')}
                        </Text>
                      </TouchableOpacity>
                    )
                  ) : (
                    <Text style={styles.hint}>
                      {t('character_form.description_upload_photos_first')}
                    </Text>
                  )}
                </View>

                {/* Turnaround Sheet (imaginary characters only) */}
                {isImaginaryType(type) && (
                  <View style={styles.field}>
                    <Text style={styles.label}>{t('character_form.turnaround_sheet')}</Text>
                    {turnaroundSheetUrl && (
                      <View style={styles.turnaroundContainer}>
                        <Image
                          source={{ uri: turnaroundSheetUrl }}
                          style={styles.turnaroundImage}
                          resizeMode="contain"
                        />
                      </View>
                    )}
                    {characterId ? (
                      generateTurnaround.isPending ? (
                        <View style={styles.turnaroundGenerating}>
                          <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                          <Text style={styles.turnaroundGeneratingText}>
                            {t('character_form.generating_turnaround')}
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
                              const result = await generateTurnaround.mutateAsync({ characterId, description: description || undefined });
                              setTurnaroundSheetUrl(result.url);
                            } catch (error) {
                              Alert.alert(
                                t('error') || 'Error',
                                t('character_form.turnaround_error'),
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
                              ? t('character_form.regenerate_turnaround')
                              : t('character_form.generate_turnaround')}
                          </Text>
                        </TouchableOpacity>
                      )
                    ) : (
                      <Text style={styles.hint}>
                        {t('character_form.turnaround_save_first')}
                      </Text>
                    )}
                  </View>
                )}

                {/* Appearance Section */}
                <ExpandableCard title={t('character_form.appearance_title')} defaultExpanded={true}>
                  {/* Pet Appearance */}
                  {isAnimalType(type) && (
                <View>
                  {/* Breed - free text input */}
                  <View style={styles.field}>
                    <Text style={styles.label}>{t('character_form.breed')}</Text>
                    <TextInput
                      style={styles.input}
                      value={petAppearance.breed || ''}
                      onChangeText={(val) => setPetAppearance({...petAppearance, breed: val || undefined})}
                      placeholder={t('character_form.breed_placeholder')}
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
                      placeholder={t('character_form.species_placeholder')}
                      placeholderTextColor={theme.colors.text.disabled}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>{t('character_form.primary_color')}</Text>
                    <TextInput
                      style={styles.input}
                      value={imaginaryAppearance.primaryColor}
                      onChangeText={(val) => setImaginaryAppearance({...imaginaryAppearance, primaryColor: val})}
                      placeholder={t('character_form.primary_color_placeholder')}
                      placeholderTextColor={theme.colors.text.disabled}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>{t('character_form.secondary_color')}</Text>
                    <TextInput
                      style={styles.input}
                      value={imaginaryAppearance.secondaryColor}
                      onChangeText={(val) => setImaginaryAppearance({...imaginaryAppearance, secondaryColor: val})}
                      placeholder={t('character_form.secondary_color_placeholder')}
                      placeholderTextColor={theme.colors.text.disabled}
                    />
                  </View>

                  <TagsInput
                    label={t('character_form.size')}
                    tags={imaginaryAppearance.size ? [imaginaryAppearance.size] : []}
                    onTagsChange={(tags) => setImaginaryAppearance({...imaginaryAppearance, size: tags[0] || ''})}
                    suggestions={SIZE_SUGGESTIONS}
                    max={1}
                    placeholder={t('character_form.size_placeholder')}
                  />

                  <TagsInput
                    label={t('character_form.magical_features')}
                    tags={imaginaryAppearance.magicalFeatures}
                    onTagsChange={(tags) => setImaginaryAppearance({...imaginaryAppearance, magicalFeatures: tags})}
                    suggestions={MAGICAL_FEATURES_SUGGESTIONS}
                    max={10}
                    placeholder={t('character_form.magical_features_placeholder')}
                  />
                </View>
              )}
            </ExpandableCard>

            {/* Personality Section */}
            <ExpandableCard title={t('character_form.personality_title')} defaultExpanded={false}>
              {isAnimalType(type) ? (
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
                    placeholder={t('character_form.personality_trait_placeholder')}
                  />

                  <TagsInput
                    label={t('character_form.favorite_activities')}
                    tags={personality.favoriteActivities}
                    onTagsChange={(tags) => setPersonality({...personality, favoriteActivities: tags})}
                    max={5}
                    placeholder={t('character_form.favorite_activity_placeholder')}
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
              onPress={handleClose}
            >
              <Text style={styles.cancelButtonText}>{t('character_form.cancel_button')}</Text>
            </TouchableOpacity>

            {currentStep === 1 ? (
              <TouchableOpacity
                style={[styles.button, styles.continueButton]}
                onPress={handleContinue}
                disabled={!name.trim() || photos.some(p => p.isUploading)}
              >
                <Text style={styles.continueButtonText}>
                  {t('character_form.continue_button')}
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
  subtypeList: {
    maxHeight: 200,
  },
  subtypeSection: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[2],
    textTransform: 'uppercase',
  },
  subtypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  subtypeButton: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
  },
  subtypeButtonSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  subtypeText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  subtypeTextSelected: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
