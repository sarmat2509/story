import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Platform,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import { stripCharacterIdFromName, type CharacterNameTranslations } from '@wondertales/shared';

interface Character {
  id: string;
  name: string;
  nameTranslations?: CharacterNameTranslations;
  type: string;
  referencePhotos?: Array<{ url: string }>;
  turnaroundSheet?: { url: string; frontUrl?: string };
}

interface Props {
  character: Character;
  onPress: () => void;
  onDelete?: (characterId: string, characterName: string) => void;
}

const getCharacterIcon = (type: string): string => {
  switch (type) {
    case 'person':
      return '👤';
    case 'animal':
      return '🐾';
    case 'imaginary':
      return '🦄';
    default:
      return '👤';
  }
};

const CHARACTER_IMAGE_MATTE = '#FFFFFF';

function normalizeLocale(locale?: string | null): string | null {
  return locale?.split('-')[0]?.toLowerCase() || null;
}

function getCharacterDisplayName(character: Character, locale?: string | null): string {
  const normalizedLocale = normalizeLocale(locale);
  const translatedName = normalizedLocale ? character.nameTranslations?.[normalizedLocale] : null;
  const candidate = translatedName || character.name;
  const displayName = stripCharacterIdFromName(candidate).trim();
  return displayName || stripCharacterIdFromName(character.name).trim() || character.name;
}

export function CharacterCard({ character, onPress, onDelete }: Props) {
  const { i18n } = useTranslation();
  const avatarUrl =
    character.turnaroundSheet?.frontUrl ??
    character.turnaroundSheet?.url ??
    character.referencePhotos?.[0]?.url;
  const displayName = getCharacterDisplayName(character, i18n.language);
  const imageContainerWebStyle: ViewStyle | null =
    Platform.OS === 'web' ? { filter: 'contrast(1.05)' } : null;

  return (
    <View style={styles.cardWrapper} testID={`character-card-${character.id}`}>
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        activeOpacity={0.7}
        testID={`character-card-button-${character.id}`}
      >
        <View style={[styles.imageContainer, imageContainerWebStyle]}>
          {avatarUrl ? (
            <Image
              source={{ uri: formatAssetUrl(avatarUrl) ?? avatarUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderIcon}>{getCharacterIcon(character.type)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {displayName}
        </Text>
      </TouchableOpacity>

      {onDelete && (
        <Pressable
          style={(state: { pressed: boolean }) => [
            styles.deleteButton,
            state.pressed && styles.deleteButtonPressed,
          ]}
          onPress={() => onDelete(character.id, displayName)}
          testID={`character-card-delete-${character.id}`}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create<{
  cardWrapper: ViewStyle;
  card: ViewStyle;
  imageContainer: ViewStyle;
  image: ImageStyle;
  placeholder: ViewStyle;
  placeholderIcon: TextStyle;
  name: TextStyle;
  deleteButton: ViewStyle;
  deleteButtonPressed: ViewStyle;
}>({
  cardWrapper: {
    position: 'relative',
  },
  card: {
    backgroundColor: CHARACTER_IMAGE_MATTE,
    borderRadius: theme.borders.radius.lg,
    overflow: 'hidden',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    padding: theme.spacing[6],
  },
  imageContainer: {
    height: 180,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: CHARACTER_IMAGE_MATTE,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: CHARACTER_IMAGE_MATTE,
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 64,
  },
  name: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    paddingTop: theme.spacing[4],
  },
  deleteButton: {
    position: 'absolute',
    top: theme.spacing[2],
    right: theme.spacing[2],
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    borderRadius: theme.borders.radius.full,
    padding: theme.spacing[2],
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  deleteButtonPressed: {
    backgroundColor: 'rgba(185, 28, 28, 0.9)',
  },
});
