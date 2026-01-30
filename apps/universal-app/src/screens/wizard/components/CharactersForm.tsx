import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';

interface Character {
  id: string;
  name: string;
  type: string;
}

interface ChildProfile {
  id: string;
  name: string;
}

interface DisplayItem {
  id: string;
  name: string;
  type: string;
  icon: string;
  badge: string;
  isChild: boolean;
}

interface Props {
  characters?: Character[];
  selectedCharacters: string[];
  onCharactersChange: (ids: string[]) => void;
  
  children?: ChildProfile[];
  selectedChildren: string[];
  onChildrenChange: (ids: string[]) => void;
  
  onAddCharacter?: () => void;
  onAddChild?: () => void;
}

export function CharactersForm({
  characters = [],
  selectedCharacters,
  onCharactersChange,
  children = [],
  selectedChildren,
  onChildrenChange,
  onAddCharacter,
  onAddChild
}: Props) {
  const { t } = useTranslation();
  
  const toggleItem = (item: DisplayItem) => {
    if (item.isChild) {
      // Toggle child
      if (selectedChildren.includes(item.id)) {
        onChildrenChange(selectedChildren.filter(id => id !== item.id));
      } else {
        // Check total limit
        const totalSelected = selectedChildren.length + selectedCharacters.length;
        if (totalSelected < 5) {
          onChildrenChange([...selectedChildren, item.id]);
        }
      }
    } else {
      // Toggle character
      if (selectedCharacters.includes(item.id)) {
        onCharactersChange(selectedCharacters.filter(id => id !== item.id));
      } else {
        // Check total limit
        const totalSelected = selectedChildren.length + selectedCharacters.length;
        if (totalSelected < 5) {
          onCharactersChange([...selectedCharacters, item.id]);
        }
      }
    }
  };

  const getCharacterIcon = (type: string): string => {
    switch (type) {
      case 'child':
        return '👶';
      case 'pet':
        return '🐾';
      case 'family_member':
        return '👨‍👩‍👧';
      case 'imaginary_friend':
        return '🦄';
      case 'friend':
        return '👫';
      case 'neighbor':
        return '🏘️';
      default:
        return '👤';
    }
  };
  
  const getCharacterTypeName = (type: string): string => {
    switch (type) {
      case 'child':
        return t('wizard.child_badge') || 'Дитина';
      case 'pet':
        return 'Вихованець';
      case 'family_member':
        return 'Родич';
      case 'imaginary_friend':
        return 'Уявний друг';
      case 'friend':
        return 'Друг';
      case 'neighbor':
        return 'Сусід';
      default:
        return 'Персонаж';
    }
  };
  
  // Merge children and characters into unified list
  const allItems: DisplayItem[] = [
    ...children.map(c => ({
      id: c.id,
      name: c.name,
      type: 'child',
      icon: getCharacterIcon('child'),
      badge: getCharacterTypeName('child'),
      isChild: true,
    })),
    ...characters.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      icon: getCharacterIcon(c.type),
      badge: getCharacterTypeName(c.type),
      isChild: false,
    }))
  ];
  
  const totalSelected = selectedChildren.length + selectedCharacters.length;
  const hasAnyItems = children.length > 0 || characters.length > 0;

  return (
    <View style={styles.container}>
      {/* Characters and Children List */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          {t('characters.select_children_and_characters') || 'Виберіть персонажів та дітей (до 5)'}
        </Text>
        
        {!hasAnyItems ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>{t('characters.no_characters')}</Text>
            <View style={styles.addButtonsContainer}>
              {onAddChild && (
                <TouchableOpacity 
                  style={styles.addButton}
                  onPress={onAddChild}
                >
                  <Ionicons name="add-circle" size={20} color={theme.colors.interactive.primary} />
                  <Text style={styles.addButtonText}>Додати дитину</Text>
                </TouchableOpacity>
              )}
              {onAddCharacter && (
                <TouchableOpacity 
                  style={styles.addButton}
                  onPress={onAddCharacter}
                >
                  <Ionicons name="add-circle" size={20} color={theme.colors.interactive.primary} />
                  <Text style={styles.addButtonText}>{t('characters.add_character')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.charactersList}>
            {allItems.map((item) => {
              const isSelected = item.isChild 
                ? selectedChildren.includes(item.id)
                : selectedCharacters.includes(item.id);
              const isDisabled = !isSelected && totalSelected >= 5;
              
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.characterItem,
                    isSelected && styles.characterItemSelected,
                    isDisabled && styles.characterItemDisabled
                  ]}
                  onPress={() => !isDisabled && toggleItem(item)}
                  disabled={isDisabled}
                  activeOpacity={0.7}
                >
                  <View style={styles.characterLeft}>
                    <Text style={styles.characterIcon}>
                      {item.icon}
                    </Text>
                    <View>
                      <Text style={[
                        styles.characterName,
                        isDisabled && styles.characterNameDisabled
                      ]}>
                        {item.name}
                      </Text>
                      <Text style={styles.characterType}>
                        {item.badge}
                      </Text>
                    </View>
                  </View>
                  <View style={[
                    styles.checkbox,
                    isSelected && styles.checkboxSelected
                  ]}>
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
  addButtonsContainer: {
    flexDirection: 'row',
    gap: theme.spacing[4],
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  addButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
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
