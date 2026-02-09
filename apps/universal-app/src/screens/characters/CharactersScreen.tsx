import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { useCharacters } from '@/api/characters';
import { CharacterCard } from './components/CharacterCard';
import { CharacterFormModal } from '@/components/CharacterFormModal';
import { ReferencePhoto } from '@kazka/shared';

export default function CharactersScreen() {
  const { t } = useTranslation();
  const { data: characters, isLoading, error } = useCharacters();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<{
    id: string;
    name: string;
    type: 'pet' | 'family_member' | 'friend' | 'neighbor' | 'imaginary_friend';
    description?: string;
    referencePhotos?: ReferencePhoto[];
    appearanceTraits?: any;
    personality?: any;
  } | undefined>();
  
  const handleAddCharacter = () => {
    setEditingCharacter(undefined);
    setIsModalVisible(true);
  };
  
  const handleEditCharacter = (character: any) => {
    setEditingCharacter({
      id: character.id,
      name: character.name,
      type: character.type,
      description: character.description,
      referencePhotos: character.referencePhotos || [],
      appearanceTraits: character.appearanceTraits,
      personality: character.personality,
    });
    setIsModalVisible(true);
  };
  
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
      </View>
    );
  }
  
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load characters</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Characters Grid */}
        {characters && characters.length > 0 ? (
          <>
            <View style={styles.grid}>
              {characters.map((character) => (
                <CharacterCard 
                  key={character.id}
                  character={character}
                  onPress={() => handleEditCharacter(character)}
                />
              ))}
            </View>
            
            {/* Add Character Button */}
            <TouchableOpacity 
              style={styles.addCharacterButton}
              onPress={handleAddCharacter}
            >
              <Ionicons name="add-circle" size={24} color={theme.colors.text.inverse} />
              <Text style={styles.addCharacterButtonText}>
                {t('characters.add_character')}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>{t('characters.no_characters')}</Text>
            <Text style={styles.emptyHint}>{t('characters.no_characters_hint')}</Text>
            <TouchableOpacity 
              style={styles.emptyButton}
              onPress={handleAddCharacter}
            >
              <Text style={styles.emptyButtonText}>{t('characters.add_character')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Character Form Modal */}
      <CharacterFormModal
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
          setEditingCharacter(undefined);
        }}
        characterId={editingCharacter?.id}
        initialData={editingCharacter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.primary,
  },
  scrollContent: {
    padding: theme.spacing[6],
    minHeight: '100%',
  },
  addCharacterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
    marginTop: theme.spacing[6],
    gap: theme.spacing[2],
  },
  addCharacterButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[4],
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing[10],
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: theme.spacing[4],
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  emptyHint: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[6],
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
  },
  emptyButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.status.error,
  },
});
