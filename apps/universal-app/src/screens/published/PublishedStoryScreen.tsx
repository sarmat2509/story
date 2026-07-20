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
  type LayoutChangeEvent,
} from 'react-native';
import { useRoute, useNavigation, RouteProp, type NavigationProp } from '@react-navigation/native';
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
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { AppButton } from '@/components/AppButton';
import AudioPlayer from '@/components/AudioPlayer';
import { navigateToStory } from '@/navigation/navigationRef';
import { globalAudioService } from '@/services/globalAudioService';
import { audioPlaybackService } from '@/services/audioPlaybackService';
import { useAlignmentSync } from '@/hooks/useAlignmentSync';
import {
  getReadingTimeMinutes,
  resolveGraphicNovelTextStyle,
  scaleGraphicNovelTextStyle,
  stripMarkdownStyleEmphasis,
} from '@wondertales/shared';
import type {
  PublicGraphicNovelPage,
  PublicGraphicNovelTextOverlayItem,
  PublicStoryScene,
} from '@wondertales/shared';
import type { MainDrawerParamList } from '@/types/navigation';

const removeAudioTags = (text: string): string => {
  let t = text.replace(/<[^>]+>/g, '');
  t = t.replace(/\[[^\]]*\]/g, '');
  return stripMarkdownStyleEmphasis(t)
    .replace(/\s{2,}/g, ' ')
    .trim();
};

type RouteProps = RouteProp<MainDrawerParamList, 'PublishedStory' | 'UnlistedStory'>;

export default function PublishedStoryScreen() {
  const route = useRoute<RouteProps>();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { isDesktop, isTabletLandscape } = useResponsive();
  const slug = (route.params as any)?.slug ?? '';
  const token = (route.params as any)?.token ?? '';
  const useDesktopLayout = isDesktop || isTabletLandscape;
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const publicQuery = usePublicStory(slug, !!slug && !token);
  const tokenQuery = usePublicStoryByToken(token, !!token);
  const activeQuery = token ? tokenQuery : publicQuery;
  const { data: story, isLoading, error, refetch } = activeQuery;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: story?.title ?? '',
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [navigation, story?.title]);

  // ── Audio + highlight state ────────────────────────────────────────────────
  // All hooks MUST come before any early returns (Rules of Hooks)
  const [isHighlightEnabled, setIsHighlightEnabled] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [comicPageWidths, setComicPageWidths] = useState<Record<number, number>>({});
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
    [story?.scenes]
  );

  const readingTimeMinutes = useMemo(
    () => getReadingTimeMinutes(story?.scenes ?? []),
    [story?.scenes]
  );

  const { activeSentenceIndex, activeWordIndex, sentences } = useAlignmentSync(
    story?.fullText || '',
    alignment,
    currentPosition,
    sceneTexts
  );

  // Derive active scene from the active sentence
  const activeSceneIndex =
    activeSentenceIndex !== null ? (sentences[activeSentenceIndex]?.sceneIndex ?? null) : null;

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
        () => {}
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

  const handleReportStory = useCallback(() => {
    setShowFeedbackModal(true);
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
  const authorAvatarUrl =
    formatAssetUrl((story as any)?.author?.avatarUrl) ?? (story as any)?.author?.avatarUrl ?? null;
  const authorInitial = (story.authorDisplayName || 'A').trim().charAt(0).toUpperCase();
  const authorId = (story as any)?.author?.id as string | undefined;
  const handleAuthorPress = () => {
    if (!authorId) return;
    navigation.navigate('AuthorProfile', { authorId });
  };

  const renderReportStoryButton = () => (
    <AppButton
      label={t('feedback.report_story')}
      onPress={handleReportStory}
      variant="secondary"
      size="md"
      leading={<Ionicons name="flag-outline" size={18} color={theme.colors.text.secondary} />}
      style={styles.reportStoryAction}
    />
  );

  const renderMainContent = () => (
    <>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.authorCard, !authorId && styles.authorCardDisabled]}
            onPress={handleAuthorPress}
            disabled={!authorId}
            activeOpacity={0.85}
          >
            <View style={styles.authorAvatar}>
              {authorAvatarUrl ? (
                <Image
                  source={{ uri: authorAvatarUrl }}
                  style={styles.authorAvatarImage as ImageStyle}
                />
              ) : (
                <Text style={styles.authorAvatarFallback}>{authorInitial}</Text>
              )}
            </View>
            <View style={styles.headerText}>
              <Text style={styles.authorLabel}>{t('profile.author_label')}</Text>
              <Text style={styles.authorName}>{story.authorDisplayName || 'Anonymous'}</Text>
              <Text style={styles.meta}>{publishedAt}</Text>
            </View>
            {authorId ? (
              <Ionicons name="chevron-forward" size={18} color={theme.colors.text.tertiary} />
            ) : null}
          </TouchableOpacity>
          {useDesktopLayout
            ? null
            : isAuthenticated &&
              isOwner && (
                <AppButton
                  label={t('common.edit')}
                  onPress={() => navigateToStory(story.id)}
                  variant="secondary"
                  size="md"
                  leading={
                    <Ionicons
                      name="pencil-outline"
                      size={20}
                      color={theme.colors.interactive.primary}
                    />
                  }
                  style={styles.editAction}
                />
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
            title={`${t('story_viewer.audio_title')}`}
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

      {!useDesktopLayout && renderReportStoryButton()}

      <View style={styles.scenesSection}>{renderPublishedContent()}</View>

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
    const renderedText: React.ReactNode[] = [];
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
            ? isActiveWord
              ? styles.activeWordColor
              : styles.inactiveWordColor
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
          </Text>
        );
      } else {
        renderedText.push(
          <Text key={`sentence-${sentenceIndex}`} style={styles.sentenceText}>
            {sentence.text}
          </Text>
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

  const renderProseScene = (scene: PublicStoryScene, sceneIndex: number, showImage = true) => {
    const imgUrl = showImage && scene.imageUrl ? formatAssetUrl(scene.imageUrl) : null;
    return (
      <View
        key={`prose-${scene.sceneId}-${sceneIndex}`}
        style={styles.scene}
        ref={(ref: View | null) => {
          sceneRefs.current[sceneIndex] = ref;
        }}
      >
        {imgUrl && (
          <Image
            source={{ uri: imgUrl }}
            style={styles.sceneImage as ImageStyle}
            resizeMode="cover"
          />
        )}
        {renderSceneText(removeAudioTags(scene.text || ''), sceneIndex)}
      </View>
    );
  };

  const renderComicTextItem = (
    item: PublicGraphicNovelTextOverlayItem,
    page: PublicGraphicNovelPage
  ) => {
    const text = removeAudioTags(item.text || '');
    if (!text) return null;
    const pageSize = page.textOverlay?.pageSize;
    const pageWidth = comicPageWidths[page.pageNumber] || pageSize?.width || 1024;
    const textStyle = resolveGraphicNovelTextStyle(page.textOverlay?.textStyle, pageSize);
    const scaledTextStyle = scaleGraphicNovelTextStyle(textStyle, pageWidth);
    const rectStyle = {
      left: `${item.rect.x * 100}%`,
      top: `${item.rect.y * 100}%`,
      width: `${item.rect.width * 100}%`,
      height: `${item.rect.height * 100}%`,
    };
    return (
      <View
        key={item.segmentId || item.id}
        pointerEvents="box-none"
        accessibilityLabel={item.ariaLabel}
        style={[
          styles.comicTextBox,
          rectStyle as any,
          {
            paddingHorizontal: scaledTextStyle.paddingXPx,
            paddingVertical: scaledTextStyle.paddingYPx,
          },
        ]}
      >
        <Text
          selectable
          style={[
            styles.comicBubbleText,
            {
              fontSize: scaledTextStyle.fontSizePx,
              lineHeight: scaledTextStyle.lineHeightPx,
            },
          ]}
        >
          {text}
        </Text>
      </View>
    );
  };

  const renderComicPage = (page: PublicGraphicNovelPage) => {
    const imageUrl = page.imageUrl ? formatAssetUrl(page.imageUrl) : null;
    const pageSize = page.textOverlay?.pageSize;
    const aspectRatio =
      pageSize?.width && pageSize?.height ? pageSize.width / pageSize.height : 3 / 4;
    const sceneIndex = (story.scenes ?? []).findIndex(
      (scene: PublicStoryScene) => scene.graphicNovelPageNumber === page.pageNumber
    );
    const refIndex = sceneIndex >= 0 ? sceneIndex : Math.max(0, page.pageNumber - 1);
    const handleLayout = (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      setComicPageWidths((current) =>
        current[page.pageNumber] === width ? current : { ...current, [page.pageNumber]: width }
      );
    };
    return (
      <View
        key={`comic-page-${page.pageNumber}`}
        ref={(ref: View | null) => {
          sceneRefs.current[refIndex] = ref;
        }}
        style={styles.comicPage}
      >
        <View style={[styles.comicPageCanvas, { aspectRatio }]} onLayout={handleLayout}>
          {imageUrl ? (
            <>
              <Image
                source={{ uri: imageUrl }}
                style={styles.comicPageImage as ImageStyle}
                resizeMode="contain"
              />
              {(page.textOverlay?.items ?? [])
                .slice()
                .sort((a, b) => a.readingOrder - b.readingOrder)
                .map((item) => renderComicTextItem(item, page))}
            </>
          ) : (
            <View style={styles.comicPagePlaceholder}>
              <Ionicons name="image-outline" size={26} color={theme.colors.text.tertiary} />
              <Text style={styles.comicPagePlaceholderText}>
                {t('story_viewer.comic_page_preparing', { page: page.pageNumber })}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderMixedContent = () => {
    const scenes = story.scenes ?? [];
    const pages = story.comicPages ?? [];
    const order = story.mixedStoryReadingOrder ?? [];
    if (order.length === 0) {
      return scenes
        .slice()
        .sort((a, b) => (a.mixedStoryScreenOrder ?? 0) - (b.mixedStoryScreenOrder ?? 0))
        .map((scene) => {
          const sceneIndex = scenes.findIndex((candidate) => candidate.sceneId === scene.sceneId);
          if (scene.mixedStoryBlockKind === 'comic' && scene.graphicNovelPageNumber) {
            const page = pages.find(
              (candidate) => candidate.pageNumber === scene.graphicNovelPageNumber
            );
            return page ? renderComicPage(page) : null;
          }
          return renderProseScene(scene, sceneIndex, false);
        });
    }
    return order
      .slice()
      .sort((a, b) => a.screenOrder - b.screenOrder)
      .map((entry) => {
        if (entry.kind === 'comic') {
          const page = pages.find((candidate) => candidate.pageNumber === entry.pageNumber);
          return page ? renderComicPage(page) : null;
        }
        const sourceSceneId = entry.sceneId ?? entry.sourceSceneIds[0];
        const sceneIndex = scenes.findIndex(
          (candidate) =>
            candidate.sceneId === sourceSceneId ||
            candidate.mixedStoryScreenOrder === entry.screenOrder
        );
        const scene = scenes[sceneIndex];
        return scene ? renderProseScene(scene, sceneIndex, false) : null;
      });
  };

  const renderPublishedContent = () => {
    if (story.storyFormat === 'graphic_novel') {
      return (story.comicPages ?? []).map(renderComicPage);
    }
    if (story.storyFormat === 'mixed_story') {
      return renderMixedContent();
    }
    return (story.scenes ?? []).map((scene, index) => renderProseScene(scene, index));
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
            title={`${t('story_viewer.audio_title')}`}
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
      {renderReportStoryButton()}
      {isAuthenticated && isOwner && (
        <AppButton
          label={t('common.edit')}
          onPress={() => navigateToStory(story.id)}
          variant="secondary"
          leading={
            <Ionicons name="pencil-outline" size={20} color={theme.colors.interactive.primary} />
          }
        />
      )}
      {!isAuthenticated && <PublishedStoryCta slug={slug} isAuthenticated={false} inSidebar />}
    </>
  );

  if (useDesktopLayout) {
    return (
      <View style={styles.container}>
        <View style={styles.desktopLayout}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.leftColumn}
            contentContainerStyle={styles.leftColumnContent}
          >
            <View style={styles.contentWrapper}>{renderMainContent()}</View>
          </ScrollView>
          <View style={styles.rightColumn}>
            <View style={styles.sidebar}>{renderRightColumn()}</View>
          </View>
        </View>
        <FeedbackModal
          visible={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          initialReportedScreen="published_story"
          contentReportContext={{
            storyId: story.id,
            storySlug: slug || undefined,
            shareToken: token || undefined,
            contentType: 'story',
          }}
        />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.contentWrapper}>{renderMainContent()}</View>
      </ScrollView>
      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="published_story"
        contentReportContext={{
          storyId: story.id,
          storySlug: slug || undefined,
          shareToken: token || undefined,
          contentType: 'story',
        }}
      />
    </>
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
  authorCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
  },
  authorCardDisabled: {
    opacity: 0.88,
  },
  authorAvatar: {
    width: 48,
    height: 48,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.tertiary,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorAvatarImage: {
    width: '100%',
    height: '100%',
  },
  authorAvatarFallback: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.secondary,
  },
  headerText: {
    flex: 1,
  },
  authorLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
    marginBottom: 2,
  },
  authorName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: 2,
  },
  editAction: {
    flexShrink: 0,
  },
  meta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
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
  comicPage: {
    width: '100%',
    alignSelf: 'stretch',
  },
  comicPageCanvas: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.background.tertiary,
  },
  comicPageImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  comicTextBox: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comicBubbleText: {
    width: '100%',
    minWidth: 0,
    flexShrink: 1,
    color: '#111111',
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
    includeFontPadding: false,
    ...Platform.select({
      web: {
        // @ts-ignore web-only text wrapping
        textWrap: 'balance',
        // @ts-ignore web-only overflow wrapping
        overflowWrap: 'break-word',
      },
      default: {},
    }),
  },
  comicPagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
  },
  comicPagePlaceholderText: {
    marginTop: theme.spacing[3],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
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
  reportStoryAction: {
    marginBottom: theme.spacing[4],
  },
});
