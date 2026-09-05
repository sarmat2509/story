import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ImageStyle,
  StyleSheet,
  Platform,
  Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/AppButton';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import { getStoryCharacterDisplayName } from '@/utils/characterDisplayName';

export interface StoryCharacter {
  id: string;
  name: string;
  localizedName?: string | null;
  nameTranslations?: Record<string, string | null | undefined>;
  type: string;
  referencePhotoUrl?: string | null;
  isHidden?: boolean;
  description?: string | null;
}

interface StoryCharactersSectionProps {
  characters: StoryCharacter[];
  savedCharacterIds: readonly string[];
  isArtisanMode: boolean;
  onSaveCharacter: (characterId: string, description?: string | null) => void;
  isSavePending: boolean;
  collapsible?: boolean;
  /** Public-story mode: every unsaved canonical character can be linked to the reader's library. */
  canSaveCharacters?: boolean;
}

/** Fixed box for reference photo; image is ~90% of the box so content has a slight inset from the frame. */
const CHARACTER_IMAGE_BOX = 56;

const styles = StyleSheet.create({
  charactersSection: {
    position: 'relative',
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    overflow: 'visible',
    zIndex: 200,
    elevation: 20,
  },
  charactersSectionTitle: {
    flex: 1,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  charactersSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  charactersSectionHeaderCollapsed: {
    marginBottom: 0,
  },
  charactersSectionToggle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.primary,
  },
  characterCard: {
    position: 'relative',
    flexDirection: 'column',
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
    zIndex: 1,
  },
  characterCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  characterImageFrame: {
    width: CHARACTER_IMAGE_BOX,
    height: CHARACTER_IMAGE_BOX,
    marginRight: theme.spacing[3],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.md,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  characterImageFull: {
    width: '90%',
    height: '90%',
    ...Platform.select({
      web: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        objectFit: 'contain' as any,
      },
      default: {},
    }),
  },
  characterAvatarPlaceholder: {
    width: CHARACTER_IMAGE_BOX,
    height: CHARACTER_IMAGE_BOX,
    marginRight: theme.spacing[3],
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.borders.radius.md,
  },
  characterInfo: {
    flex: 1,
  },
  characterName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  characterType: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  saveCharacterAction: {
    alignSelf: 'stretch',
    marginTop: theme.spacing[2],
    width: '100%',
  },
  avatarWithPreview: {
    position: 'relative',
    zIndex: 300,
    elevation: 30,
  },
  characterCardHovered: {
    zIndex: 500,
    elevation: 50,
  },
  previewContainer: {
    position: 'absolute',
    left: CHARACTER_IMAGE_BOX + theme.spacing[2],
    top: 0,
    width: 160,
    height: 160,
    padding: theme.spacing[3],
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    zIndex: 1000,
    elevation: 60,
    ...Platform.select({
      web: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        boxShadow: '0 14px 32px rgba(31, 26, 64, 0.18)' as any,
      },
      default: {},
    }),
  },
  previewImage: {
    flex: 1,
    ...Platform.select({
      web: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        objectFit: 'contain' as any,
        filter: 'contrast(1.1)',
      },
      default: {},
    }),
  },
});

const CHARACTER_TYPE_KEYS: Record<string, string> = {
  child: 'story_viewer.character_type_child',
  person: 'story_viewer.character_type_person',
  animal: 'story_viewer.character_type_animal',
  pet: 'story_viewer.character_type_pet',
  friend: 'story_viewer.character_type_friend',
  imaginary: 'story_viewer.character_type_imaginary',
};

function hasCharacterImage(character: StoryCharacter): boolean {
  return typeof character.referencePhotoUrl === 'string' && character.referencePhotoUrl.trim().length > 0;
}

function detectTouchDevice(): boolean {
  if (Platform.OS !== 'web') return true;
  if (typeof window === 'undefined') return false;

  const hasTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const hasCoarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return hasTouchPoints || hasCoarsePointer;
}

function useIsTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(detectTouchDevice);

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const pointerQuery = window.matchMedia('(pointer: coarse)');
    const updateTouchDevice = () => setIsTouchDevice(detectTouchDevice());
    pointerQuery.addEventListener?.('change', updateTouchDevice);
    return () => pointerQuery.removeEventListener?.('change', updateTouchDevice);
  }, []);

  return isTouchDevice;
}

function StoryCharactersSectionInner({
  characters,
  savedCharacterIds,
  isArtisanMode,
  onSaveCharacter,
  isSavePending,
  collapsible = false,
  canSaveCharacters = false,
}: StoryCharactersSectionProps) {
  const { t } = useTranslation();
  const savedSet = new Set(savedCharacterIds);
  const visibleCharacters = useMemo(
    () => (canSaveCharacters ? characters : characters.filter(hasCharacterImage)),
    [canSaveCharacters, characters]
  );
  const [hoveredCharacterId, setHoveredCharacterId] = useState<string | null>(null);
  const [tappedCharacterId, setTappedCharacterId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(!collapsible);
  const isTouchDevice = useIsTouchDevice();
  const previewedCharacterId = hoveredCharacterId ?? tappedCharacterId;
  const shouldShowCharacters = !collapsible || isExpanded;

  const toggleCharacterPreview = useCallback((characterId: string) => {
    setTappedCharacterId((current) => (current === characterId ? null : characterId));
  }, []);

  const toggleSection = useCallback(() => {
    if (isExpanded) {
      setHoveredCharacterId(null);
      setTappedCharacterId(null);
    }
    setIsExpanded((current) => !current);
  }, [isExpanded]);

  const getCharacterTypeLabel = useCallback(
    (type: string) => {
      const key = CHARACTER_TYPE_KEYS[type];
      return key ? t(key) : type;
    },
    [t]
  );

  if (visibleCharacters.length === 0) {
    return null;
  }

  return (
    <View style={styles.charactersSection}>
      <Pressable
        style={[
          styles.charactersSectionHeader,
          !shouldShowCharacters && styles.charactersSectionHeaderCollapsed,
        ]}
        disabled={!collapsible}
        onPress={toggleSection}
        accessibilityRole={collapsible ? 'button' : undefined}
        accessibilityState={collapsible ? { expanded: isExpanded } : undefined}
      >
        <Text style={styles.charactersSectionTitle}>{t('story_viewer.characters_title')}</Text>
        {collapsible ? (
          <View style={styles.charactersSectionToggle}>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.colors.text.secondary}
            />
          </View>
        ) : null}
      </Pressable>
      {shouldShowCharacters && visibleCharacters.map((char) => {
        const isEffectivelyHidden = char.isHidden && !savedSet.has(char.id);
        const canSaveCharacter =
          !savedSet.has(char.id) && (canSaveCharacters || (isEffectivelyHidden && isArtisanMode));
        const displayName = getStoryCharacterDisplayName(char);
        const isPreviewVisible = previewedCharacterId === char.id;
        return (
          <View
            key={char.id}
            style={[
              styles.characterCard,
              isPreviewVisible && styles.characterCardHovered,
            ]}
          >
            <Pressable
              style={styles.characterCardRow}
              onHoverIn={
                Platform.OS === 'web' ? () => setHoveredCharacterId(char.id) : undefined
              }
              onHoverOut={Platform.OS === 'web' ? () => setHoveredCharacterId(null) : undefined}
              onPress={isTouchDevice ? () => toggleCharacterPreview(char.id) : undefined}
              accessibilityRole={isTouchDevice ? 'button' : undefined}
              accessibilityLabel={isTouchDevice ? displayName : undefined}
              accessibilityState={isTouchDevice ? { expanded: isPreviewVisible } : undefined}
              testID={`story-character-${char.id}`}
            >
              {char.referencePhotoUrl ? (
                <View style={styles.avatarWithPreview}>
                  <View style={styles.characterImageFrame}>
                    <Image
                      source={{
                        uri: formatAssetUrl(char.referencePhotoUrl) ?? char.referencePhotoUrl,
                      }}
                      style={styles.characterImageFull as ImageStyle}
                      resizeMode="contain"
                    />
                  </View>
                  {isPreviewVisible && (
                    <View
                      style={styles.previewContainer}
                      testID={`story-character-preview-${char.id}`}
                    >
                      <Image
                        source={{
                          uri: formatAssetUrl(char.referencePhotoUrl) ?? char.referencePhotoUrl,
                        }}
                        style={styles.previewImage as ImageStyle}
                        resizeMode="contain"
                      />
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.characterAvatarPlaceholder}>
                  <Ionicons name="person-outline" size={22} color={theme.colors.text.tertiary} />
                </View>
              )}
              <View style={styles.characterInfo}>
                <Text style={styles.characterName}>{displayName}</Text>
                <Text style={styles.characterType}>{getCharacterTypeLabel(char.type)}</Text>
              </View>
            </Pressable>
            {canSaveCharacter && (
              <AppButton
                label={t('story_viewer.save_character')}
                onPress={() => onSaveCharacter(char.id, char.description)}
                disabled={isSavePending}
                variant="secondary"
                size="sm"
                leading={
                  <Ionicons
                    name="bookmark-outline"
                    size={16}
                    color={theme.colors.interactive.primary}
                  />
                }
                style={styles.saveCharacterAction}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Memoized characters section — prevents re-renders when parent updates
 * (e.g. audio position changes during playback).
 */
export const StoryCharactersSection = memo(StoryCharactersSectionInner);
