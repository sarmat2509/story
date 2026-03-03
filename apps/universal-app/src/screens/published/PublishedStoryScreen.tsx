import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { usePublishedStory } from '@/api/stories';
import { useAuthStore } from '@/store/authStore';
import { useResponsive } from '@/hooks/useResponsive';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import { Ionicons } from '@expo/vector-icons';
import { PublishedStoryCta } from '@/components/PublishedStoryCta';
import AudioPlayer from '@/components/AudioPlayer';
import { navigateToStory } from '@/navigation/navigationRef';
import type { MainDrawerParamList } from '@/types/navigation';

type RouteProps = RouteProp<MainDrawerParamList, 'PublishedStory'>;

export default function PublishedStoryScreen() {
  const route = useRoute<RouteProps>();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { isDesktop, isTabletLandscape } = useResponsive();
  const slug = route.params?.slug ?? '';

  const useDesktopLayout = isDesktop || isTabletLandscape;

  const { data: story, isLoading, error } = usePublishedStory(slug);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error || !story) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('common.error')}</Text>
        <Text style={styles.errorMessage}>
          {error ? (error as Error).message : t('library.empty')}
        </Text>
      </View>
    );
  }

  const publishedAt = story.publishedAt
    ? new Date(story.publishedAt).toLocaleDateString('uk-UA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';
  const duration = (story.audioMetadata as any)?.totalDuration ?? 0;

  const isOwner = !!(story as any)?.isOwner;

  const renderMainContent = () => (
    <>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{story.title}</Text>
            <Text style={styles.meta}>
              {story.authorDisplayName || 'Anonymous'} · {publishedAt}
            </Text>
          </View>
          {useDesktopLayout ? null : isAuthenticated && isOwner && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigateToStory(story.id)}
            >
              <Ionicons name="pencil-outline" size={20} color={theme.colors.interactive.primary} />
              <Text style={styles.editButtonText}>{t('common.edit')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {story.audioUrl && (
        <View style={styles.audioSection}>
          <AudioPlayer
            storyId={story.id}
            audioUrl={story.audioUrl}
            duration={typeof duration === 'number' ? duration : 0}
            title={story.title}
          />
        </View>
      )}

      <View style={styles.scenesSection}>
        {(story.scenes ?? []).map((scene: any, index: number) => {
          const imgUrl = scene.imageUrl ? formatAssetUrl(scene.imageUrl) : null;
          return (
            <View key={scene.sceneId ?? index} style={styles.scene}>
              {imgUrl && (
                <Image
                  source={{ uri: imgUrl }}
                  style={styles.sceneImage}
                  resizeMode="cover"
                />
              )}
              <Text style={styles.sceneText}>{scene.text || ''}</Text>
            </View>
          );
        })}
      </View>

      {!useDesktopLayout && <PublishedStoryCta slug={slug} isAuthenticated={!!isAuthenticated} />}
    </>
  );

  const renderRightColumn = () => {
    if (isAuthenticated && isOwner) {
      return (
        <TouchableOpacity
          style={styles.editButtonSidebar}
          onPress={() => navigateToStory(story.id)}
        >
          <Ionicons name="pencil-outline" size={20} color={theme.colors.interactive.primary} />
          <Text style={styles.editButtonText}>{t('common.edit')}</Text>
        </TouchableOpacity>
      );
    }
    if (!isAuthenticated) {
      return <PublishedStoryCta slug={slug} isAuthenticated={false} inSidebar />;
    }
    return null;
  };

  if (useDesktopLayout) {
    return (
      <View style={styles.container}>
        <View style={styles.desktopLayout}>
          <ScrollView style={styles.leftColumn} contentContainerStyle={styles.leftColumnContent}>
            <View style={styles.contentWrapper}>{renderMainContent()}</View>
          </ScrollView>
          <View style={styles.rightColumn}>
            <View style={styles.sidebar}>{renderRightColumn()}</View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.contentWrapper}>{renderMainContent()}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  content: {
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[12],
    alignItems: 'center',
  },
  contentWrapper: {
    maxWidth: 1400,
    width: '100%',
    alignSelf: 'center',
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
  header: {
    marginBottom: theme.spacing[6],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing[4],
  },
  headerText: {
    flex: 1,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.background.primary,
  },
  editButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.interactive.primary,
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  meta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
  },
  audioSection: {
    marginBottom: theme.spacing[6],
  },
  scenesSection: {
    gap: theme.spacing[6],
  },
  scene: {
    marginBottom: theme.spacing[6],
  },
  sceneImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: theme.borders.radius.lg,
    marginBottom: theme.spacing[3],
  },
  sceneText: {
    fontSize: theme.typography.fontSize.lg,
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.lg,
    color: theme.colors.text.primary,
  },
  // Desktop: Two Column Layout
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
    maxWidth: 1400,
    alignSelf: 'center',
    width: '100%',
  },
  leftColumn: {
    flex: 1,
  },
  leftColumnContent: {
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[12],
    alignItems: 'center',
  },
  rightColumn: {
    width: theme.layout.sidebar.widthFixed,
    paddingLeft: theme.spacing[6],
    paddingRight: theme.spacing[6],
    paddingVertical: theme.spacing[6],
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border.light,
  },
  sidebar: {
    // @ts-ignore - position: sticky is web-only
    position: 'sticky',
    top: theme.spacing[6],
  },
  editButtonSidebar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.background.primary,
  },
});
