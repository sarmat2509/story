import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';

interface Character {
  id: string;
  name: string;
  type: string;
  referencePhotos?: Array<{ url: string }>;
}

interface Props {
  character: Character;
  onPress: () => void;
  onDelete?: (characterId: string, characterName: string) => void;
}

export function CharacterCard({ character, onPress, onDelete }: Props) {
  const { t } = useTranslation();
  
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
  
  return (
    <View style={styles.cardWrapper}>
      <TouchableOpacity 
        style={styles.card}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.iconContainer}>
          {character.referencePhotos?.[0]?.url ? (
            <Image
              source={{ uri: formatAssetUrl(character.referencePhotos[0].url) ?? character.referencePhotos[0].url }}
              style={styles.avatar}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.icon}>{getCharacterIcon(character.type)}</Text>
          )}
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {character.name}
        </Text>
        <Text style={styles.type}>
          {t(`characters.character_types.${character.type}`)}
        </Text>
      </TouchableOpacity>
      
      {onDelete && (
        <Pressable 
          style={(state: { pressed: boolean }) => [
            styles.deleteButton,
            state.pressed && styles.deleteButtonPressed
          ]}
          onPress={() => onDelete(character.id, character.name)}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    position: 'relative',
  },
  card: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[4],
    alignItems: 'center',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing[3],
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  icon: {
    fontSize: 32,
  },
  name: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[1],
  },
  type: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
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
