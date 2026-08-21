import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCollectedArtifacts, type CollectedStoryArtifactApi } from '@/api/artifacts';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import type { MainDrawerParamList } from '@/types/navigation';

const cardDelay = (i: number) => Math.min(i * 35, 260);
const ARTIFACT_TILE_SIZE = 150;

export function ArtifactTile({
  item,
  onPress,
}: {
  item: CollectedStoryArtifactApi;
  onPress: (item: CollectedStoryArtifactApi) => void;
}) {
  const imageUrl = formatAssetUrl(
    item.artifact.thumbnailUrl || item.artifact.imageUrl || item.artifact.imagePath
  );
  const title = item.artifact.title;

  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={() => onPress(item)}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.imageFrame}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image as ImageStyle} resizeMode="cover" />
        ) : (
          <Ionicons name="sparkles-outline" size={48} color={theme.colors.text.tertiary} />
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function ArtifactsScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [selectedArtifact, setSelectedArtifact] = useState<CollectedStoryArtifactApi | null>(null);
  const { data: artifacts = [], isLoading, error } = useCollectedArtifacts({
    locale: i18n.language,
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['collected-artifacts'] });
    }, [queryClient])
  );

  const handleOpenArtifact = useCallback(
    (item: CollectedStoryArtifactApi) => {
      setSelectedArtifact(item);
    },
    []
  );

  const handleOpenStoryFromModal = useCallback(() => {
    if (!selectedArtifact) return;

    const storyId = selectedArtifact.story.id;
    setSelectedArtifact(null);
    navigation.navigate('Story', { storyId });
  }, [navigation, selectedArtifact]);

  const detailImageUrl = selectedArtifact
    ? formatAssetUrl(
        selectedArtifact.artifact.fullImageUrl ||
          selectedArtifact.artifact.imagePath ||
          selectedArtifact.artifact.imageUrl
      )
    : null;
  const detailImageSize = Math.min(width - theme.spacing[8], 520);

  if (isLoading) {
    return (
      <View style={styles.centerContainer} nativeID="tour-artifacts">
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer} nativeID="tour-artifacts">
        <Text style={styles.errorTitle}>{t('common.error')}</Text>
        <Text style={styles.errorMessage}>{(error as Error).message}</Text>
      </View>
    );
  }

  if (artifacts.length === 0) {
    return (
      <View style={styles.centerContainer} nativeID="tour-artifacts">
        <Ionicons name="sparkles-outline" size={48} color={theme.colors.text.tertiary} />
        <Text style={styles.emptyTitle}>{t('artifacts.empty_title')}</Text>
        <Text style={styles.emptySubtext}>{t('artifacts.empty_subtitle')}</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.grid}
        nativeID="tour-artifacts"
      >
        <View
          style={[
            styles.gridContainer,
            Platform.OS === 'web' &&
              ({ gridTemplateColumns: `repeat(auto-fill, ${ARTIFACT_TILE_SIZE}px)` } as any),
          ]}
        >
          {artifacts.map((item, index) => (
            <View
              key={item.id}
              style={[
                Platform.OS === 'web'
                  ? ({ animationDelay: `${cardDelay(index)}ms` } as any)
                  : styles.nativeTileSlot,
              ]}
            >
              <ArtifactTile item={item} onPress={handleOpenArtifact} />
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedArtifact)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedArtifact(null)}
      >
        <View style={styles.detailModalRoot}>
          <TouchableOpacity
            style={styles.detailModalBackdrop}
            activeOpacity={1}
            onPress={() => setSelectedArtifact(null)}
          />
          <View style={styles.detailModalCard}>
            <TouchableOpacity
              style={styles.detailModalClose}
              onPress={() => setSelectedArtifact(null)}
              accessibilityRole="button"
            >
              <Ionicons name="close-outline" size={24} color={theme.colors.text.secondary} />
            </TouchableOpacity>
            {detailImageUrl ? (
              <Image
                source={{ uri: detailImageUrl }}
                style={[
                  styles.detailImage as ImageStyle,
                  { width: detailImageSize, height: detailImageSize },
                ]}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.detailImageFallback,
                  { width: detailImageSize, height: detailImageSize },
                ]}
              >
                <Ionicons name="sparkles-outline" size={64} color={theme.colors.text.tertiary} />
              </View>
            )}
            {selectedArtifact ? (
              <>
                <Text style={styles.detailTitle}>
                  {selectedArtifact.artifact.title}
                </Text>
                <Text style={styles.detailSource}>
                  {(() => {
                    const storyTitle = selectedArtifact.story.title;
                    const sourceText = selectedArtifact.collectedByChild
                      ? t('artifacts.obtained_in_story_by_child', {
                          title: storyTitle,
                          childName: selectedArtifact.collectedByChild.name,
                        })
                      : t('artifacts.obtained_in_story', { title: storyTitle });
                    const titleStart = sourceText.indexOf(storyTitle);

                    if (titleStart < 0) {
                      return (
                        <Text style={styles.detailSourceLink} onPress={handleOpenStoryFromModal}>
                          {sourceText}
                        </Text>
                      );
                    }

                    return (
                      <>
                        {sourceText.slice(0, titleStart)}
                        <Text style={styles.detailSourceLink} onPress={handleOpenStoryFromModal}>
                          {storyTitle}
                        </Text>
                        {sourceText.slice(titleStart + storyTitle.length)}
                      </>
                    );
                  })()}
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  grid: {
    padding: theme.spacing[4],
  },
  gridContainer: Platform.select({
    web: {
      display: 'grid' as any,
      gap: theme.spacing[3],
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
    },
    default: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: theme.spacing[3],
    },
  }),
  nativeTileSlot: {
    width: ARTIFACT_TILE_SIZE,
    height: ARTIFACT_TILE_SIZE,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
    backgroundColor: theme.colors.background.primary,
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.status.error,
    marginBottom: theme.spacing[2],
  },
  errorMessage: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
  emptyTitle: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  emptySubtext: {
    maxWidth: 420,
    fontSize: theme.typography.fontSize.base,
    lineHeight: 22,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
  tile: {
    width: ARTIFACT_TILE_SIZE,
    height: ARTIFACT_TILE_SIZE,
    borderRadius: theme.borders.radius.lg,
    overflow: 'hidden',
  },
  imageFrame: {
    width: ARTIFACT_TILE_SIZE,
    height: ARTIFACT_TILE_SIZE,
    borderRadius: theme.borders.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: ARTIFACT_TILE_SIZE,
    height: ARTIFACT_TILE_SIZE,
    borderRadius: theme.borders.radius.lg,
  },
  detailModalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[4],
  },
  detailModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18, 12, 18, 0.46)',
  },
  detailModalCard: {
    width: '100%',
    maxWidth: 620,
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing[5],
    alignItems: 'center',
    shadowColor: theme.colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  detailModalClose: {
    position: 'absolute',
    top: theme.spacing[3],
    right: theme.spacing[3],
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.primary,
    zIndex: 1,
  },
  detailImage: {
    marginBottom: theme.spacing[4],
    borderRadius: theme.borders.radius.lg,
    overflow: 'hidden',
  },
  detailImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.primary,
  },
  detailTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  detailSource: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: 22,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  detailSourceLink: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
    textDecorationLine: 'underline',
  },
});
