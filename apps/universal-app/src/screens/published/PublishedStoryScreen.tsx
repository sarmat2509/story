import React, { useLayoutEffect, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  type ImageStyle,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { usePublicStory, usePublicStoryByToken } from '@/api/stories';
import { useAuthStore } from '@/store/authStore';
import { useResponsive } from '@/hooks/useResponsive';
import { useAudioPlayerStore } from '@/store/audioPlayerStore';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import { Ionicons } from '@expo/vector-icons';
import { PublishedStoryCta } from '@/components/PublishedStoryCta';
import { StoryRatingWidget } from '@/components/StoryRatingWidget';
import AudioPlayer from '@/components/AudioPlayer';
import { navigateToStory } from '@/navigation/navigationRef';
import { globalAudioService } from '@/services/globalAudioService';
import { audioPlaybackService } from '@/services/audioPlaybackService';
import { useAlignmentSync } from '@/hooks/useAlignmentSync';
import { getReadingTimeMinutes } from '@wondertales/shared';
import type { MainDrawerParamList } from '@/types/navigation';

const removeAudioTags = (text: string): string =>
  text.replace(/<[^>]+>/g, '').trim();

type RouteProps = RouteProp<MainDrawerParamList, 'PublishedStory' | 'UnlistedStory'>;

export default function PublishedStoryScreen() {
  const route = useRoute<RouteProps>();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { isDesktop, isTabletLandscape } = useResponsive();
  const slug = (route.params as any)?.slug ?? '';
  const token = (route.params as any)?.token ?? '';
  const useDesktopLayout = isDesktop || isTabletLandscape;
  const navigation = useNavigation();

  const publicQuery = usePublicStory(slug, !!slug && !token);
  const tokenQuery = usePublicStoryByToken(token, !!token);
  const activeQuery = token ? tokenQuery : publicQuery;
  const { data: story, isLoading, error, refetch } = activeQuery;

  useLayoutEffect(() => {
    if (story?.title) {
      navigation.setOptions({ title: story.title });
    }
  }, [navigation, story?.title]);

  // ── Audio + highlight state ────────────────────────────────────────────────
  // All hooks MUST come before any early returns (Rules of Hooks)
  const [isHighlightEnabled, setIsHighlightEnabled] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const activeStoryId = useAudioPlayerStore((s) => s.activeStoryId);
  const setViewingStoryId = useAudioPlayerStore((s) => s.setViewingStoryId);
  const isHighlightEnabledRef = useRef(false);
  const lastPositionUpdateTime = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const sceneRefs = useRef<Record<number, View | null>>({});

  const audioUrl = story?.audio?.url;
  const duration = story?.audio?.duration ?? 0;
  const alignment = (story?.audio as any)?.alignment ?? null;
  const hasAlignment = !!alignment;

  const isThisStoryActive = (story?.id ?? '') === activeStoryId;
  const effectiveHighlightEnabled = isHighlightEnabled && isThisStoryActive;

  useEffect(() => {
    isHighlightEnabledRef.current = effectiveHighlightEnabled;
  }, [effectiveHighlightEnabled]);

  // Track this story as the "viewing" one so MiniAudioPlayer can hide
  useEffect(() => {
    if (!story?.id) return;
    setViewingStoryId(story.id);
    return () => setViewingStoryId(null);
  }, [story?.id, setViewingStoryId]);

  const sceneTexts = useMemo(
    () => (story?.scenes ?? []).map((s: any) => removeAudioTags(s.text || '')),
    [story?.scenes],
  );

  const readingTimeMinutes = useMemo(
    () => getReadingTimeMinutes(story?.scenes ?? []),
    [story?.scenes],
  );

  const { activeSentenceIndex, activeWordIndex, sentences } = useAlignmentSync(
    story?.fullText || '',
    alignment,
    currentPosition,
    sceneTexts,
  );

  // Derive active scene from the active sentence
  const activeSceneIndex = activeSentenceIndex !== null
    ? (sentences[activeSentenceIndex]?.sceneIndex ?? null)
    : null;

  // Auto-scroll to the active scene when it changes (mirrors StoryViewerScreen)
  useEffect(() => {
    if (!effectiveHighlightEnabled || activeSceneIndex === null) return;
    const sceneElement = sceneRefs.current[activeSceneIndex];
    if (!sceneElement) return;

    if (Platform.OS === 'web') {
      const el = sceneElement as any;
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } else {
      sceneElement.measureLayout(
        scrollViewRef.current as any,
        (_x: number, y: number) => {
          scrollViewRef.current?.scrollTo({ y: y - 100, animated: true });
        },
        () => {},
      );
    }
  }, [activeSceneIndex, effectiveHighlightEnabled]);

  const handleActivate = useCallback(async () => {
    if (!audioUrl || !story) return;
    const initialHighlight = await audioPlaybackService.getHighlightEnabled();
    setIsHighlightEnabled(initialHighlight);
    await globalAudioService.loadAndPlay({
      storyId: story.id,
      storyTitle: story.title,
      audioUrl: formatAssetUrl(audioUrl) ?? audioUrl,
      duration,
      hasAlignment,
      initialPosition: 0,
      initialHighlightEnabled: initialHighlight,
      autoPlay: true,
    });
  }, [audioUrl, duration, hasAlignment, story]);

  const handleHighlightToggle = useCallback(async (enabled: boolean) => {
    setIsHighlightEnabled(enabled);
    await audioPlaybackService.saveHighlightEnabled(enabled);
    useAudioPlayerStore.getState().toggleHighlight(enabled);
  }, []);

  const handlePositionChange = useCallback((position: number) => {
    if (!isHighlightEnabledRef.current) return;
    const now = Date.now();
    if (now - lastPositionUpdateTime.current < 100) return;
    lastPositionUpdateTime.current = now;
    setCurrentPosition(position);
  }, []);

  // ── Early returns after all hooks ─────────────────────────────────────────
  if (!slug && !token) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('common.error')}</Text>
        <Text style={styles.errorMessage}>{t('library.empty')}</Text>
      </View>
    );
  }

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

  const isOwner = !!(story as any)?.isOwner;

  const renderMainContent = () => (
    <>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
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

      {readingTimeMinutes > 0 && !useDesktopLayout && (
        <View style={styles.readingTimeMobile}>
          <View style={styles.readingTimeRow}>
            <Ionicons name="time-outline" size={18} color={theme.colors.text.secondary} />
            <Text style={styles.readingTimeText}>
              {t('story_viewer.reading_time', { minutes: readingTimeMinutes })}
            </Text>
          </View>
        </View>
      )}

      {audioUrl && !useDesktopLayout && (
        <View style={styles.audioWidget}>
          <AudioPlayer
            storyId={story.id}
            audioUrl={audioUrl}
            duration={typeof duration === 'number' ? duration : 0}
            hasAlignment={hasAlignment}
            onActivate={handleActivate}
            onHighlightToggle={handleHighlightToggle}
            onPositionChange={handlePositionChange}
          />
        </View>
      )}

      {!useDesktopLayout && (
        <StoryRatingWidget
          storyId={story.id}
          slugOrToken={token || slug}
          isUnlisted={!!token}
          rating={story.rating}
          onVoted={refetch}
        />
      )}

      <View style={styles.scenesSection}>
        {(story.scenes ?? []).map((scene: any, index: number) => {
          const imgUrl = scene.imageUrl ? formatAssetUrl(scene.imageUrl) : null;
          return (
            <View
              key={scene.sceneId ?? index}
              style={styles.scene}
              ref={(ref: View | null) => { sceneRefs.current[index] = ref; }}
            >
              {imgUrl && (
                <Image
                  source={{ uri: imgUrl }}
                  style={styles.sceneImage as ImageStyle}
                  resizeMode="cover"
                />
              )}
              {renderSceneText(removeAudioTags(scene.text || ''), index)}
            </View>
          );
        })}
      </View>

      {!useDesktopLayout && <PublishedStoryCta slug={slug} isAuthenticated={!!isAuthenticated} />}
    </>
  );

  const renderSceneText = (cleanedText: string, sceneIndex: number) => {
    if (!hasAlignment || sentences.length === 0) {
      return <Text style={styles.sceneText}>{cleanedText}</Text>;
    }
    const sceneSentences = sentences.filter((s) => s.sceneIndex === sceneIndex);
    if (sceneSentences.length === 0) {
      return <Text style={styles.sceneText}>{cleanedText}</Text>;
    }
    let renderedText: React.ReactNode[] = [];
    let lastIndex = 0;
    sceneSentences.forEach((sentence, sentenceLocalIndex) => {
      const sentenceIndex = sentences.indexOf(sentence);
      const isSentenceActive = effectiveHighlightEnabled && sentenceIndex === activeSentenceIndex;
      const sentencePos = cleanedText.indexOf(sentence.text, lastIndex);
      if (sentencePos === -1) return;
      if (sentencePos > lastIndex) {
        renderedText.push(cleanedText.substring(lastIndex, sentencePos));
      }
      if (effectiveHighlightEnabled) {
        const sentenceWords = sentence.words.map((word, wordIndex) => {
          const isActiveWord = isSentenceActive && wordIndex === activeWordIndex;
          const wordStyle = isSentenceActive
            ? (isActiveWord ? styles.activeWordColor : styles.inactiveWordColor)
            : undefined;
          return (
            <React.Fragment key={`${sentenceIndex}-${wordIndex}`}>
              <Text style={wordStyle}>{word.text}</Text>
              {wordIndex < sentence.words.length - 1 && ' '}
            </React.Fragment>
          );
        });
        renderedText.push(
          <Text
            key={`sentence-${sentenceIndex}`}
            style={[
              styles.sentenceText,
              isSentenceActive && styles.activeSentenceBackground,
              !isSentenceActive && styles.grayTextColor,
            ]}
          >
            {sentenceWords}
          </Text>,
        );
      } else {
        renderedText.push(
          <Text key={`sentence-${sentenceIndex}`} style={styles.sentenceText}>
            {sentence.text}
          </Text>,
        );
      }
      if (sentenceLocalIndex < sceneSentences.length - 1) {
        renderedText.push(' ');
      }
      lastIndex = sentencePos + sentence.text.length;
    });
    if (lastIndex < cleanedText.length) {
      renderedText.push(cleanedText.substring(lastIndex));
    }
    return <Text style={styles.sceneText}>{renderedText}</Text>;
  };

  const renderRightColumn = () => (
    <>
      {/* Reading Time */}
      {readingTimeMinutes > 0 && (
        <View style={styles.sidebarWidget}>
          <View style={styles.readingTimeRow}>
            <Ionicons name="time-outline" size={18} color={theme.colors.text.secondary} />
            <Text style={styles.readingTimeText}>
              {t('story_viewer.reading_time', { minutes: readingTimeMinutes })}
            </Text>
          </View>
        </View>
      )}
      {/* Audio widget at top (same styles as StoryViewerScreen sidebar) */}
      {audioUrl && (
        <View style={styles.sidebarWidget}>
          <AudioPlayer
            storyId={story.id}
            audioUrl={audioUrl}
            duration={typeof duration === 'number' ? duration : 0}
            hasAlignment={hasAlignment}
            onActivate={handleActivate}
            onHighlightToggle={handleHighlightToggle}
            onPositionChange={handlePositionChange}
          />
        </View>
      )}
      <StoryRatingWidget
        storyId={story.id}
        slugOrToken={token || slug}
        isUnlisted={!!token}
        rating={story.rating}
        onVoted={refetch}
      />
      {isAuthenticated && isOwner && (
        <TouchableOpacity
          style={styles.editButtonSidebar}
          onPress={() => navigateToStory(story.id)}
        >
          <Ionicons name="pencil-outline" size={20} color={theme.colors.interactive.primary} />
          <Text style={styles.editButtonText}>{t('common.edit')}</Text>
        </TouchableOpacity>
      )}
      {!isAuthenticated && (
        <PublishedStoryCta slug={slug} isAuthenticated={false} inSidebar />
      )}
    </>
  );

  if (useDesktopLayout) {
    return (
      <View style={styles.container}>
        <View style={styles.desktopLayout}>
          <ScrollView ref={scrollViewRef} style={styles.leftColumn} contentContainerStyle={styles.leftColumnContent}>
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
    <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content}>
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
  meta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
  },
  audioWidget: {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing[6],
    borderRadius: theme.spacing[4],
    marginBottom: theme.spacing[6],
  },
  scenesSection: {
    gap: theme.spacing[6],
  },
  scene: {
    // Individual scene wrapper — needed for sceneRefs scroll target
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
  sentenceText: {
    // Inline text wrapper — inherits sceneText styles
  },
  activeSentenceBackground: {
    backgroundColor: 'rgb(218, 239, 253)',
  },
  grayTextColor: {
    color: '#6d6d6d',
  },
  activeWordColor: {
    color: theme.colors.text.primary,
  },
  inactiveWordColor: {
    color: '#6d6d6d',
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
  sidebarWidget: {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing[6],
    borderRadius: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  readingTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  readingTimeText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
  },
  readingTimeMobile: {
    marginBottom: theme.spacing[4],
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
