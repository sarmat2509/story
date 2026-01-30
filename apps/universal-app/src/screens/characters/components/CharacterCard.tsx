import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';

interface Character {
  id: string;
  name: string;
  type: string;
}

interface Props {
  character: Character;
  onPress: () => void;
}

export function CharacterCard({ character, onPress }: Props) {
  const { t } = useTranslation();
  
  const getCharacterIcon = (type: string): string => {
    switch (type) {
      case 'pet':
        return '🐾';
      case 'family_member':
        return '👨‍👩‍👧';
      case 'friend':
        return '👫';
      case 'neighbor':
        return '🏘️';
      case 'imaginary_friend':
        return '🦄';
      default:
        return '👤';
    }
  };
  
  return (
    <TouchableOpacity 
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{getCharacterIcon(character.type)}</Text>
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {character.name}
      </Text>
      <Text style={styles.type}>
        {t(`characters.character_types.${character.type}`)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
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
});
