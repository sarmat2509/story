import React, { useEffect, useMemo, useState } from 'react';
import { NavigationProp, useNavigation, useRoute } from '@react-navigation/native';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { stripCharacterIdFromName } from '@wondertales/shared';
import { useAdminDirectorScenes, useAdminRegenerateSceneImage } from '@/admin/api/admin';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';
import { formatAssetUrl } from '@/utils/assetUrl';

function toLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toUpperCase();
}

function scrollToAnchor(anchorId: string) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function splitCharacterNameAndId(rawName: unknown): { displayName: string; characterId: string | null } {
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    return { displayName: '', characterId: null };
  }

  const match = rawName.match(/\[ID:\s*([^\]]+)\]/i);
  return {
    displayName: stripCharacterIdFromName(rawName).trim(),
    characterId: match?.[1]?.trim() ?? null,
  };
}

function renderCharacterCards(
  characters: unknown[],
  keyPrefix: string,
  options?: {
    selectedOutfitId?: string | null;
    onOutfitPress?: (outfitId: string) => void;
  },
): React.ReactNode {
  return (
    <View style={styles.characterCardsRow}>
      {characters.map((character, index) => {
        const entries =
          character && typeof character === 'object' && !Array.isArray(character)
            ? Object.entries(character as Record<string, unknown>)
            : [['value', character]];
        const { displayName, characterId } = splitCharacterNameAndId(
          (character as Record<string, unknown>)?.name,
        );

        return (
          <View key={`${keyPrefix}-${index}`} style={styles.characterCard}>
            <View style={styles.characterCardTitleWrap}>
              <Text style={styles.characterCardTitle}>
                {(displayName || `CHARACTER ${index + 1}`).toUpperCase()}
              </Text>
              {characterId ? <Text style={styles.characterCardId}>ID: {characterId}</Text> : null}
            </View>
            <View style={styles.valueGroup}>
              {entries
                .filter(([key]) => key !== 'name')
                .map(([key, entry]) => (
                <View key={`${keyPrefix}-${index}-${key}`} style={styles.valueRow}>
                  <Text style={styles.valueKey}>{toLabel(String(key))}</Text>
                  {key === 'outfitId' && typeof entry === 'string' ? (
                    <TouchableOpacity
                      onPress={() => {
                        options?.onOutfitPress?.(entry);
                      }}
                    >
                      <Text style={entry === options?.selectedOutfitId ? styles.linkTextActive : styles.linkText}>
                        {entry}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    renderStructuredValue(entry, `${keyPrefix}-${index}-${key}`)
                  )}
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function renderStructuredValue(value: unknown, keyPrefix: string = 'root'): React.ReactNode {
  if (value == null) {
    return <Text style={styles.valueText}>n/a</Text>;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <Text style={styles.valueText}>{String(value)}</Text>;
  }

  if (Array.isArray(value)) {
    const shouldRenderCharactersAsCards =
      keyPrefix.toLowerCase().includes('characters') &&
      value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));

    if (shouldRenderCharactersAsCards) {
      return renderCharacterCards(value, keyPrefix);
    }

    return (
      <View style={styles.valueGroup}>
        {value.map((entry, index) => (
          <View key={`${keyPrefix}-${index}`} style={styles.valueRow}>
            <Text style={styles.valueKey}>{`${toLabel(String(index + 1))}`}</Text>
            {renderStructuredValue(entry, `${keyPrefix}-${index}`)}
          </View>
        ))}
      </View>
    );
  }

  if (typeof value === 'object') {
    return (
      <View style={styles.valueGroup}>
        {Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
          <View key={`${keyPrefix}-${key}`} style={styles.valueRow}>
            <Text style={styles.valueKey}>{toLabel(key)}</Text>
            {renderStructuredValue(entry, `${keyPrefix}-${key}`)}
          </View>
        ))}
      </View>
    );
  }

  return <Text style={styles.valueText}>{String(value)}</Text>;
}

function renderSceneVisual(
  sceneVisual: unknown,
  options?: {
    selectedOutfitId?: string | null;
    onOutfitPress?: (outfitId: string) => void;
  },
): React.ReactNode {
  if (!sceneVisual || typeof sceneVisual !== 'object') {
    return <Text style={styles.metaText}>n/a</Text>;
  }

  const scene = sceneVisual as Record<string, unknown>;
  const cameraComposition =
    scene.cameraComposition && typeof scene.cameraComposition === 'object'
      ? (scene.cameraComposition as Record<string, unknown>)
      : null;

  return (
    <View style={styles.sceneVisualSections}>
      <View style={styles.sceneVisualTopRow}>
        <View style={[styles.sceneVisualBlock, styles.sceneVisualColumn]}>
          <View style={styles.sceneVisualHeading}>
            <Ionicons name="image-outline" size={16} color={theme.colors.interactive.primary} />
            <Text style={styles.sceneVisualHeadingText}>SETTING</Text>
          </View>
          {renderStructuredValue(scene.setting, 'sceneVisual-setting')}
        </View>

        <View style={[styles.sceneVisualBlock, styles.sceneVisualColumn]}>
          <View style={styles.sceneVisualHeading}>
            <Ionicons name="sunny-outline" size={16} color={theme.colors.interactive.primary} />
            <Text style={styles.sceneVisualHeadingText}>LIGHTING</Text>
          </View>
          {renderStructuredValue(scene.lighting, 'sceneVisual-lighting')}
        </View>
      </View>

      <View style={styles.sceneDivider} />

      <View style={styles.sceneVisualBlock}>
        <View style={styles.sceneVisualHeading}>
          <Ionicons name="camera-outline" size={16} color={theme.colors.interactive.primary} />
          <Text style={styles.sceneVisualHeadingText}>CAMERA COMPOSITION</Text>
        </View>
        {cameraComposition?.shot !== undefined ? (
          <View style={styles.valueRow}>
            <Text style={styles.valueKey}>SHOT</Text>
            {renderStructuredValue(cameraComposition.shot, 'sceneVisual-camera-shot')}
          </View>
        ) : (
          <Text style={styles.metaText}>n/a</Text>
        )}
        {Array.isArray(cameraComposition?.characters) && cameraComposition.characters.length > 0 ? (
          <View style={styles.valueRow}>
            <Text style={styles.valueKey}>CHARACTERS</Text>
            {renderCharacterCards(cameraComposition.characters, 'sceneVisual-camera-characters', options)}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function AdminScenesScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const route = useRoute<any>();
  const routeStoryId = route.params?.storyId as string | undefined;
  const scenesQuery = useAdminDirectorScenes(routeStoryId);
  const regenerateMutation = useAdminRegenerateSceneImage();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedEnvironmentId(null);
    setSelectedOutfitId(null);
  }, [routeStoryId]);
  const storyScenes = useMemo(() => scenesQuery.data?.storyScenes ?? [], [scenesQuery.data?.storyScenes]);
  const directorScenes = useMemo(() => scenesQuery.data?.items ?? [], [scenesQuery.data?.items]);
  const directorSceneByIndex = useMemo(
    () => new Map(directorScenes.map((item) => [item.sceneIndex, item])),
    [directorScenes],
  );
  const scenes = useMemo(
    () =>
      storyScenes.map((scene) => {
        const directorScene = directorSceneByIndex.get(scene.sceneIndex);
        return {
          sceneIndex: scene.sceneIndex,
          storyText: scene.storyText,
          directorScene,
        };
      }),
    [directorSceneByIndex, storyScenes],
  );
  const storyMeta = scenesQuery.data?.story;
  const validations = useMemo(() => scenesQuery.data?.validations ?? [], [scenesQuery.data?.validations]);
  const validationsBySceneIndex = useMemo(() => {
    const map = new Map<number, typeof validations>();
    for (const item of validations) {
      const list = map.get(item.sceneIndex) ?? [];
      list.push(item);
      map.set(item.sceneIndex, list);
    }
    return map;
  }, [validations]);
  const cost = scenesQuery.data?.cost;
  const environments = useMemo(() => scenesQuery.data?.environments ?? [], [scenesQuery.data?.environments]);
  const outfits = useMemo(() => scenesQuery.data?.outfits ?? [], [scenesQuery.data?.outfits]);

  return (
    <AdminLayout
      navigation={navigation}
      activeRoute="AdminStories"
      title="Admin / Story"
      panelStyle={styles.snapshotPanel}
    >
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Story article</Text>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => navigation.navigate('AdminStories')}
          >
            <Text style={styles.clearButtonText}>Back to stories</Text>
          </TouchableOpacity>
        </View>
        {storyMeta?.title ? <Text style={styles.storyTitle}>{storyMeta.title}</Text> : null}
        {routeStoryId ? <Text style={styles.selectedMeta}>{routeStoryId}</Text> : null}
        {!routeStoryId ? <Text style={styles.helperText}>Open this page from the stories table.</Text> : null}
        {scenesQuery.isLoading ? <AdminLoadingState /> : null}
        {scenesQuery.error ? <AdminErrorState message={(scenesQuery.error as Error).message} /> : null}
        {routeStoryId && !scenesQuery.isLoading && !scenesQuery.error ? (
          scenes.length > 0 ? (
            <View style={styles.cardGrid}>
              {scenes.map((item) => (
                <View key={item.sceneIndex} style={styles.sceneCard}>
                  <View style={styles.sceneCardHeader}>
                    <Text style={styles.sceneCardTitle}>SCENE {item.sceneIndex}</Text>
                    <View style={styles.sceneCardHeaderActions}>
                      {item.directorScene?.environmentId ? (
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedEnvironmentId(item.directorScene?.environmentId ?? null);
                            scrollToAnchor('admin-environments-section');
                          }}
                        >
                          <Text style={item.directorScene.environmentId === selectedEnvironmentId ? styles.linkTextActive : styles.linkText}>
                            {item.directorScene.environmentId}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.metaText}>n/a</Text>
                      )}
                      {routeStoryId ? (
                        <TouchableOpacity
                          style={styles.sceneActionButton}
                          disabled={
                            regenerateMutation.isPending &&
                            regenerateMutation.variables?.storyId === routeStoryId &&
                            regenerateMutation.variables?.sceneId === item.sceneIndex
                          }
                          onPress={() =>
                            regenerateMutation.mutate({
                              storyId: routeStoryId,
                              sceneId: item.sceneIndex,
                            })
                          }
                        >
                          <Text style={styles.sceneActionButtonText}>
                            {regenerateMutation.isPending &&
                            regenerateMutation.variables?.storyId === routeStoryId &&
                            regenerateMutation.variables?.sceneId === item.sceneIndex
                              ? 'Queueing...'
                              : 'Regenerate image'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.sceneSection}>
                    <View style={styles.storyTextBlock}>
                      <View style={styles.storyTextHeading}>
                        <Ionicons name="book-outline" size={16} color={theme.colors.interactive.primary} />
                      <Text style={styles.sceneVisualHeadingText}>STORY TEXT</Text>
                      </View>
                      <Text style={styles.storyTextBody}>{item.storyText || 'n/a'}</Text>
                    </View>

                    {item.directorScene ? (
                      <>
                        <View style={styles.sceneDivider} />

                        {renderSceneVisual(item.directorScene.sceneVisual, {
                          selectedOutfitId,
                          onOutfitPress: (outfitId) => {
                            setSelectedOutfitId(outfitId);
                            scrollToAnchor('admin-outfits-section');
                          },
                        })}

                        <View style={styles.sceneDivider} />
                      </>
                    ) : null}

                    <View style={styles.validationBlock}>
                      <View style={styles.storyTextHeading}>
                        <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.interactive.primary} />
                        <Text style={styles.sceneVisualHeadingText}>VALIDATIONS</Text>
                      </View>
                      {(validationsBySceneIndex.get(item.sceneIndex) ?? []).length > 0 ? (
                        <View style={styles.validationList}>
                          {(validationsBySceneIndex.get(item.sceneIndex) ?? []).map((validation) => (
                            <TouchableOpacity
                              key={validation.id}
                              style={styles.validationCard}
                              onPress={() => navigation.navigate('AdminValidationDetail', { id: validation.id })}
                            >
                              <View style={styles.validationCardHeader}>
                                <Text style={styles.validationCardTitle}>
                                  Attempt {validation.attempt}
                                </Text>
                                <Text style={styles.validationScore}>
                                  {validation.validationScore}/100
                                </Text>
                              </View>
                              <View style={styles.validationMetaRow}>
                                <Text style={styles.validationMetaText}>{validation.visionModel ?? 'n/a'}</Text>
                                <Text style={styles.validationMetaText}>
                                  {new Date(validation.createdAt).toLocaleString()}
                                </Text>
                              </View>
                              <Text style={styles.validationLink}>Open validation</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.helperText}>No validations found for this scene.</Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.helperText}>No scenes found for this story.</Text>
          )
        ) : null}
      </View>
      {routeStoryId && !scenesQuery.isLoading && !scenesQuery.error ? (
        <>
          <View style={styles.section} nativeID="admin-environments-section">
            <Text style={styles.sectionTitle}>Environments</Text>
            {environments.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.referenceRow}
              >
                {environments.map((environment) => (
                  <View
                    key={environment.id}
                    style={[
                      styles.referenceCard,
                      styles.environmentCard,
                      environment.id === selectedEnvironmentId && styles.referenceCardActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.referenceCardId,
                        environment.id === selectedEnvironmentId && styles.referenceCardIdActive,
                      ]}
                    >
                      {environment.id}
                    </Text>
                    {environment.imageUrl ? (
                      <Image
                        source={{ uri: formatAssetUrl(environment.imageUrl) ?? environment.imageUrl }}
                        style={styles.environmentImage}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text style={styles.referenceCardTitle}>{environment.name ?? 'n/a'}</Text>
                    <Text style={styles.referenceCardBody}>{environment.description ?? 'n/a'}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.helperText}>No environments found for this story.</Text>
            )}
          </View>
          <View style={styles.section} nativeID="admin-outfits-section">
            <Text style={styles.sectionTitle}>Outfits</Text>
            {outfits.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.referenceRow}
              >
                {outfits.map((outfit) => (
                  <View
                    key={outfit.id}
                    style={[
                      styles.referenceCard,
                      styles.outfitCard,
                      outfit.id === selectedOutfitId && styles.referenceCardActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.referenceCardId,
                        outfit.id === selectedOutfitId && styles.referenceCardIdActive,
                      ]}
                    >
                      {outfit.id}
                    </Text>
                    {outfit.imageUrl ? (
                      <Image
                        source={{ uri: formatAssetUrl(outfit.imageUrl) ?? outfit.imageUrl }}
                        style={styles.outfitImage}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text style={styles.referenceCardTitle}>{outfit.characterName ?? 'n/a'}</Text>
                    <Text style={styles.referenceCardBody}>{outfit.description ?? 'n/a'}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.helperText}>No outfits found for this story.</Text>
            )}
          </View>
        </>
      ) : null}
      {routeStoryId && !scenesQuery.isLoading && !scenesQuery.error ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cost breakdown</Text>
          {cost ? (
            <View style={styles.costCard}>
              <View style={styles.costTotalRow}>
                <Text style={styles.costTotalLabel}>TOTAL COST</Text>
                <Text style={styles.costTotalValue}>${cost.costUsd.toFixed(6)}</Text>
              </View>
              <Text style={styles.helperText}>
                Cache hits: {cost.cacheStats.cacheHitCount} calls, cached input: {cost.cacheStats.totalCachedInputUnits.toLocaleString()} tokens
              </Text>
              {cost.breakdown.length > 0 ? (
                <View style={styles.costBreakdownList}>
                  {cost.breakdown.map((item, index) => (
                    <View key={`${item.provider}-${item.operation}-${item.model ?? 'na'}-${index}`} style={styles.costBreakdownRow}>
                      <View style={styles.costBreakdownMain}>
                        <Text style={styles.costBreakdownOperation}>{item.operation}</Text>
                        <Text style={styles.costBreakdownMeta}>
                          {item.provider}{item.model ? ` / ${item.model}` : ''}
                        </Text>
                        <Text style={styles.costBreakdownMeta}>
                          {new Date(item.createdAt).toLocaleString()}
                        </Text>
                      </View>
                      <Text style={styles.costBreakdownValue}>${item.costUsd.toFixed(6)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.helperText}>No AI cost records found for this story.</Text>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  helperText: {
    fontSize: 15,
    color: theme.colors.text.secondary,
  },
  selectedMeta: {
    fontSize: 15,
    color: theme.colors.text.secondary,
  },
  storyTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  snapshotPanel: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    gap: 28,
  },
  clearButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.secondary,
  },
  clearButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  cardGrid: {
    gap: 20,
  },
  sceneCard: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 20,
    padding: 24,
    backgroundColor: theme.colors.background.primary,
    gap: 20,
  },
  sceneCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  sceneCardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  sceneActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.primary,
  },
  sceneActionButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '700',
    fontSize: 13,
  },
  sceneCardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  sceneSection: {
    gap: 16,
  },
  storyTextBlock: {
    gap: 12,
  },
  storyTextHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  validationBlock: {
    gap: 12,
  },
  validationList: {
    gap: 12,
  },
  validationCard: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 16,
    padding: 16,
    backgroundColor: theme.colors.background.secondary,
    gap: 8,
  },
  validationCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  validationCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  validationScore: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.interactive.primary,
  },
  validationMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  validationMetaText: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  validationLink: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.interactive.primary,
    textDecorationLine: 'underline',
  },
  storyTextBody: {
    fontSize: 16,
    lineHeight: 26,
    color: theme.colors.text.primary,
  },
  linkText: {
    fontSize: 14,
    color: theme.colors.interactive.primary,
    textDecorationLine: 'underline',
  },
  linkTextActive: {
    fontSize: 14,
    color: theme.colors.interactive.primary,
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  metaText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  referenceCard: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 18,
    padding: 18,
    backgroundColor: theme.colors.background.secondary,
    gap: 12,
  },
  referenceRow: {
    gap: 12,
    paddingRight: 8,
  },
  environmentCard: {
    width: 360,
    flexShrink: 0,
  },
  outfitCard: {
    width: 300,
    flexShrink: 0,
  },
  referenceCardActive: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  referenceCardId: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.interactive.primary,
  },
  referenceCardIdActive: {
    color: theme.colors.interactive.primaryActive,
  },
  referenceCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  referenceCardBody: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.text.secondary,
  },
  environmentImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: theme.colors.background.primary,
  },
  outfitImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: theme.colors.background.primary,
  },
  characterCardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  characterCard: {
    minWidth: 260,
    maxWidth: 360,
    flexGrow: 1,
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    gap: 10,
  },
  characterCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.interactive.primary,
    letterSpacing: 0.4,
  },
  characterCardTitleWrap: {
    gap: 4,
  },
  characterCardId: {
    fontSize: 11,
    lineHeight: 15,
    color: theme.colors.text.secondary,
    fontWeight: '600',
  },
  sceneVisualSections: {
    gap: 18,
  },
  sceneVisualTopRow: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  sceneVisualBlock: {
    gap: 12,
  },
  sceneVisualColumn: {
    flex: 1,
    minWidth: 260,
  },
  sceneVisualHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sceneVisualHeadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0.4,
  },
  sceneDivider: {
    height: 1,
    backgroundColor: theme.colors.border.light,
  },
  valueGroup: {
    gap: 12,
  },
  valueRow: {
    gap: 6,
  },
  valueKey: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0.4,
  },
  valueText: {
    fontSize: 15,
    color: theme.colors.text.primary,
    lineHeight: 23,
  },
  costCard: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 18,
    padding: 20,
    backgroundColor: theme.colors.background.primary,
    gap: 14,
  },
  costTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  costTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0.4,
  },
  costTotalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  costBreakdownList: {
    gap: 12,
  },
  costBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
  },
  costBreakdownMain: {
    flex: 1,
    gap: 4,
  },
  costBreakdownOperation: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  costBreakdownMeta: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  costBreakdownValue: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
});
