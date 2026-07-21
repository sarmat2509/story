import React, { useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { theme } from '@/theme';
import { useCharacterGenerationUsage, useCharacters, useDeleteCharacter } from '@/api/characters';
import { CharacterCard } from './components/CharacterCard';
import { CharacterFormModal } from '@/components/CharacterFormModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { AnimatedSection } from '@/components/AnimatedSection';
import { AppButton } from '@/components/AppButton';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { useAuthStore } from '@/store/authStore';

const cardDelay = (i: number) => Math.min(i * 40, 320);
import { CharacterSubtype, ReferencePhoto } from '@wondertales/shared';
import type { MainDrawerParamList } from '@/types/navigation';

function useColumns(): number {
  const { width } = useWindowDimensions();
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  return 2;
}

export default function CharactersScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { width } = useWindowDimensions();
  const enterKey = useScreenEnter();
  const sessionMode = useAuthStore((state) => state.sessionMode);
  const userStoryCreationMode = useAuthStore((state) => state.user?.mode);
  const activeChildStoryCreationMode = useAuthStore(
    (state) => state.activeChild?.storyCreationMode
  );
  const isChildSession = sessionMode === 'child';
  const storyCreationMode =
    (isChildSession ? activeChildStoryCreationMode : undefined) ||
    userStoryCreationMode ||
    'instant';
  const canAddCharacter = storyCreationMode !== 'instant';
  const { data: characters, isLoading, error } = useCharacters();
  const { data: characterUsage } = useCharacterGenerationUsage(!isChildSession && canAddCharacter);
  const columns = useColumns();
  const paddingHorizontal = theme.spacing[6] * 2;
  const gap = theme.spacing[4];
  const cardWidth = (width - paddingHorizontal - gap * (columns - 1)) / columns;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<
    | {
        id: string;
        name: string;
        childProfileId?: string | null;
        type: 'person' | 'animal' | 'imaginary';
        subtype?: CharacterSubtype | null;
        description?: string;
        descriptionLanguage?: string;
        referencePhotos?: ReferencePhoto[];
        appearanceTraits?: any;
        personality?: any;
        turnaroundSheet?: { url: string; frontUrl?: string; generatedAt: string };
      }
    | undefined
  >();

  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<{ id: string; name: string } | null>(
    null
  );
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const deleteCharacter = useDeleteCharacter();
  const characterQuotaExhausted =
    !!characterUsage && characterUsage.limit >= 0 && characterUsage.remaining <= 0;
  const characterQuotaText = characterUsage
    ? characterQuotaExhausted
      ? t('characters.character_quota_exhausted')
      : t('characters.character_quota_remaining', { remaining: characterUsage.remaining })
    : null;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: isChildSession
        ? undefined
        : () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [isChildSession, navigation]);

  const handleAddCharacter = () => {
    if (!canAddCharacter || characterQuotaExhausted) {
      return;
    }
    setEditingCharacter(undefined);
    setIsModalVisible(true);
  };

  const handleEditCharacter = (character: any) => {
    setEditingCharacter({
      id: character.id,
      name: character.name,
      childProfileId: character.childProfileId ?? null,
      type: character.type,
      subtype: character.subtype,
      description: character.description,
      descriptionLanguage: character.descriptionLanguage,
      referencePhotos: character.referencePhotos || [],
      appearanceTraits: character.appearanceTraits,
      personality: character.personality,
      turnaroundSheet: character.turnaroundSheet || undefined,
    });
    setIsModalVisible(true);
  };

  const handleDelete = (characterId: string, characterName: string) => {
    setCharacterToDelete({ id: characterId, name: characterName });
    setDeleteDialogVisible(true);
  };

  const confirmDelete = () => {
    if (characterToDelete) {
      deleteCharacter.mutate(characterToDelete.id);
      setDeleteDialogVisible(false);
      setCharacterToDelete(null);
    }
  };

  const cancelDelete = () => {
    setDeleteDialogVisible(false);
    setCharacterToDelete(null);
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer} testID="characters-screen">
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer} testID="characters-screen">
        <Text style={styles.errorText}>Failed to load characters</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="characters-screen">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Characters Grid */}
        {characters && characters.length > 0 ? (
          <>
            <View
              style={[
                styles.grid,
                Platform.OS === 'web' &&
                  ({ gridTemplateColumns: `repeat(${columns}, 1fr)` } as any),
              ]}
            >
              {characters.map((character, index) => {
                const card = (
                  <CharacterCard
                    character={character}
                    onPress={() => {
                      if (canAddCharacter && character.isOwned !== false) {
                        handleEditCharacter(character);
                      }
                    }}
                    onDelete={isChildSession ? undefined : handleDelete}
                  />
                );
                return Platform.OS === 'web' ? (
                  <AnimatedSection key={character.id} delay={cardDelay(index)} trigger={enterKey}>
                    {card}
                  </AnimatedSection>
                ) : (
                  <AnimatedSection
                    key={character.id}
                    delay={cardDelay(index)}
                    trigger={enterKey}
                    style={{ width: cardWidth }}
                  >
                    {card}
                  </AnimatedSection>
                );
              })}
            </View>

            {canAddCharacter && (
              <AnimatedSection delay={cardDelay(characters.length)} trigger={enterKey}>
                <AppButton
                  label={t('characters.add_character')}
                  onPress={handleAddCharacter}
                  leading={
                    <Ionicons name="add-circle" size={24} color={theme.colors.text.inverse} />
                  }
                  disabled={characterQuotaExhausted}
                  style={styles.addCharacterAction}
                  testID="characters-add"
                />
                {characterQuotaText && (
                  <Text style={styles.characterQuotaText}>{characterQuotaText}</Text>
                )}
              </AnimatedSection>
            )}
          </>
        ) : (
          <AnimatedSection delay={80} trigger={enterKey}>
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>{t('characters.no_characters')}</Text>
              <Text style={styles.emptyHint}>
                {t(
                  canAddCharacter
                    ? 'characters.no_characters_hint'
                    : 'characters.no_characters_instant_hint'
                )}
              </Text>
              {canAddCharacter && (
                <>
                  <AppButton
                    label={t('characters.add_character')}
                    onPress={handleAddCharacter}
                    disabled={characterQuotaExhausted}
                    style={styles.emptyAction}
                    testID="characters-add"
                  />
                  {characterQuotaText && (
                    <Text style={styles.emptyQuotaText}>{characterQuotaText}</Text>
                  )}
                </>
              )}
            </View>
          </AnimatedSection>
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

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        visible={deleteDialogVisible}
        title={t('characters.delete_confirm_title')}
        message={t('characters.delete_confirm_message', { name: characterToDelete?.name || '' })}
        confirmText={t('characters.delete')}
        cancelText={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        variant="danger"
      />

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="characters"
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
  },
  scrollContent: {
    padding: theme.spacing[6],
    minHeight: '100%',
    backgroundColor: theme.colors.background.secondary,
  },
  addCharacterAction: {
    marginTop: theme.spacing[6],
  },
  characterQuotaText: {
    marginTop: theme.spacing[2],
    textAlign: 'center',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  grid: Platform.select({
    web: {
      display: 'grid' as any,
      gap: theme.spacing[4],
    },
    default: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: theme.spacing[4],
    },
  }),
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
  emptyAction: {},
  emptyQuotaText: {
    marginTop: theme.spacing[2],
    textAlign: 'center',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.status.error,
  },
});
