import React, { memo, useCallback } from 'react';
import { View, Text, Image, TouchableOpacity, ImageStyle, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { stripCharacterIdFromName } from '@wondertales/shared';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';

export interface StoryCharacter {
  id: string;
  name: string;
  type: string;
  referencePhotoUrl?: string | null;
  isHidden?: boolean;
}

interface StoryCharactersSectionProps {
  characters: StoryCharacter[];
  savedCharacterIds: readonly string[];
  isArtisanMode: boolean;
  onSaveCharacter: (characterId: string) => void;
  isSavePending: boolean;
}

const styles = StyleSheet.create({
  charactersSection: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  charactersSectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[3],
  },
  characterCard: {
    flexDirection: 'column',
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
  },
  characterCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  characterAvatar: {
    width: 40,
    height: 40,
    marginRight: theme.spacing[3],
  },
  characterAvatarPlaceholder: {
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
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
  saveCharacterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: theme.spacing[2],
    marginLeft: 52,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
  },
  saveCharacterText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.interactive.primary,
    marginLeft: theme.spacing[1],
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

function StoryCharactersSectionInner({
  characters,
  savedCharacterIds,
  isArtisanMode,
  onSaveCharacter,
  isSavePending,
}: StoryCharactersSectionProps) {
  const { t } = useTranslation();
  const savedSet = new Set(savedCharacterIds);

  const getCharacterTypeLabel = useCallback(
    (type: string) => {
      const key = CHARACTER_TYPE_KEYS[type];
      return key ? t(key) : type;
    },
    [t]
  );

  return (
    <View style={styles.charactersSection}>
      <Text style={styles.charactersSectionTitle}>{t('story_viewer.characters_title')}</Text>
      {characters.map((char) => {
        const isEffectivelyHidden = char.isHidden && !savedSet.has(char.id);
        const canSaveCharacter = isEffectivelyHidden && isArtisanMode;
        return (
          <View key={char.id} style={styles.characterCard}>
            <View style={styles.characterCardRow}>
              {char.referencePhotoUrl ? (
                <Image
                  source={{
                    uri: formatAssetUrl(char.referencePhotoUrl) ?? char.referencePhotoUrl,
                  }}
                  style={styles.characterAvatar as ImageStyle}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.characterAvatar, styles.characterAvatarPlaceholder]}>
                  <Ionicons name="person-outline" size={20} color={theme.colors.text.tertiary} />
                </View>
              )}
              <View style={styles.characterInfo}>
                <Text style={styles.characterName}>{stripCharacterIdFromName(char.name)}</Text>
                <Text style={styles.characterType}>{getCharacterTypeLabel(char.type)}</Text>
              </View>
            </View>
            {canSaveCharacter && (
              <TouchableOpacity
                style={styles.saveCharacterButton}
                onPress={() => onSaveCharacter(char.id)}
                disabled={isSavePending}
              >
                <Ionicons name="bookmark-outline" size={16} color={theme.colors.interactive.primary} />
                <Text style={styles.saveCharacterText}>{t('story_viewer.save_character')}</Text>
              </TouchableOpacity>
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
