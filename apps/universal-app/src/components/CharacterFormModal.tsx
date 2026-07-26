import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { DEFAULT_LOCALE } from '@wondertales/shared';
import { theme } from '@/theme';
import { AppButton } from './AppButton';
import { FeedbackModal } from './FeedbackModal';
import { useCreateCharacter, useUpdateCharacter, useAnalyzeCharacter } from '@/api/characters';
import { useChildren } from '@/api/children';
import { useAuthStore } from '@/store/authStore';
import { UploadPhotoResult, deletePhoto } from '@/utils/uploadPhoto';
import { formatAssetUrl, isServerAssetUrl } from '@/utils/assetUrl';
import { API_BASE_URL, APP_CONFIG } from '@/config/constants';
import { getWebOrigin } from '@/utils/webRuntime';
import { getLocalizedApiError } from '@/utils/localizedApiError';

/** Normalize BCP 47 locale (e.g. uk-UA, en-US) to base code for API (uk, en) */
function toBaseLocale(locale: string | undefined): string {
  const base = (locale || '').split('-')[0]?.toLowerCase() || DEFAULT_LOCALE;
  return LOCALE_IDS.includes(base as any) ? base : DEFAULT_LOCALE;
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

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(objectValue[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeReferencePhotoUrls(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return stableJson(
    value
      .map((photo) =>
        photo && typeof photo === 'object' && typeof (photo as { url?: unknown }).url === 'string'
          ? toAbsoluteAssetUrl((photo as { url: string }).url)
          : null
      )
      .filter((url): url is string => Boolean(url))
  );
}
import { storage } from '@/utils/storage';
import {
  CreateCharacterSchema,
  LOCALE_IDS,
  ReferencePhoto,
  CharacterType,
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
  PERSONALITY_TRAITS,
  FAVORITE_ACTIVITIES,
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
  COLOR_SUGGESTIONS,
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
  HumanDistinctiveFeature,
} from '@wondertales/shared';
import { ChipSelector } from './form/ChipSelector';
import { PhotoUploadGrid } from './form/PhotoUploadGrid';
import { ExpandableCard } from './ExpandableCard';

interface Props {
  visible: boolean;
  onClose: () => void;
  characterId?: string;
  initialData?: {
    name: string;
    childProfileId?: string | null;
    type: CharacterType;
    subtype?: CharacterSubtype | null;
    description?: string;
    descriptionLanguage?: string;
    referencePhotos?: ReferencePhoto[];
    appearanceTraits?: any;
    personality?: any;
    turnaroundSheet?: { url: string; frontUrl?: string; generatedAt: string };
  };
}

function shouldRegenerateCharacterModel(
  initialData: Props['initialData'] | undefined,
  data: {
    description?: string | null;
    referencePhotos?: unknown;
  }
): boolean {
  if (!initialData) return false;

  if (
    data.description !== undefined &&
    normalizeText(data.description) !== normalizeText(initialData.description)
  ) {
    return true;
  }

  if (
    data.referencePhotos !== undefined &&
    normalizeReferencePhotoUrls(data.referencePhotos) !==
      normalizeReferencePhotoUrls(initialData.referencePhotos)
  ) {
    return true;
  }

  return false;
}

const CATEGORY_TYPES = [
  { value: 'person' as CharacterType, icon: '👤', key: 'person' },
  { value: 'animal' as CharacterType, icon: '🐾', key: 'animal' },
  { value: 'imaginary' as CharacterType, icon: '🦄', key: 'imaginary' },
] as const;

type SubtypeOption = { value: string; key: string };
type SubtypeSection = { section?: string; items?: SubtypeOption[] } & Partial<SubtypeOption>;

const COLOR_SWATCHES: Record<string, { backgroundColor: string; borderColor?: string }> = {
  rainbow: { backgroundColor: '#FF6B6B', borderColor: '#4D96FF' },
  gold: { backgroundColor: '#D4AF37' },
  silver: { backgroundColor: '#C0C0C0' },
  sparkly: { backgroundColor: '#FACC15' },
  transparent: { backgroundColor: '#FFFFFF', borderColor: '#94A3B8' },
  glowing: { backgroundColor: '#FDE047' },
  changing: { backgroundColor: '#A78BFA' },
  purple: { backgroundColor: '#8B5CF6' },
  pink: { backgroundColor: '#EC4899' },
  blue: { backgroundColor: '#3B82F6' },
  green: { backgroundColor: '#22C55E' },
  red: { backgroundColor: '#EF4444' },
  yellow: { backgroundColor: '#FACC15' },
  orange: { backgroundColor: '#F97316' },
  multicolor: { backgroundColor: '#14B8A6', borderColor: '#F97316' },
  pastel: { backgroundColor: '#F9A8D4', borderColor: '#93C5FD' },
};

const isSuggestedColor = (value: string) =>
  (COLOR_SUGGESTIONS as readonly string[]).includes(value);

function formatSuggestionLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getColorSuggestionLabel(
  getTranslation: (key: string, options?: Record<string, unknown>) => string,
  value: string
): string {
  return getTranslation(`character_form.color_suggestions.${value}`, {
    defaultValue: formatSuggestionLabel(value),
  });
}

interface ColorPillSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  customPlaceholder: string;
  showCustom: boolean;
  onShowCustomChange: (showCustom: boolean) => void;
  getTranslation: (key: string, options?: Record<string, unknown>) => string;
}

function ColorPillSelector({
  label,
  value,
  onChange,
  customPlaceholder,
  showCustom,
  onShowCustomChange,
  getTranslation,
}: ColorPillSelectorProps) {
  const customSelected = value.trim().length > 0 && !isSuggestedColor(value);
  const shouldShowCustom = showCustom || customSelected;

  return (
    <View style={styles.colorSelector}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.colorPillGrid}>
        {COLOR_SUGGESTIONS.map((color) => {
          const selected = value === color && !shouldShowCustom;
          const swatch = COLOR_SWATCHES[color] ?? { backgroundColor: theme.colors.border.medium };

          return (
            <TouchableOpacity
              key={color}
              style={[styles.colorPill, selected && styles.colorPillSelected]}
              onPress={() => {
                onShowCustomChange(false);
                onChange(color);
              }}
            >
              <View
                style={[
                  styles.colorDot,
                  {
                    backgroundColor: swatch.backgroundColor,
                    borderColor: swatch.borderColor ?? swatch.backgroundColor,
                  },
                ]}
              />
              <Text style={[styles.colorPillText, selected && styles.colorPillTextSelected]}>
                {getColorSuggestionLabel(getTranslation, color)}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[styles.colorPill, shouldShowCustom && styles.colorPillSelected]}
          onPress={() => {
            onShowCustomChange(true);
            if (!customSelected) {
              onChange('');
            }
          }}
        >
          <View style={[styles.colorDot, styles.customColorDot]}>
            <Ionicons
              name="pencil"
              size={14}
              color={shouldShowCustom ? theme.colors.text.inverse : theme.colors.text.secondary}
            />
          </View>
          <Text style={[styles.colorPillText, shouldShowCustom && styles.colorPillTextSelected]}>
            {getTranslation('characters.subtype_sections.other', { defaultValue: 'Other' })}
          </Text>
        </TouchableOpacity>
      </View>

      {shouldShowCustom && (
        <TextInput
          style={[styles.input, styles.colorCustomInput]}
          value={customSelected ? value : ''}
          onChangeText={onChange}
          placeholder={customPlaceholder}
          placeholderTextColor={theme.colors.text.disabled}
        />
      )}
    </View>
  );
}

const SUBTYPE_OPTIONS: Record<CharacterType, SubtypeSection[]> = {
  person: [
    {
      section: 'family',
      items: [
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
      ],
    },
    {
      section: 'friends',
      items: [
        { value: 'best_friend', key: 'best_friend' },
        { value: 'classmate', key: 'classmate' },
        { value: 'neighbor', key: 'neighbor' },
        { value: 'teacher', key: 'teacher' },
        { value: 'godparent', key: 'godparent' },
        { value: 'nanny', key: 'nanny' },
      ],
    },
    {
      section: 'other',
      items: [
        { value: 'doctor', key: 'doctor' },
        { value: 'other_adult', key: 'other_adult' },
        { value: 'other_child', key: 'other_child' },
      ],
    },
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
    {
      section: 'mythical',
      items: [
        { value: 'dragon', key: 'dragon' },
        { value: 'unicorn', key: 'unicorn' },
        { value: 'fairy', key: 'fairy' },
        { value: 'elf', key: 'elf' },
        { value: 'gnome', key: 'gnome' },
        { value: 'mermaid', key: 'mermaid' },
        { value: 'phoenix', key: 'phoenix' },
        { value: 'griffin', key: 'griffin' },
        { value: 'centaur', key: 'centaur' },
        { value: 'troll', key: 'troll' },
        { value: 'monster', key: 'monster' },
      ],
    },
    {
      section: 'magical',
      items: [
        { value: 'wizard', key: 'wizard' },
        { value: 'witch', key: 'witch' },
        { value: 'ghost', key: 'ghost' },
        { value: 'robot', key: 'robot' },
        { value: 'alien', key: 'alien' },
      ],
    },
    { value: 'other_creature', key: 'other_creature' },
  ],
};

export function CharacterFormModal({ visible, onClose, characterId, initialData }: Props) {
  const { t, i18n } = useTranslation();
  const createCharacter = useCreateCharacter();
  const updateCharacter = useUpdateCharacter();
  const analyzeCharacter = useAnalyzeCharacter();
  const sessionMode = useAuthStore((state) => state.sessionMode);
  const isChildSession = sessionMode === 'child';
  const { data: childrenData } = useChildren(!isChildSession && !characterId);
  const childOptions = useMemo(() => childrenData?.children ?? [], [childrenData?.children]);
  const currentPreviewUrl =
    initialData?.turnaroundSheet?.frontUrl ??
    initialData?.turnaroundSheet?.url ??
    initialData?.referencePhotos?.[0]?.url ??
    null;

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  /** Full-screen second modal while create/update request runs (form modal hidden). */
  const [isSubmittingOverlay, setIsSubmittingOverlay] = useState(false);
  const hasAnalyzedRef = useRef(false);

  // Basic fields
  const [name, setName] = useState('');
  const [type, setType] = useState<CharacterType>('person');
  const [childProfileId, setChildProfileId] = useState<string | null>(null);
  const [subtype, setSubtype] = useState<CharacterSubtype | null>(null);
  const [description, setDescription] = useState('');
  const [descriptionLanguage, setDescriptionLanguage] = useState<string | undefined>(undefined);
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
    distinctiveFeatures: [] as PetDistinctiveFeature[],
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
    distinctiveFeatures: [] as HumanDistinctiveFeature[],
  });

  // Imaginary appearance
  const [imaginaryAppearance, setImaginaryAppearance] = useState({
    species: '',
    primaryColor: '',
    secondaryColor: '',
    size: '',
    magicalFeatures: [] as string[],
  });
  const [showPrimaryColorCustom, setShowPrimaryColorCustom] = useState(false);
  const [showSecondaryColorCustom, setShowSecondaryColorCustom] = useState(false);

  // Personality (universal structure)
  const [personality, setPersonality] = useState({
    traits: [] as (PetPersonalityTrait | string)[],
    favoriteActivities: [] as (PetActivity | string)[],
  });

  const hasUploadingPhotos = photos.some((photo) => photo.isUploading);
  const hasUploadedPhotos = photos.some(
    (photo) => !photo.isUploading && isServerAssetUrl(photo.url)
  );
  const hasAnalyzablePhotos = photos.some(
    (photo) => !photo.isUploading && photo.url && formatAssetUrl(photo.url) !== null
  );

  useEffect(() => {
    if (!visible) {
      setIsSubmittingOverlay(false);
    }
  }, [visible]);

  // Handle close with cleanup: delete orphaned photos for new characters
  const handleClose = async () => {
    if (isSubmittingOverlay) {
      return;
    }
    // Only cleanup uploaded photos for NEW characters (not when editing existing ones)
    if (!characterId) {
      const uploadedPhotos = photos.filter((p) => !p.isUploading && isServerAssetUrl(p.url));
      if (uploadedPhotos.length > 0) {
        // Best-effort: delete in parallel, don't block UI on failures
        await Promise.allSettled(uploadedPhotos.map((photo) => deletePhoto(photo.url)));
      }
    }
    onClose();
  };

  // Reset form when modal opens/closes
  useEffect(() => {
    if (visible) {
      hasAnalyzedRef.current = false;
      setShowPrimaryColorCustom(false);
      setShowSecondaryColorCustom(false);
      if (initialData) {
        setName(initialData.name);
        setChildProfileId(initialData.childProfileId ?? null);
        setType(initialData.type);
        setDescription(initialData.description || '');
        setDescriptionLanguage((initialData as any).descriptionLanguage || undefined);

        // Load existing photos
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
              distinctiveFeatures: (initialData.appearanceTraits.distinctiveFeatures ||
                []) as PetDistinctiveFeature[],
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
              clothingStyle: initialData.appearanceTraits.clothingStyle as
                | ClothingStyle
                | undefined,
              distinctiveFeatures: (initialData.appearanceTraits.distinctiveFeatures ||
                []) as HumanDistinctiveFeature[],
            });
          } else if (isImaginaryType(initialData.type)) {
            setImaginaryAppearance({
              species: initialData.appearanceTraits.species || '',
              primaryColor: initialData.appearanceTraits.primaryColor || '',
              secondaryColor: initialData.appearanceTraits.secondaryColor || '',
              size: initialData.appearanceTraits.size || '',
              magicalFeatures: initialData.appearanceTraits.magicalFeatures || [],
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
            distinctiveFeatures: [],
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
            distinctiveFeatures: [],
          });
          setImaginaryAppearance({
            species: '',
            primaryColor: '',
            secondaryColor: '',
            size: '',
            magicalFeatures: [],
          });
        }

        // Load personality
        if (initialData.personality) {
          setPersonality({
            traits: initialData.personality.traits || [],
            favoriteActivities: initialData.personality.favoriteActivities || [],
          });
        } else {
          setPersonality({
            traits: [],
            favoriteActivities: [],
          });
        }
      } else {
        setName('');
        setChildProfileId(childOptions[0]?.id ?? null);
        setType('animal');
        setDescription('');
        setDescriptionLanguage(undefined);
        setPhotos([]);
        setPetAppearance({
          breed: undefined,
          furColor: undefined,
          furPattern: undefined,
          furLength: undefined,
          size: undefined,
          eyeColor: undefined,
          distinctiveFeatures: [],
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
          distinctiveFeatures: [],
        });
        setImaginaryAppearance({
          species: '',
          primaryColor: '',
          secondaryColor: '',
          size: '',
          magicalFeatures: [],
        });
        setPersonality({
          traits: [],
          favoriteActivities: [],
        });
      }
      setErrors({});
    }
  }, [visible, initialData, characterId, childOptions]);

  // Helper function to map character type to analysis type
  function getAnalysisCharacterType(t: CharacterType): 'person' | 'animal' | 'imaginary' {
    if (isAnimalType(t)) return 'animal';
    if (isImaginaryType(t)) return 'imaginary';
    return 'person';
  }

  // Auto-analyze create-only photos once they are ready.
  useEffect(() => {
    if (!visible || characterId || hasAnalyzedRef.current || description.trim()) {
      return;
    }

    const uploadedPhotos = photos
      .filter((p) => !p.isUploading && p.url && formatAssetUrl(p.url) !== null)
      .map((p) => formatAssetUrl(p.url)!);

    if (uploadedPhotos.length === 0) {
      hasAnalyzedRef.current = false;
      return;
    }

    hasAnalyzedRef.current = true;
    const characterType = getAnalysisCharacterType(type);
    storage.getLanguage().then((saved) => {
      let userLanguage = i18n.language;
      if (!userLanguage || userLanguage === 'en-US') {
        userLanguage = saved || APP_CONFIG.defaultLanguage;
      }
      const apiLanguage = toBaseLocale(userLanguage);
      analyzeCharacter.mutate(
        { photos: uploadedPhotos, characterType, language: apiLanguage },
        {
          onSuccess: (analysis) => {
            setDescription(analysis.description || '');
            setDescriptionLanguage(apiLanguage);
            if (analysis.petAppearance && isAnimalType(type)) {
              setPetAppearance({
                breed: analysis.petAppearance.breed || undefined,
                furColor: analysis.petAppearance.furColor as FurColor | undefined,
                furPattern: analysis.petAppearance.furPattern as FurPattern | undefined,
                furLength: analysis.petAppearance.furLength as FurLength | undefined,
                size: analysis.petAppearance.size as PetSize | undefined,
                eyeColor: analysis.petAppearance.eyeColor as PetEyeColor | undefined,
                distinctiveFeatures: (analysis.petAppearance.distinctiveFeatures ||
                  []) as PetDistinctiveFeature[],
              });
            }
            if (analysis.humanAppearance && isHumanType(type)) {
              setHumanAppearance({
                ageRange: analysis.humanAppearance.ageRange as AgeRange | undefined,
                hairColor: analysis.humanAppearance.hairColor as HumanHairColor | undefined,
                hairLength: analysis.humanAppearance.hairLength as HumanHairLength | undefined,
                hairStyle: analysis.humanAppearance.hairStyle as HumanHairStyle | undefined,
                eyeColor: analysis.humanAppearance.eyeColor as EyeColor | undefined,
                skinTone: analysis.humanAppearance.skinTone as SkinTone | undefined,
                height: analysis.humanAppearance.height as Height | undefined,
                build: analysis.humanAppearance.build as Build | undefined,
                clothingStyle: analysis.humanAppearance.clothingStyle as ClothingStyle | undefined,
                distinctiveFeatures: (analysis.humanAppearance.distinctiveFeatures ||
                  []) as HumanDistinctiveFeature[],
              });
            }
            if (analysis.imaginaryAppearance && isImaginaryType(type)) {
              setImaginaryAppearance({
                species: analysis.imaginaryAppearance.species || '',
                primaryColor: analysis.imaginaryAppearance.primaryColor || '',
                secondaryColor: analysis.imaginaryAppearance.secondaryColor || '',
                size: analysis.imaginaryAppearance.size || '',
                magicalFeatures: analysis.imaginaryAppearance.magicalFeatures || [],
              });
            }
          },
        }
      );
    });
  }, [visible, characterId, photos, description, type, analyzeCharacter.mutate, i18n.language]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert(t('error') || 'Error', t('character_form.name_required'));
      return;
    }

    if (!isChildSession && !characterId && childOptions.length > 0 && !childProfileId) {
      Alert.alert(
        t('error') || 'Error',
        t('character_form.child_required', {
          defaultValue: 'Choose a child profile for this character',
        })
      );
      return;
    }

    if (hasUploadingPhotos) {
      Alert.alert(t('character_form.upload_in_progress'), t('character_form.wait_for_upload'));
      return;
    }

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
      const speciesValue =
        imaginaryAppearance.species.trim() || (subtype ? String(subtype).trim() : '');
      if (speciesValue) imagData.species = speciesValue;
      const primaryColor = imaginaryAppearance.primaryColor.trim();
      const secondaryColor = imaginaryAppearance.secondaryColor.trim();
      if (primaryColor) imagData.primaryColor = primaryColor;
      if (secondaryColor) imagData.secondaryColor = secondaryColor;
      if (imaginaryAppearance.size) imagData.size = imaginaryAppearance.size.trim();
      if (imaginaryAppearance.magicalFeatures.length > 0) {
        imagData.magicalFeatures = imaginaryAppearance.magicalFeatures;
      }
      appearanceTraits = Object.keys(imagData).length > 0 ? imagData : undefined;
    }

    // Prepare personality
    const personalityData =
      personality.traits.length > 0 || personality.favoriteActivities.length > 0
        ? personality
        : undefined;

    // Filter only uploaded photos with valid URLs (exclude blob/file URIs).
    // Convert to absolute URLs for Zod .url() validation (schema rejects relative paths).
    const uploadedPhotos = photos
      .filter((photo) => !photo.isUploading && isServerAssetUrl(photo.url))
      .map(({ url, uploadedAt }) => ({
        url: toAbsoluteAssetUrl(url),
        uploadedAt,
      }));

    // Prepare data
    const data = {
      name,
      type,
      subtype: subtype || undefined,
      childProfileId: childProfileId || undefined,
      description: description || undefined,
      descriptionLanguage: descriptionLanguage || undefined,
      referencePhotos: uploadedPhotos,
      appearanceTraits,
      personality: personalityData,
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
        t('character_form.validation_error'),
        t('character_form.validation_error_message')
      );
      return;
    }

    const submitValidatedCharacter = async (validatedData: typeof result.data) => {
      // Submit: hide form modal, show dedicated saving modal
      setIsSubmittingOverlay(true);
      try {
        if (characterId) {
          await updateCharacter.mutateAsync({ id: characterId, data: validatedData });
        } else {
          await createCharacter.mutateAsync(validatedData);
        }
        onClose();
      } catch (error) {
        console.error('Failed to save character:', error);
        setIsSubmittingOverlay(false);
        setErrors({ submit: getLocalizedApiError(t, error, 'character_form.save_failed') });
      }
    };

    if (characterId && shouldRegenerateCharacterModel(initialData, result.data)) {
      Alert.alert(
        t('character_form.regeneration_confirm_title'),
        t('character_form.regeneration_confirm_message'),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
          {
            text: t('character_form.regeneration_confirm_button'),
            onPress: () => {
              void submitValidatedCharacter(result.data);
            },
          },
        ]
      );
      return;
    }

    await submitValidatedCharacter(result.data);
  };

  return (
    <>
      <Modal
        visible={visible && !isSubmittingOverlay}
        animationType="fade"
        transparent
        onRequestClose={handleClose}
      >
        <View style={styles.overlay}>
          <View style={styles.modal} testID="character-form-modal">
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>
                  {characterId ? t('character_form.title_edit') : t('character_form.title_create')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
                testID="character-form-close"
              >
                <Ionicons name="close" size={24} color={theme.colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Name */}
              <View style={styles.field}>
                <Text style={styles.label}>{t('character_form.name_label')}</Text>
                <TextInput
                  style={[styles.input, errors.name && styles.inputError]}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('character_form.name_placeholder')}
                  placeholderTextColor={theme.colors.text.disabled}
                  testID="character-form-name"
                />
                {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
              </View>

              {!isChildSession && !characterId && childOptions.length > 0 && (
                <View style={styles.field}>
                  <Text style={styles.label}>
                    {t('character_form.child_profile_label', { defaultValue: 'For child' })}
                  </Text>
                  <View style={styles.childChips}>
                    {childOptions.map((child) => (
                      <TouchableOpacity
                        key={child.id}
                        style={[
                          styles.childChip,
                          childProfileId === child.id && styles.childChipSelected,
                        ]}
                        onPress={() => setChildProfileId(child.id)}
                        testID={`character-form-child-${child.id}`}
                      >
                        <Text
                          style={[
                            styles.childChipText,
                            childProfileId === child.id && styles.childChipTextSelected,
                          ]}
                        >
                          {child.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Category */}
              <View style={styles.field}>
                <Text style={styles.label}>{t('character_form.category_label')}</Text>
                <View style={styles.typeGrid}>
                  {CATEGORY_TYPES.map((category) => (
                    <TouchableOpacity
                      key={category.value}
                      style={[
                        styles.typeButton,
                        type === category.value && styles.typeButtonSelected,
                      ]}
                      onPress={() => {
                        setType(category.value);
                        setSubtype(null); // Reset subtype when category changes
                      }}
                      testID={`character-form-type-${category.value}`}
                    >
                      <Text style={styles.typeIcon}>{category.icon}</Text>
                      <Text
                        style={[
                          styles.typeText,
                          type === category.value && styles.typeTextSelected,
                        ]}
                      >
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
                  <Text style={styles.hint}>{t('character_form.imaginary_photos_hint')}</Text>
                )}
                {characterId && currentPreviewUrl && photos.length === 0 ? (
                  <View style={styles.currentImageCard}>
                    <Text style={styles.currentImageLabel}>
                      {t('child_form.current_image') || 'Текущее изображение'}
                    </Text>
                    <Image
                      source={{ uri: formatAssetUrl(currentPreviewUrl) ?? currentPreviewUrl }}
                      style={styles.currentImage}
                      resizeMode="contain"
                    />
                  </View>
                ) : null}
                <PhotoUploadGrid
                  photos={photos}
                  onPhotosChange={setPhotos}
                  maxPhotos={5}
                  photoType="character"
                  formatUrl={formatAssetUrl}
                />
              </View>
              {/* Subtype selection */}
              <View style={styles.field}>
                <View style={styles.subtypeChipGroup}>
                  <ChipSelector
                    label={t('character_form.subtype_label')}
                    options={SUBTYPE_OPTIONS[type].flatMap((section) =>
                      (section.items ?? [section]).flatMap((item) =>
                        item.value && item.key ? [item.value] : []
                      )
                    )}
                    selected={subtype || ''}
                    onSelect={(val) => setSubtype(val as CharacterSubtype)}
                    translationPrefix="characters.subtypes"
                    getTranslation={t}
                  />
                </View>
              </View>

              {/* Description */}
              <View style={styles.field}>
                <Text style={styles.label}>{t('character_form.description_label')}</Text>
                {hasAnalyzablePhotos && analyzeCharacter.isPending ? (
                  <View style={styles.turnaroundGenerating}>
                    <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                    <Text style={styles.turnaroundGeneratingText}>
                      {t('character_form.analyzing_photos')}
                    </Text>
                  </View>
                ) : (
                  <TextInput
                    style={[styles.input, styles.textArea, errors.description && styles.inputError]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder={t('character_form.description_placeholder')}
                    placeholderTextColor={theme.colors.text.disabled}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    editable={!analyzeCharacter.isPending}
                    testID="character-form-description"
                  />
                )}
                {description && !analyzeCharacter.isPending && (
                  <Text style={styles.hint}>{t('character_form.ai_generated_hint')}</Text>
                )}
                {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
                {!hasAnalyzablePhotos && (
                  <Text style={styles.hint}>
                    {t('character_form.turnaround_add_photo_or_description')}
                  </Text>
                )}
              </View>

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
                        onChangeText={(val) =>
                          setPetAppearance({ ...petAppearance, breed: val || undefined })
                        }
                        placeholder={t('character_form.breed_placeholder')}
                        placeholderTextColor={theme.colors.text.disabled}
                        testID="character-form-breed"
                      />
                    </View>

                    <ChipSelector
                      label={t('character_form.fur_color')}
                      options={FUR_COLORS}
                      selected={petAppearance.furColor || ''}
                      onSelect={(val) =>
                        setPetAppearance({ ...petAppearance, furColor: val as FurColor })
                      }
                      translationPrefix="character_form.fur_colors"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.fur_pattern')}
                      options={FUR_PATTERNS}
                      selected={petAppearance.furPattern || ''}
                      onSelect={(val) =>
                        setPetAppearance({ ...petAppearance, furPattern: val as FurPattern })
                      }
                      translationPrefix="character_form.fur_patterns"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.fur_length')}
                      options={FUR_LENGTHS}
                      selected={petAppearance.furLength || ''}
                      onSelect={(val) =>
                        setPetAppearance({ ...petAppearance, furLength: val as FurLength })
                      }
                      translationPrefix="character_form.fur_lengths"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.size')}
                      options={PET_SIZES}
                      selected={petAppearance.size || ''}
                      onSelect={(val) =>
                        setPetAppearance({ ...petAppearance, size: val as PetSize })
                      }
                      translationPrefix="character_form.sizes"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.eye_color')}
                      options={PET_EYE_COLORS}
                      selected={petAppearance.eyeColor || ''}
                      onSelect={(val) =>
                        setPetAppearance({ ...petAppearance, eyeColor: val as PetEyeColor })
                      }
                      translationPrefix="character_form.eye_colors"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.distinctive_features')}
                      options={PET_DISTINCTIVE_FEATURES}
                      selected={petAppearance.distinctiveFeatures}
                      onSelect={(val) =>
                        setPetAppearance({
                          ...petAppearance,
                          distinctiveFeatures: val as PetDistinctiveFeature[],
                        })
                      }
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
                      onSelect={(val) =>
                        setHumanAppearance({ ...humanAppearance, ageRange: val as AgeRange })
                      }
                      translationPrefix="character_form.age_ranges"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.hair_color')}
                      options={HUMAN_HAIR_COLORS}
                      selected={humanAppearance.hairColor || ''}
                      onSelect={(val) =>
                        setHumanAppearance({
                          ...humanAppearance,
                          hairColor: val as HumanHairColor,
                        })
                      }
                      translationPrefix="character_form.hair_colors"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.hair_length')}
                      options={HUMAN_HAIR_LENGTHS}
                      selected={humanAppearance.hairLength || ''}
                      onSelect={(val) =>
                        setHumanAppearance({
                          ...humanAppearance,
                          hairLength: val as HumanHairLength,
                        })
                      }
                      translationPrefix="character_form.hair_lengths"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.hair_style')}
                      options={HUMAN_HAIR_STYLES}
                      selected={humanAppearance.hairStyle || ''}
                      onSelect={(val) =>
                        setHumanAppearance({
                          ...humanAppearance,
                          hairStyle: val as HumanHairStyle,
                        })
                      }
                      translationPrefix="character_form.hair_styles"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.eye_color')}
                      options={EYE_COLORS}
                      selected={humanAppearance.eyeColor || ''}
                      onSelect={(val) =>
                        setHumanAppearance({ ...humanAppearance, eyeColor: val as EyeColor })
                      }
                      translationPrefix="character_form.eye_colors"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.skin_tone')}
                      options={SKIN_TONES}
                      selected={humanAppearance.skinTone || ''}
                      onSelect={(val) =>
                        setHumanAppearance({ ...humanAppearance, skinTone: val as SkinTone })
                      }
                      translationPrefix="character_form.skin_tones"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.height')}
                      options={HEIGHTS}
                      selected={humanAppearance.height || ''}
                      onSelect={(val) =>
                        setHumanAppearance({ ...humanAppearance, height: val as Height })
                      }
                      translationPrefix="character_form.heights"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.build')}
                      options={BUILDS}
                      selected={humanAppearance.build || ''}
                      onSelect={(val) =>
                        setHumanAppearance({ ...humanAppearance, build: val as Build })
                      }
                      translationPrefix="character_form.builds"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.clothing_style')}
                      options={CLOTHING_STYLES}
                      selected={humanAppearance.clothingStyle || ''}
                      onSelect={(val) =>
                        setHumanAppearance({
                          ...humanAppearance,
                          clothingStyle: val as ClothingStyle,
                        })
                      }
                      translationPrefix="character_form.clothing_styles"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.distinctive_features')}
                      options={HUMAN_DISTINCTIVE_FEATURES}
                      selected={humanAppearance.distinctiveFeatures}
                      onSelect={(val) =>
                        setHumanAppearance({
                          ...humanAppearance,
                          distinctiveFeatures: val as HumanDistinctiveFeature[],
                        })
                      }
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
                    <ColorPillSelector
                      label={t('character_form.primary_color')}
                      value={imaginaryAppearance.primaryColor}
                      onChange={(val) =>
                        setImaginaryAppearance({ ...imaginaryAppearance, primaryColor: val })
                      }
                      customPlaceholder={t('character_form.primary_color_placeholder')}
                      showCustom={showPrimaryColorCustom}
                      onShowCustomChange={setShowPrimaryColorCustom}
                      getTranslation={t}
                    />

                    <ColorPillSelector
                      label={t('character_form.secondary_color')}
                      value={imaginaryAppearance.secondaryColor}
                      onChange={(val) =>
                        setImaginaryAppearance({
                          ...imaginaryAppearance,
                          secondaryColor: val,
                        })
                      }
                      customPlaceholder={t('character_form.secondary_color_placeholder')}
                      showCustom={showSecondaryColorCustom}
                      onShowCustomChange={setShowSecondaryColorCustom}
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.size')}
                      options={SIZE_SUGGESTIONS}
                      selected={imaginaryAppearance.size}
                      onSelect={(val) =>
                        setImaginaryAppearance({ ...imaginaryAppearance, size: val as string })
                      }
                    />

                    <ChipSelector
                      label={t('character_form.magical_features')}
                      options={MAGICAL_FEATURES_SUGGESTIONS}
                      selected={imaginaryAppearance.magicalFeatures}
                      onSelect={(val) =>
                        setImaginaryAppearance({
                          ...imaginaryAppearance,
                          magicalFeatures: val as string[],
                        })
                      }
                      multiple
                      max={10}
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
                      onSelect={(val) =>
                        setPersonality({ ...personality, traits: val as PetPersonalityTrait[] })
                      }
                      multiple
                      max={5}
                      translationPrefix="character_form.pet_traits"
                      getTranslation={t}
                    />

                    <ChipSelector
                      label={t('character_form.favorite_activities')}
                      options={PET_ACTIVITIES}
                      selected={personality.favoriteActivities}
                      onSelect={(val) =>
                        setPersonality({
                          ...personality,
                          favoriteActivities: val as PetActivity[],
                        })
                      }
                      multiple
                      max={5}
                      translationPrefix="character_form.pet_activities"
                      getTranslation={t}
                    />
                  </View>
                ) : (
                  <View>
                    <ChipSelector
                      label={t('character_form.personality_traits')}
                      options={PERSONALITY_TRAITS}
                      selected={personality.traits}
                      onSelect={(val) =>
                        setPersonality({ ...personality, traits: val as string[] })
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
                          favoriteActivities: val as string[],
                        })
                      }
                      multiple
                      max={5}
                      translationPrefix="child_form.activities"
                      getTranslation={t}
                    />
                  </View>
                )}
              </ExpandableCard>

              {/* Submit error */}
              {errors.submit && (
                <Text style={[styles.errorText, styles.submitError]}>{errors.submit}</Text>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <AppButton
                label={t('character_form.cancel_button')}
                onPress={handleClose}
                variant="secondary"
                style={styles.footerAction}
                testID="character-form-cancel"
              />

              <AppButton
                label={t('character_form.save_button')}
                onPress={handleSubmit}
                disabled={
                  isSubmittingOverlay ||
                  createCharacter.isPending ||
                  updateCharacter.isPending ||
                  hasUploadingPhotos ||
                  !name.trim() ||
                  (!characterId && !description.trim() && !hasUploadedPhotos) ||
                  (!characterId && analyzeCharacter.isPending)
                }
                loading={createCharacter.isPending || updateCharacter.isPending}
                style={styles.footerAction}
                testID="character-form-save"
              />
            </View>

            <TouchableOpacity
              style={styles.reportProblemLink}
              onPress={() => setShowFeedbackModal(true)}
            >
              <Text style={styles.reportProblemLinkText}>{t('profile.report_problem')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={visible && isSubmittingOverlay}
        animationType="fade"
        transparent
        onRequestClose={() => {}}
      >
        <View style={styles.savingModalOverlay}>
          <View style={styles.savingModalCard} testID="character-form-saving">
            <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
            <Text style={styles.savingModalMessage}>{t('character_form.creating_character')}</Text>
          </View>
        </View>
      </Modal>

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="characters"
      />
    </>
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
    flex: 1,
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.lg,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  reportProblemLink: {
    alignSelf: 'center',
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  reportProblemLinkText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
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
  hint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[1],
    fontStyle: 'italic',
  },
  content: {
    flex: 1,
    padding: theme.spacing[5],
  },
  field: {
    marginBottom: theme.spacing[5],
  },
  currentImageCard: {
    marginBottom: theme.spacing[3],
    padding: theme.spacing[3],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
  },
  currentImageLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[2],
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
  colorSelector: {
    marginBottom: theme.spacing[4],
  },
  colorPillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  colorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 42,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.secondary,
    marginBottom: theme.spacing[2],
  },
  colorPillSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    marginRight: theme.spacing[2],
  },
  customColorDot: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.primary,
    borderColor: theme.colors.border.medium,
  },
  colorPillText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  colorPillTextSelected: {
    color: theme.colors.text.inverse,
  },
  colorCustomInput: {
    marginTop: theme.spacing[2],
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
  childChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  childChip: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.secondary,
  },
  childChipSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  childChipText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  childChipTextSelected: {
    color: theme.colors.text.inverse,
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
  footerAction: {
    flex: 1,
  },
  savingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
  },
  savingModalCard: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.lg,
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[8],
    alignItems: 'center',
    maxWidth: 320,
    width: '100%',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  savingModalMessage: {
    marginTop: theme.spacing[5],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    textAlign: 'center',
    fontWeight: theme.typography.fontWeight.medium,
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
  subtypeChipGroup: {
    marginBottom: theme.spacing[3],
  },
});
