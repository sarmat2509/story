import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppButton } from '@/components/AppButton';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';

interface Character {
  id: string;
  name: string;
  type: string;
  subtype?: string | null;
  childProfileId?: string | null;
  turnaroundSheet?: { url: string; frontUrl?: string };
  referencePhotos?: Array<{ url: string }>;
}

interface DisplayItem {
  id: string;
  name: string;
  type: string;
  icon: string;
  badge: string;
  avatarUrl?: string;
}

interface Props {
  characters?: Character[];
  selectedCharacters: string[];
  maxSelections: number;
  onCharactersChange: (ids: string[]) => void;

  onAddCharacter?: () => void;
  onAddChild?: () => void;
}

function isChildProfileCharacter(character: Character): boolean {
  return character.type === 'child' || character.subtype === 'child';
}

function getCharacterSortRank(character: Character): number {
  return character.type === 'person' || isChildProfileCharacter(character) ? 0 : 1;
}

export function CharactersForm({
  characters = [],
  selectedCharacters,
  maxSelections,
  onCharactersChange,
  onAddCharacter,
  onAddChild,
}: Props) {
  const { t } = useTranslation();

  const toggleItem = (item: DisplayItem) => {
    if (selectedCharacters.includes(item.id)) {
      onCharactersChange(selectedCharacters.filter((id) => id !== item.id));
    } else {
      if (selectedCharacters.length < maxSelections) {
        onCharactersChange([...selectedCharacters, item.id]);
      }
    }
  };

  const getCharacterIcon = (type: string): string => {
    switch (type) {
      case 'child':
        return '👶';
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

  const getCharacterTypeName = (type: string): string => {
    switch (type) {
      case 'child':
        return t('wizard.child_badge');
      case 'person':
        return t('characters.categories.person');
      case 'animal':
        return t('characters.categories.animal');
      case 'imaginary':
        return t('characters.categories.imaginary');
      default:
        return t('characters.title');
    }
  };

  const allItems: DisplayItem[] = characters
    .map((c, index) => {
      const displayType = isChildProfileCharacter(c) ? 'child' : c.type;
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        icon: getCharacterIcon(displayType),
        badge: getCharacterTypeName(displayType),
        avatarUrl:
          c.turnaroundSheet?.frontUrl ?? c.turnaroundSheet?.url ?? c.referencePhotos?.[0]?.url,
        sortRank: getCharacterSortRank(c),
        originalIndex: index,
      };
    })
    .sort((a, b) => a.sortRank - b.sortRank || a.originalIndex - b.originalIndex)
    .map(({ sortRank: _sortRank, originalIndex: _originalIndex, ...item }) => item);

  const totalSelected = selectedCharacters.length;
  const hasAnyItems = characters.length > 0;

  return (
    <View style={styles.container}>
      {/* Characters and Children List */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          {t('characters.select_characters', { count: maxSelections })}
        </Text>

        {!hasAnyItems ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>{t('characters.no_characters')}</Text>
            <View style={styles.emptyActions}>
              {onAddChild && (
                <AppButton
                  label={t('characters.add_child_to_story')}
                  onPress={onAddChild}
                  variant="secondary"
                  size="md"
                  leading={
                    <Ionicons
                      name="add-circle"
                      size={20}
                      color={theme.colors.interactive.primary}
                    />
                  }
                />
              )}
              {onAddCharacter && (
                <AppButton
                  label={t('characters.add_character')}
                  onPress={onAddCharacter}
                  variant="secondary"
                  size="md"
                  leading={
                    <Ionicons
                      name="add-circle"
                      size={20}
                      color={theme.colors.interactive.primary}
                    />
                  }
                />
              )}
            </View>
          </View>
        ) : (
          <View style={styles.charactersList}>
            {allItems.map((item) => {
              const isSelected = selectedCharacters.includes(item.id);
              const isDisabled = !isSelected && totalSelected >= maxSelections;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.characterItem,
                    isSelected && styles.characterItemSelected,
                    isDisabled && styles.characterItemDisabled,
                  ]}
                  onPress={() => !isDisabled && toggleItem(item)}
                  disabled={isDisabled}
                  activeOpacity={0.7}
                  testID={`wizard-character-${item.id}`}
                >
                  <View style={styles.characterLeft}>
                    {item.avatarUrl ? (
                      <Image
                        source={{ uri: formatAssetUrl(item.avatarUrl) ?? item.avatarUrl }}
                        style={styles.characterAvatar}
                        resizeMode="contain"
                      />
                    ) : (
                      <Text style={styles.characterIcon}>{item.icon}</Text>
                    )}
                    <View>
                      <Text
                        style={[styles.characterName, isDisabled && styles.characterNameDisabled]}
                      >
                        {item.name}
                      </Text>
                      <Text style={styles.characterType}>{item.badge}</Text>
                    </View>
                  </View>
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color={theme.colors.text.inverse} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[5],
  },
  section: {
    marginBottom: theme.spacing[2],
  },
  sectionLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[3],
  },
  emptyState: {
    alignItems: 'center',
    padding: theme.spacing[8],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderStyle: 'dashed',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: theme.spacing[3],
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
  },
  emptyActions: {
    flexDirection: 'row',
    gap: theme.spacing[4],
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  charactersList: {
    gap: theme.spacing[2],
  },
  characterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing[3],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  characterItemSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  characterItemDisabled: {
    opacity: 0.5,
  },
  characterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  characterAvatar: {
    width: 40,
    height: 40,
    marginRight: theme.spacing[3],
  },
  characterIcon: {
    fontSize: 32,
    marginRight: theme.spacing[3],
  },
  characterName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  characterNameDisabled: {
    color: theme.colors.text.disabled,
  },
  characterType: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: theme.borders.radius.sm,
    borderWidth: theme.borders.width.medium,
    borderColor: theme.colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
});
