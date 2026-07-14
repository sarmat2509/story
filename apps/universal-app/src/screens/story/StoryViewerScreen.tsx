import React, { useEffect, useState, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Platform,
  ImageStyle,
  LayoutChangeEvent,
  Share,
} from 'react-native';
import {
  useRoute,
  RouteProp,
  useNavigation,
  NavigationProp,
  useFocusEffect,
} from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  useStory,
  useStoryGenerationStatus,
  useGenerateAudio,
  useGenerateAlignment,
  useGenerateMapTile,
  useAudioStatus,
  useAudioUrl,
  useDeleteStory,
  useSeriesInfo,
  usePublishStory,
  useReviewChildStory,
  useGraphicNovel,
  useGraphicNovelGenerationStatus,
  type GraphicNovelPageApi,
  type GraphicNovelTextOverlay,
  type GraphicNovelTextOverlayItem,
} from '@/api/stories';
import { useCollectedArtifacts, useCollectStoryArtifact } from '@/api/artifacts';
import { useCollectMapTile, useStoryMapTileStatus } from '@/api/mapTiles';
import { useUpdateMe } from '@/api/auth';
import { useSubscriptionUsage } from '@/api/plans';
import { useVoices } from '@/api/voices';
import { useUpdateCharacter } from '@/api/characters';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PublishShareDialog, type CoverAssetOption } from '@/components/PublishShareDialog';
import { AppButton } from '@/components/AppButton';
import { toastService } from '@/services/toastService';
import { audioNotificationService } from '@/services/audioNotificationService';
import { audioPlaybackService } from '@/services/audioPlaybackService';
import { globalAudioService } from '@/services/globalAudioService';
import { pushNotificationService } from '@/services/pushNotificationService';
import { navigateToStory } from '@/navigation/navigationRef';
import { useAudioPlayerStore } from '@/store/audioPlayerStore';
import { useAuthStore } from '@/store/authStore';
import { useResponsive } from '@/hooks/useResponsive';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import { getOrdinal } from '@/utils/ordinal';
import { formatSubscriptionPeriodEnd } from '@/utils/formatSubscriptionPeriodEnd';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import type { MainDrawerParamList } from '@/types/navigation';
import AudioPlayer from '@/components/AudioPlayer';
import VoiceSelector from '@/components/VoiceSelector';
import { useAlignmentSync } from '@/hooks/useAlignmentSync';
import { ContinueSeriesSection } from '@/components/ContinueSeriesSection';
import { StoryBottomSheet } from '@/components/StoryBottomSheet';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { StoryReflectionSection } from '@/components/StoryReflectionSection';
import { StoryCharactersSection, type StoryCharacter } from '@/components/StoryCharactersSection';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { StoryViewerSkeleton } from '@/components/StoryViewerSkeleton';
import {
  getBaseStoryTextSizePxForAgeGroup,
  getReadingTimeMinutes,
  getStoryTextSizePx,
  stripMarkdownStyleEmphasis,
} from '@wondertales/shared';
import { getAnalytics } from '@/services/analytics';
import { storage } from '@/utils/storage';
import { assignWebLocation } from '@/utils/webRuntime';

type StoryViewerRouteProp = RouteProp<MainDrawerParamList, 'Story'>;

type NormalizedRect = { x: number; y: number; width: number; height: number };

type ManifestClosingArtifact = {
  id: string;
  title: string;
  description: string;
  imagePath?: string | null;
  fullImagePath?: string | null;
  fullImageUrl?: string | null;
  thumbnailPath?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
};

// Helper: strip bracket tags (audio, IDs) and ** emphasis for display (align with API stripAllTags)
const removeAudioTags = (text: string): string =>
  stripMarkdownStyleEmphasis(text.replace(/\[[^\]]*\]/g, ''));

const stripArtifactMarkers = (text: string): string =>
  text.replace(/\{([^{}]+)\}/g, '$1');

const normalizeHighlightText = (text: string): string =>
  stripArtifactMarkers(removeAudioTags(text)).replace(/\s+/g, ' ').trim().toLocaleLowerCase();

const graphicNovelPanelKey = (pageNumber: number, panelIndex: number): string =>
  `${pageNumber}:${panelIndex}`;

function isNormalizedRect(value: unknown): value is NormalizedRect {
  const rect = value as Partial<NormalizedRect> | null;
  return (
    !!rect &&
    typeof rect.x === 'number' &&
    typeof rect.y === 'number' &&
    typeof rect.width === 'number' &&
    typeof rect.height === 'number'
  );
}

function panelRectFromGraphicNovelPage(
  page: GraphicNovelPageApi,
  panelIndex: number
): NormalizedRect | null {
  const panels = Array.isArray(page.layoutJson?.panels)
    ? page.layoutJson.panels
    : Array.isArray(page.panels)
      ? page.panels
      : [];
  const panel = panels[panelIndex - 1];
  const rect = panel?.templatePanel?.rect ?? panel?.rect;
  return isNormalizedRect(rect) ? rect : null;
}

function splitArtifactMarkerText(rawText: string): Array<{
  type: 'text' | 'artifact';
  text: string;
  label: string;
}> {
  const parts: Array<{ type: 'text' | 'artifact'; text: string; label: string }> = [];
  const markerRe = /\{([^{}]+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markerRe.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      const text = rawText.slice(lastIndex, match.index);
      parts.push({ type: 'text', text, label: text });
    }

    const label = match[1].trim();
    if (label) {
      parts.push({ type: 'artifact', text: label, label });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < rawText.length) {
    const text = rawText.slice(lastIndex);
    parts.push({ type: 'text', text, label: text });
  }

  return parts;
}

function getArtifactDisplayRanges(rawText: string): Array<{ start: number; end: number; label: string }> {
  const ranges: Array<{ start: number; end: number; label: string }> = [];
  const markerRe = /\{([^{}]+)\}/g;
  let lastIndex = 0;
  let displayIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markerRe.exec(rawText)) !== null) {
    displayIndex += rawText.slice(lastIndex, match.index).length;
    const label = match[1].trim();
    if (label) {
      const start = displayIndex;
      displayIndex += label.length;
      ranges.push({ start, end: displayIndex, label });
    }
    lastIndex = match.index + match[0].length;
  }

  return ranges;
}

const GRAPHIC_NOVEL_BUBBLE_FONT_SIZE = 20;
const GRAPHIC_NOVEL_BUBBLE_LINE_HEIGHT = 23;
const GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_X = 14;
const GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_Y = 6;
const GRAPHIC_NOVEL_BUBBLE_LINE_HEIGHT_RATIO =
  GRAPHIC_NOVEL_BUBBLE_LINE_HEIGHT / GRAPHIC_NOVEL_BUBBLE_FONT_SIZE;
const GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_X_RATIO =
  GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_X / GRAPHIC_NOVEL_BUBBLE_FONT_SIZE;
const GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_Y_RATIO =
  GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_Y / GRAPHIC_NOVEL_BUBBLE_FONT_SIZE;
const GRAPHIC_NOVEL_CANONICAL_PAGE_WIDTH = 1536;
const GRAPHIC_NOVEL_BUBBLE_TEXT_TARGET_PAGE_WIDTH = 992;

type GraphicNovelBubbleTextStyle = NonNullable<GraphicNovelTextOverlay['textStyle']>;
type ResolvedGraphicNovelBubbleTextStyle = GraphicNovelBubbleTextStyle & {
  targetPageWidthPx: number;
  targetPageHeightPx: number;
};

const finitePositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const resolveGraphicNovelBubbleTextStyle = (
  textStyle: GraphicNovelTextOverlay['textStyle'] | null | undefined,
  fallbackFontSizePx: number
): ResolvedGraphicNovelBubbleTextStyle => {
  const fontSizePx = finitePositiveNumber(textStyle?.fontSizePx)
    ? textStyle.fontSizePx
    : fallbackFontSizePx;
  return {
    fontSizePx,
    lineHeightPx: finitePositiveNumber(textStyle?.lineHeightPx)
      ? textStyle.lineHeightPx
      : Math.max(fontSizePx + 1, Math.round(fontSizePx * GRAPHIC_NOVEL_BUBBLE_LINE_HEIGHT_RATIO)),
    paddingXPx: finitePositiveNumber(textStyle?.paddingXPx)
      ? textStyle.paddingXPx
      : Math.max(8, Math.round(fontSizePx * GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_X_RATIO)),
    paddingYPx: finitePositiveNumber(textStyle?.paddingYPx)
      ? textStyle.paddingYPx
      : Math.max(4, Math.round(fontSizePx * GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_Y_RATIO)),
    targetPageWidthPx: finitePositiveNumber(textStyle?.targetPageWidthPx)
      ? textStyle.targetPageWidthPx
      : GRAPHIC_NOVEL_BUBBLE_TEXT_TARGET_PAGE_WIDTH,
    targetPageHeightPx: finitePositiveNumber(textStyle?.targetPageHeightPx)
      ? textStyle.targetPageHeightPx
      : Math.round(GRAPHIC_NOVEL_BUBBLE_TEXT_TARGET_PAGE_WIDTH * 4 / 3),
  };
};

const inlineNoSpaceBeforeRe = /^[\s,.;:!?…)\]}»”’"'%]/;
const inlineOpeningBoundaryRe = /[\s([{«„“"']$/;

const needsInlineSpaceBefore = (previousText: string, currentText: string): boolean =>
  Boolean(
    previousText &&
      currentText &&
      !inlineOpeningBoundaryRe.test(previousText) &&
      !inlineNoSpaceBeforeRe.test(currentText)
  );

const needsInlineSpaceAfter = (currentText: string, nextText: string): boolean =>
  Boolean(currentText && nextText && !inlineNoSpaceBeforeRe.test(nextText));

const graphicNovelReferenceToUrl = (reference: any): string | null => {
  const candidate =
    reference?.url ||
    reference?.imageUrl ||
    reference?.fullImageUrl ||
    reference?.storagePath ||
    reference?.path ||
    null;
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
};

const manifestCharacterToStoryCharacter = (character: any, index: number): StoryCharacter | null => {
  const name = typeof character?.name === 'string' ? character.name.trim() : '';
  if (!name) return null;
  const references: unknown[] = Array.isArray(character?.references) ? character.references : [];
  const referencePhotoUrl =
    references.map(graphicNovelReferenceToUrl).find((value): value is string => !!value) ?? null;
  const idSource =
    (typeof character?.id === 'string' && character.id) ||
    (typeof character?.canonicalName === 'string' && character.canonicalName) ||
    name;

  return {
    id: `graphic-novel-${idSource}-${index}`,
    name,
    localizedName: typeof character?.canonicalName === 'string' ? character.canonicalName : null,
    type: typeof character?.type === 'string' ? character.type : 'person',
    referencePhotoUrl,
    isHidden: false,
    description: typeof character?.description === 'string' ? character.description : null,
  };
};

// Format wait time using i18n translations
const formatWaitTime = (
  ms: number,
  t: (key: string, opts?: Record<string, any>) => string
): string => {
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 5) {
    return t('story_viewer.audio_generating_almost_done');
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return t('story_viewer.audio_generating_remaining_seconds', { seconds });
  }
  return t('story_viewer.audio_generating_remaining', { minutes, seconds });
};

export default function StoryViewerScreen() {
  const route = useRoute<StoryViewerRouteProp>();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const { isTabletPortrait, isMobile, width } = useResponsive();
  const isSingleColumn = isMobile || isTabletPortrait;
  const mobileHeaderTitleMaxWidth = isMobile ? Math.max(0, width - 128) : undefined;
  const { user, sessionMode, activeChild } = useAuthStore();
  const isChildSession = sessionMode === 'child';
  const isArtisanMode = user?.mode === 'artisan';
  const storyId = route.params?.storyId;
  const canOpenAdminStory = Platform.OS === 'web' && user?.role === 'admin' && !isChildSession;
  const autoPlay = route.params?.autoPlay;
  const hadAudioGenerationRef = useRef(false);
  const { data: story, isLoading, error, refetch } = useStory(storyId!);
  const storyMetadata = ((story as any)?.metadata ?? {}) as Record<string, unknown>;
  const isGraphicNovel = storyMetadata.storyFormat === 'graphic_novel';
  const isMixedStory = storyMetadata.storyFormat === 'mixed_story';
  const hasGraphicNovelPages = isGraphicNovel || isMixedStory;
  const proseTextSizePx = useMemo(() => {
    const manifestTextSize = story?.readingSettings?.textSizePx;
    if (typeof manifestTextSize === 'number' && Number.isFinite(manifestTextSize)) {
      return manifestTextSize;
    }
    const baseTextSizePx = getBaseStoryTextSizePxForAgeGroup(story?.ageGroup);
    return getStoryTextSizePx(baseTextSizePx, story?.readingSettings?.textSizeMultiplier);
  }, [story?.ageGroup, story?.readingSettings?.textSizeMultiplier, story?.readingSettings?.textSizePx]);
  const sceneTextStyle = useMemo(
    () => [
      styles.sceneText,
      {
        fontSize: proseTextSizePx,
        lineHeight: Math.round(proseTextSizePx * 1.6),
      },
    ],
    [proseTextSizePx]
  );

  // Use lightweight status polling for image generation
  const { data: generationStatus } = useStoryGenerationStatus(
    storyId!,
    !!storyId && !!story && !hasGraphicNovelPages
  );
  const { data: graphicNovel, refetch: refetchGraphicNovel } = useGraphicNovel(
    storyId,
    !!storyId && hasGraphicNovelPages
  );
  const { data: graphicNovelGenerationStatus } = useGraphicNovelGenerationStatus(
    storyId,
    !!storyId && hasGraphicNovelPages
  );

  // Progressive image loading: update story cache as images are generated
  useEffect(() => {
    if (!generationStatus || !story || hasGraphicNovelPages) return;

    if (generationStatus.imageGenerationComplete && !story.imageGenerationComplete) {
      // Final refetch when generation is complete
      refetch();
    } else if (generationStatus.scenesWithImages && generationStatus.scenesWithImages.length > 0) {
      // Progressive update: add imageUrl to scenes that are already generated
      const updatedScenes = story.scenes.map((scene: any) => {
        const generated = generationStatus.scenesWithImages?.find(
          (s) => s.sceneId === scene.sceneId
        );
        if (generated && !scene.image) {
          return {
            ...scene,
            image: {
              url: generated.imageUrl,
              thumbnailUrl: generated.imageUrl.replace(/(\.[^.]+)$/, '_thumb.jpg'),
            },
          };
        }
        return scene;
      });

      // Update local cache (without refetch)
      queryClient.setQueryData(['story', storyId], {
        ...story,
        scenes: updatedScenes,
      });
    }
  }, [generationStatus, story, refetch, storyId, queryClient, hasGraphicNovelPages]);

  const graphicNovelReadyPageKey = graphicNovelGenerationStatus?.readyPageNumbers?.join(',') ?? '';

  useEffect(() => {
    if (!hasGraphicNovelPages || !graphicNovelGenerationStatus) return;
    void refetchGraphicNovel();
    if (graphicNovelGenerationStatus.generationComplete) {
      refetch();
    }
  }, [
    hasGraphicNovelPages,
    graphicNovelReadyPageKey,
    graphicNovelGenerationStatus?.generationComplete,
    refetchGraphicNovel,
    refetch,
  ]);

  const generateAudio = useGenerateAudio();
  const generateAlignment = useGenerateAlignment();
  const updateCharacterMutation = useUpdateCharacter();
  const [savedCharacterIds, setSavedCharacterIds] = useState<Set<string>>(new Set());

  // Bottom sheet for tablet portrait
  const bottomSheetRef = useRef<BottomSheet>(null);

  const openBottomSheet = useCallback(() => {
    bottomSheetRef.current?.expand();
  }, []);

  // M6: Text highlighting state
  const [isHighlightEnabled, setIsHighlightEnabled] = useState(false);
  // Highlight only when this story is the one currently playing
  const activeStoryId = useAudioPlayerStore((s) => s.activeStoryId);
  const isThisStoryActive = storyId === activeStoryId;
  const effectiveHighlightEnabled = isHighlightEnabled && isThisStoryActive;
  const isHighlightEnabledRef = useRef(false); // Ref for callback closure (tracks effectiveHighlightEnabled)
  // Keep ref in sync with derived value so throttled callbacks see the latest state
  useEffect(() => {
    isHighlightEnabledRef.current = effectiveHighlightEnabled;
  }, [effectiveHighlightEnabled]);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [highlightedQuizSceneId, setHighlightedQuizSceneId] = useState<number | null>(null);
  const [scrollViewportHeight, setScrollViewportHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const quizSectionRef = useRef<View | null>(null);
  const sceneRefs = useRef<Record<number, View | null>>({});
  const graphicNovelPanelRefs = useRef<Record<string, View | null>>({});
  const lastPositionUpdateTime = useRef(0);
  const quizHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quizAutoScrollKeyRef = useRef<string | null>(null);

  const handleScrollViewportLayout = useCallback((event: LayoutChangeEvent) => {
    setScrollViewportHeight(event.nativeEvent.layout.height);
  }, []);

  // M7: Audio playback state persistence (global service handles saving/restoring)

  // Voice selection state
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined);
  const [selectedVoice, setSelectedVoice] = useState<any>(undefined);
  // Keep polling after retry until we get jobStatus (mutation completes before first poll)
  const [audioGenerationRequested, setAudioGenerationRequested] = useState(false);
  const hasAudioJobRef = useRef(false);

  // Use story language for voice selection (not UI language)
  const storyLanguage = story?.language;
  const {
    data: voicesData,
    isLoading: isLoadingVoices,
    error: voicesError,
  } = useVoices(storyLanguage ?? 'uk', {
    enabled: !!storyLanguage,
  });
  const voices = voicesData?.data || [];
  const userPlan = voicesData?.meta?.userPlan || 'free';
  const hasPremiumAccess = voicesData?.meta?.hasPremiumAccess || false;

  // Audio usage stats (from subscription-usage)
  const { data: subscriptionUsage } = useSubscriptionUsage();
  const audioUsage = subscriptionUsage?.audio
    ? {
        used: subscriptionUsage.audio.used,
        limit: subscriptionUsage.audio.limit,
        remaining: subscriptionUsage.audio.remaining,
        resetsAt: subscriptionUsage.resetsAt,
      }
    : undefined;

  const bundleHintText = useMemo(() => {
    const pe = formatSubscriptionPeriodEnd(
      subscriptionUsage?.currentPeriodEnd ?? subscriptionUsage?.resetsAt,
      i18n.language
    );
    return pe
      ? t('story_viewer.bundle_hint', { periodEnd: pe })
      : t('story_viewer.bundle_hint_no_date');
  }, [subscriptionUsage?.currentPeriodEnd, subscriptionUsage?.resetsAt, i18n.language, t]);

  // Track which story is currently being viewed so MiniAudioPlayer can hide.
  // useFocusEffect (not useEffect) because Drawer/Tab navigators keep screens
  // mounted when navigating away — cleanup must fire on blur, not just unmount.
  const setViewingStoryId = useAudioPlayerStore((s) => s.setViewingStoryId);
  const viewingStoryId = useAudioPlayerStore((s) => s.viewingStoryId);
  useFocusEffect(
    useCallback(() => {
      if (storyId) setViewingStoryId(storyId);
      return () => setViewingStoryId(null);
    }, [storyId, setViewingStoryId])
  );

  useFocusEffect(
    useCallback(() => {
      if (hasGraphicNovelPages) {
        void refetchGraphicNovel();
      }
    }, [hasGraphicNovelPages, refetchGraphicNovel])
  );

  useEffect(() => {
    if (!hasGraphicNovelPages || Platform.OS !== 'web') return;
    const webDocument = (globalThis as unknown as { document?: Document }).document;
    if (!webDocument?.addEventListener) return;

    const refreshGraphicNovelOnVisible = () => {
      if (webDocument.visibilityState === 'visible') {
        void refetchGraphicNovel();
      }
    };

    webDocument.addEventListener('visibilitychange', refreshGraphicNovelOnVisible);
    return () => {
      webDocument.removeEventListener('visibilitychange', refreshGraphicNovelOnVisible);
    };
  }, [hasGraphicNovelPages, refetchGraphicNovel]);

  // Set header title from database after story loads (with scenario breadcrumb)
  const { data: seriesInfo } = useSeriesInfo(storyId);
  useEffect(() => {
    if (story?.title) {
      if (story.scenarioCardName) {
        navigation.setOptions({
          headerTitleContainerStyle: isMobile
            ? [styles.mobileHeaderTitleContainer, { maxWidth: mobileHeaderTitleMaxWidth }]
            : isTabletPortrait
              ? styles.tabletHeaderTitleContainer
              : undefined,
          headerTitleAlign: isSingleColumn ? 'left' : undefined,
          headerTitle: () =>
            isMobile ? (
              <View style={styles.mobileHeaderBreadcrumb}>
                <View style={styles.mobileHeaderBreadcrumbTopRow}>
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('Library', { scenarioCardId: story.scenarioCardId })
                    }
                    style={styles.mobileHeaderBreadcrumbLinkPressable}
                  >
                    <Text style={styles.mobileHeaderBreadcrumbLink} numberOfLines={1}>
                      {story.scenarioCardName}
                    </Text>
                  </TouchableOpacity>
                  <Ionicons
                    name="chevron-forward"
                    size={13}
                    color={theme.colors.text.tertiary}
                    style={styles.headerBreadcrumbSeparator}
                  />
                </View>
                <Text style={styles.mobileHeaderBreadcrumbCurrent} numberOfLines={2}>
                  {story.title}
                </Text>
              </View>
            ) : isTabletPortrait ? (
              <Text style={styles.tabletHeaderBreadcrumb} numberOfLines={2}>
                <Text
                  style={styles.tabletHeaderBreadcrumbLink}
                  accessibilityRole="link"
                  onPress={() =>
                    navigation.navigate('Library', { scenarioCardId: story.scenarioCardId })
                  }
                >
                  {story.scenarioCardName}
                </Text>
                {seriesInfo?.baseTitle ? (
                  <>
                    <Text style={styles.tabletHeaderBreadcrumbSeparator}>{'\u00A0›\u00A0'}</Text>
                    <Text
                      style={styles.tabletHeaderBreadcrumbMiddle}
                      accessibilityRole={seriesInfo.seriesId ? 'link' : undefined}
                      onPress={
                        seriesInfo.seriesId
                          ? () =>
                              (navigation as NavigationProp<MainDrawerParamList>).navigate(
                                'SeriesDetail',
                                { seriesId: seriesInfo.seriesId as string }
                              )
                          : undefined
                      }
                    >
                      {seriesInfo.baseTitle}
                    </Text>
                  </>
                ) : null}
                <Text style={styles.tabletHeaderBreadcrumbSeparator}>{'\u00A0›\u00A0'}</Text>
                <Text style={styles.tabletHeaderBreadcrumbCurrent}>{story.title}</Text>
              </Text>
            ) : (
              <View style={styles.headerBreadcrumb}>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('Library', { scenarioCardId: story.scenarioCardId })
                  }
                  style={styles.headerBreadcrumbLinkPressable}
                >
                  <Text style={styles.headerBreadcrumbLink} numberOfLines={1}>
                    {story.scenarioCardName}
                  </Text>
                </TouchableOpacity>
                {seriesInfo?.baseTitle && (
                  <>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={theme.colors.text.tertiary}
                      style={styles.headerBreadcrumbSeparator}
                    />
                    {seriesInfo.seriesId ? (
                      <TouchableOpacity
                        onPress={() =>
                          (navigation as NavigationProp<MainDrawerParamList>).navigate(
                            'SeriesDetail',
                            { seriesId: seriesInfo.seriesId }
                          )
                        }
                        style={styles.headerBreadcrumbLinkPressable}
                      >
                        <Text style={styles.headerBreadcrumbLink} numberOfLines={1}>
                          {seriesInfo.baseTitle}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.headerBreadcrumbMiddle} numberOfLines={1}>
                        {seriesInfo.baseTitle}
                      </Text>
                    )}
                  </>
                )}
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={theme.colors.text.tertiary}
                  style={styles.headerBreadcrumbSeparator}
                />
                <Text style={styles.headerBreadcrumbCurrent} numberOfLines={1}>
                  {story.title}
                </Text>
              </View>
            ),
        });
      } else {
        navigation.setOptions({
          headerTitleContainerStyle: isMobile
            ? [styles.mobileHeaderTitleContainer, { maxWidth: mobileHeaderTitleMaxWidth }]
            : isTabletPortrait
              ? styles.tabletHeaderTitleContainer
              : undefined,
          headerTitleAlign: isSingleColumn ? 'left' : undefined,
          headerTitle: isMobile
            ? () => (
                <Text style={styles.mobileHeaderBreadcrumbCurrent} numberOfLines={2}>
                  {story.title}
                </Text>
              )
            : isTabletPortrait
              ? () => (
                  <Text style={styles.tabletHeaderTitle} numberOfLines={2}>
                    {story.title}
                  </Text>
                )
              : undefined,
          title: isMobile ? undefined : story.title,
        });
      }
    }
  }, [
    story?.title,
    story?.scenarioCardName,
    story?.scenarioCardId,
    seriesInfo?.baseTitle,
    seriesInfo?.seriesId,
    isMobile,
    isSingleColumn,
    isTabletPortrait,
    mobileHeaderTitleMaxWidth,
    navigation,
  ]);

  // Delete story mutation
  const deleteStory = useDeleteStory();
  const publishStory = usePublishStory();
  const reviewChildStory = useReviewChildStory();
  const collectStoryArtifact = useCollectStoryArtifact();
  const generateMapTile = useGenerateMapTile();
  const collectMapTile = useCollectMapTile();
  const artifactCollectionChildProfileId =
    !isChildSession && story?.createdByMode === 'child' && story.createdByChildProfileId
      ? story.createdByChildProfileId
      : undefined;
  const {
    data: storyMapTileStatus,
    isLoading: isStoryMapTileStatusLoading,
  } = useStoryMapTileStatus(storyId, {
    childProfileId: artifactCollectionChildProfileId,
  });
  const {
    data: collectedArtifacts = [],
    isLoading: isCollectedArtifactsLoading,
  } = useCollectedArtifacts({
    locale: i18n.language,
    childProfileId: artifactCollectionChildProfileId,
  });
  const updateMe = useUpdateMe();
  const closingArtifact = ((story as any)?.closingArtifact ?? null) as ManifestClosingArtifact | null;
  const artifactModalImageUrl =
    formatAssetUrl(closingArtifact?.thumbnailUrl ?? closingArtifact?.imageUrl ?? closingArtifact?.imagePath) ??
    closingArtifact?.thumbnailUrl ??
    closingArtifact?.imageUrl ??
    closingArtifact?.imagePath ??
    null;
  const parentReviewStatus =
    story?.createdByMode === 'child' ? story.parentReviewStatus : 'not_required';
  const parentReviewBlocksSharing =
    parentReviewStatus === 'pending' || parentReviewStatus === 'rejected';

  // Delete dialog state
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [publishShareDialogVisible, setPublishShareDialogVisible] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [publishShareUrl, setPublishShareUrl] = useState<string | null>(null);
  const [publishDialogOpenedFromShare, setPublishDialogOpenedFromShare] = useState(false);
  const [unpublishDialogVisible, setUnpublishDialogVisible] = useState(false);
  const [artifactModal, setArtifactModal] = useState<{ label: string } | null>(null);
  const [artifactModalVisible, setArtifactModalVisible] = useState(false);
  const [mapTileModal, setMapTileModal] = useState<{
    assetId?: string;
    imageUrl: string | null;
    alreadyCollected: boolean;
  } | null>(null);
  const [mapTileModalVisible, setMapTileModalVisible] = useState(false);
  const mapTileModalImageUrl =
    formatAssetUrl(mapTileModal?.imageUrl) ?? mapTileModal?.imageUrl ?? null;
  const artifactModalTitle = artifactModal?.label || closingArtifact?.title || '';
  const artifactFallbackTitle = artifactModalTitle || closingArtifact?.title || '';
  const isArtifactAlreadyCollected = useMemo(() => {
    if (!storyId || !closingArtifact) {
      return false;
    }

    return collectedArtifacts.some(
      (item) => item.storyId === storyId && item.artifactId === closingArtifact.id
    );
  }, [closingArtifact, collectedArtifacts, storyId]);

  // M8: Series continuation
  // Audio limit state (story-based, not minutes)
  const [audioLimitExceeded, setAudioLimitExceeded] = useState(false);
  const [limitInfo, setLimitInfo] = useState<{
    limit: number;
    used: number;
    resetsAt: string;
  } | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
      headerRightContainerStyle: isMobile
        ? styles.mobileHeaderRightContainer
        : isTabletPortrait
          ? styles.tabletHeaderRightContainer
          : undefined,
    });
  }, [isMobile, isTabletPortrait, isChildSession, navigation]);

  // Default voice: keep last user choice across stories; if it is missing from this
  // catalog (e.g. other story language), restore from storage or first unlocked voice.
  useEffect(() => {
    if (voices.length === 0) {
      return;
    }

    const selected = selectedVoiceId
      ? voices.find((voice) => voice.id === selectedVoiceId)
      : undefined;

    if (selected) {
      if (selectedVoice?.id !== selected.id) {
        setSelectedVoice(selected);
      }
      return;
    }

    let cancelled = false;
    void storage.getPreferredStoryVoiceId().then((saved) => {
      if (cancelled) return;
      const savedId = saved?.trim();
      const fromSaved = savedId
        ? voices.find((v) => v.id === savedId && (!v.isLocked || hasPremiumAccess))
        : undefined;
      const firstAvailable = voices.find((v) => !v.isLocked) || voices[0];
      const pick: (typeof voices)[number] = fromSaved ?? firstAvailable;
      setSelectedVoiceId(pick.id);
      setSelectedVoice(pick);
    });
    return () => {
      cancelled = true;
    };
  }, [voices, selectedVoiceId, selectedVoice?.id, hasPremiumAccess]);

  // Proactive limit check: show limit message when audioUsage indicates limit reached
  useEffect(() => {
    if (!audioUsage || audioUsage.used == null || audioUsage.limit == null) return;
    if (audioUsage.used >= audioUsage.limit) {
      setAudioLimitExceeded(true);
      setLimitInfo({
        limit: audioUsage.limit,
        used: audioUsage.used,
        resetsAt: audioUsage.resetsAt ?? '',
      });
    } else {
      setAudioLimitExceeded(false);
      setLimitInfo(null);
    }
  }, [audioUsage]);

  // Poll audio status when: mutation in flight, we just requested (waiting for jobStatus), or job is running
  const shouldPollAudio =
    generateAudio.isPending || audioGenerationRequested || hasAudioJobRef.current;

  // Use lightweight polling for audio status (with queue info)
  const { data: audioStatus } = useAudioStatus(storyId, shouldPollAudio);
  const jobStatus = audioStatus?.jobStatus ?? null;
  const queuePosition = audioStatus?.queuePosition ?? null;
  const estimatedWaitMs = audioStatus?.estimatedWaitMs ?? null;
  const processingStartedAt = audioStatus?.processingStartedAt ?? null;
  const estimatedProcessingMs = audioStatus?.estimatedProcessingMs ?? null;
  const isGenerating = jobStatus !== null && jobStatus !== undefined;

  // Tick counter for live countdown during processing
  const [, setCountdownTick] = useState(0);

  // Fetch audio URL only when audio exists and is not in error state (fallback when not polling)
  const audioReady = !!story?.audioMetadata && !story.audioMetadata?.error;
  const { data: audioData } = useAudioUrl(storyId, audioReady);

  // Use audio from poll (audio-status) when available — same event as notification, no extra fetch
  // Fallback to useAudioUrl for stories opened with pre-existing audio (no polling)
  const playerAudioData = useMemo(() => {
    if (audioStatus?.audioUrl) {
      return { audioUrl: audioStatus.audioUrl, duration: audioStatus.duration ?? 0 };
    }
    return audioData ?? null;
  }, [audioStatus?.audioUrl, audioStatus?.duration, audioData]);

  // Clear audioGenerationRequested once we get jobStatus; keep hasAudioJobRef for polling
  useEffect(() => {
    const hasJob = jobStatus !== null && jobStatus !== undefined;
    hasAudioJobRef.current = hasJob;
    if (hasJob) {
      setAudioGenerationRequested(false);
    }
  }, [jobStatus]);

  // Sync audioMetadata from polling into story cache
  // (replaces dead onSuccess in useAudioStatus -- removed in TanStack Query v5)
  useEffect(() => {
    const polledMetadata = audioStatus?.audioMetadata;
    if (polledMetadata) {
      queryClient.setQueryData(['story', storyId], (oldData: any) => {
        if (!oldData) return oldData;
        return { ...oldData, audioMetadata: polledMetadata };
      });
    }
  }, [audioStatus?.audioMetadata, storyId, queryClient]);

  // Show toast when audio completes (using AsyncStorage to show only once)
  useEffect(() => {
    // Track when generation is active
    if (isGenerating) {
      hadAudioGenerationRef.current = true;
    }

    const checkAndShowNotification = async () => {
      // Don't show for pre-existing audio (only when we transitioned from generating to ready)
      if (!hadAudioGenerationRef.current) return;

      const meta = audioStatus?.audioMetadata;
      // Show only after generation completed successfully (not when it failed)
      if (!isGenerating && meta && !meta.error) {
        // CRITICAL: Refetch story to update audioMetadata in UI
        queryClient.invalidateQueries({ queryKey: ['story', storyId] });

        const wasShown = await audioNotificationService.wasShown(storyId);

        if (!wasShown) {
          const storyTitle = story?.title || t('story_viewer.untitled_story');
          const isViewingStory = viewingStoryId === storyId;

          if (isViewingStory) {
            // User is on story page - show in-app toast only
            toastService.success(t('toast.audio_ready_title'), storyTitle, {
              visibilityTime: 20000,
              actionText: t('toast.audio_play'),
              onPress: () => {
                Toast.hide();
                navigateToStory(storyId!, { autoPlay: true });
              },
            });
          } else {
            // User is NOT on story page - send push notification
            await pushNotificationService.sendAudioReadyNotification(
              storyId!,
              storyTitle,
              `🎧 ${t('toast.audio_ready_title')}`
            );
          }

          await audioNotificationService.markAsShown(storyId);
          hadAudioGenerationRef.current = false;
        }
      }
    };

    checkAndShowNotification();
  }, [
    isGenerating,
    audioStatus?.audioMetadata,
    storyId,
    viewingStoryId,
    story?.title,
    t,
    queryClient,
  ]);

  // Tick every 1s during processing for live countdown
  useEffect(() => {
    if (jobStatus !== 'processing') return;
    const id = setInterval(() => setCountdownTick((prev) => prev + 1), 1000);
    return () => clearInterval(id);
  }, [jobStatus]);

  // M6: Proactive alignment generation
  // Automatically generate alignment if audio exists but alignment is missing
  useEffect(() => {
    if (isChildSession) return;
    if (!story || !story.audioMetadata) return;

    const audioMetadata = story.audioMetadata;

    // Check if audio is valid (not an error state)
    const hasValidAudio = !!audioMetadata && !audioMetadata.error;
    const hasAlignment = !!audioMetadata?.alignment;

    // Only generate if:
    // 1. Audio exists and is valid (no error)
    // 2. Alignment is missing
    // 3. Not already generating
    // 4. Not currently generating audio
    if (hasValidAudio && !hasAlignment && !generateAlignment.isPending && !isGenerating) {
      console.log('[Alignment] Audio exists but no alignment - generating proactively');
      generateAlignment.mutate({ storyId });
    }
  }, [isChildSession, story, storyId, generateAlignment, isGenerating]);

  // Optional: Show alignment generation status
  useEffect(() => {
    if (generateAlignment.isPending) {
      console.log('[Alignment] Generating alignment in background...');
    }
    if (generateAlignment.isSuccess) {
      console.log('[Alignment] Alignment generated successfully!');
    }
    if (generateAlignment.isError) {
      console.error('[Alignment] Failed to generate alignment:', generateAlignment.error);
    }
  }, [
    generateAlignment.isPending,
    generateAlignment.isSuccess,
    generateAlignment.isError,
    generateAlignment.error,
  ]);

  // Register audio with global service when playerAudioData becomes available
  useEffect(() => {
    if (!playerAudioData || !story) return;

    const currentActiveId = useAudioPlayerStore.getState().activeStoryId;

    // If this story is already the active one in global service, just sync local state
    if (currentActiveId === storyId) {
      const storeState = useAudioPlayerStore.getState();
      setIsHighlightEnabled(storeState.isHighlightEnabled);
      if (storeState.position > 0) {
        setCurrentPosition(storeState.position);
      }
      console.log('[AudioPlayback] Story already active in global service, synced local state');
      return;
    }

    // If another story is actively loaded, don't interrupt it.
    // The user can press play to activate this story (handled by onActivateAudio).
    if (currentActiveId) {
      console.log('[AudioPlayback] Another story is active, not auto-registering');
      return;
    }

    // No active story - register this one (ready to play, not auto-playing)
    const loadAudio = async () => {
      // Try to restore saved position from AsyncStorage
      const savedState = await audioPlaybackService.getState(storyId);
      const initialPosition = savedState && savedState.position > 5 ? savedState.position : 0;
      // Highlight toggle is global (not per-story)
      const initialHighlight = await audioPlaybackService.getHighlightEnabled();

      // Set local highlight state (ref synced automatically via useEffect)
      setIsHighlightEnabled(initialHighlight);
      if (initialPosition > 0) {
        setCurrentPosition(initialPosition);
      }

      console.log('[AudioPlayback] Registering with global audio service:', {
        storyId,
        title: story.title,
        audioUrl: playerAudioData.audioUrl,
        duration: playerAudioData.duration,
        initialPosition: initialPosition.toFixed(3) + 's',
        initialHighlight,
      });

      await globalAudioService.loadAndPlay({
        storyId,
        storyTitle: story.title || 'Story',
        audioUrl: formatAssetUrl(playerAudioData.audioUrl) ?? playerAudioData.audioUrl,
        duration: playerAudioData.duration,
        hasAlignment: !!story.audioMetadata?.alignment,
        initialPosition,
        initialHighlightEnabled: initialHighlight,
        autoPlay: autoPlay ?? false,
      });
    };

    loadAudio();
  }, [playerAudioData, storyId, story, autoPlay]);

  // Called when user presses play on a story that isn't the currently active one
  const handleActivateAudio = useCallback(async () => {
    if (!playerAudioData || !story) return;

    // Restore saved position from AsyncStorage
    const savedState = await audioPlaybackService.getState(storyId);
    const initialPosition = savedState && savedState.position > 5 ? savedState.position : 0;
    // Highlight toggle is global (not per-story)
    const initialHighlight = await audioPlaybackService.getHighlightEnabled();

    // Set local highlight state (ref synced automatically via useEffect)
    setIsHighlightEnabled(initialHighlight);
    if (initialPosition > 0) {
      setCurrentPosition(initialPosition);
    }

    console.log('[AudioPlayback] User activated audio, loading into global service:', {
      storyId,
      title: story.title,
    });

    await globalAudioService.loadAndPlay({
      storyId,
      storyTitle: story.title || 'Story',
      audioUrl: formatAssetUrl(playerAudioData.audioUrl) ?? playerAudioData.audioUrl,
      duration: playerAudioData.duration,
      hasAlignment: !!story.audioMetadata?.alignment,
      initialPosition,
      initialHighlightEnabled: initialHighlight,
      autoPlay: true, // User explicitly pressed play
    });
  }, [playerAudioData, storyId, story]);

  // M6: Alignment sync hook - maps audio position to sentences and words
  // Precompute cleaned scene texts for sentence-to-scene mapping
  const sceneTexts = useMemo(() => {
    if (!story?.scenes) return [];
    return story.scenes.map((s: any) => removeAudioTags(s.text));
  }, [story?.scenes]);

  const readingTimeMinutes = useMemo(
    () => getReadingTimeMinutes(story?.scenes ?? []),
    [story?.scenes]
  );

  const graphicNovelPages = useMemo(
    () =>
      [...(graphicNovel?.pages ?? [])].sort(
        (a, b) => Number(a.pageNumber || 0) - Number(b.pageNumber || 0)
      ),
    [graphicNovel?.pages]
  );
  const graphicNovelManifestCharacters = useMemo(() => {
    const layoutManifest =
      (graphicNovel?.project?.layoutManifest as any) ||
      (graphicNovel?.project?.layout_manifest as any) ||
      {};
    const manifestCharacters: unknown[] = Array.isArray(layoutManifest.characters)
      ? layoutManifest.characters
      : [];
    return manifestCharacters
      .map(manifestCharacterToStoryCharacter)
      .filter((character: StoryCharacter | null): character is StoryCharacter => !!character);
  }, [graphicNovel?.project]);
  const storyCharactersForSection = useMemo(() => {
    const storyCharacters = Array.isArray(story?.characters) ? story.characters : [];
    return storyCharacters.length > 0
      ? (storyCharacters as StoryCharacter[])
      : hasGraphicNovelPages
        ? graphicNovelManifestCharacters
        : [];
  }, [graphicNovelManifestCharacters, hasGraphicNovelPages, story?.characters]);

  const { activeSentenceIndex, activeWordIndex, sentences } = useAlignmentSync(
    story?.fullText || '',
    story?.audioMetadata?.alignment,
    currentPosition,
    sceneTexts
  );
  const [graphicNovelPageWidths, setGraphicNovelPageWidths] = useState<Record<number, number>>({});

  const handleGraphicNovelPageCanvasLayout = useCallback(
    (pageNumber: number, event: LayoutChangeEvent) => {
      const nextWidth = event.nativeEvent.layout.width;
      if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;

      setGraphicNovelPageWidths((current) => {
        const previousWidth = current[pageNumber];
        if (previousWidth && Math.abs(previousWidth - nextWidth) < 1) {
          return current;
        }
        return { ...current, [pageNumber]: nextWidth };
      });
    },
    []
  );

  const handleOpenArtifact = useCallback((label: string) => {
    if (!closingArtifact) return;
    setArtifactModal({ label });
    setArtifactModalVisible(true);
  }, [closingArtifact]);

  const handleCloseArtifactModal = useCallback(() => {
    setArtifactModalVisible(false);
  }, []);

  const handleOpenArtifactsChest = useCallback(() => {
    handleCloseArtifactModal();
    navigation.navigate('Artifacts');
  }, [handleCloseArtifactModal, navigation]);

  const handleCollectArtifact = useCallback(async () => {
    if (!storyId || !closingArtifact) return;

    try {
      const result = await collectStoryArtifact.mutateAsync({
        storyId,
        artifactId: closingArtifact.id,
        childProfileId: artifactCollectionChildProfileId,
        locale: i18n.language,
      });
      const title =
        result.artifact.acquiredLabel ||
        result.artifact.artifact.title ||
        artifactFallbackTitle;

      toastService.success(
        result.alreadyCollected
          ? t('story_viewer.artifact_already_collected_title')
          : t('story_viewer.artifact_collected_title'),
        t(
          result.alreadyCollected
            ? 'story_viewer.artifact_already_collected_message'
            : 'story_viewer.artifact_collected_message',
          { title }
        )
      );
      handleCloseArtifactModal();
    } catch (error) {
      toastService.error(t('story_viewer.artifact_collect_error'));
    }
  }, [artifactCollectionChildProfileId, artifactFallbackTitle, closingArtifact, collectStoryArtifact, handleCloseArtifactModal, i18n.language, storyId, t]);

  const handleCloseMapTileModal = useCallback(() => {
    setMapTileModalVisible(false);
  }, []);

  const handleOpenMapTilePrize = useCallback(async () => {
    if (!storyId) return;

    try {
      if (storyMapTileStatus?.collected) {
        setMapTileModal({
          assetId: storyMapTileStatus.collected.assetId,
          imageUrl: storyMapTileStatus.collected.imageUrl,
          alreadyCollected: true,
        });
        setMapTileModalVisible(true);
        return;
      }

      if (storyMapTileStatus?.generated) {
        setMapTileModal({
          assetId: storyMapTileStatus.generated.id,
          imageUrl: storyMapTileStatus.generated.imageUrl,
          alreadyCollected: false,
        });
        setMapTileModalVisible(true);
        return;
      }

      const generated = await generateMapTile.mutateAsync({
        storyId,
        useStoryImageReferences: true,
        maxStoryImageReferences: 3,
      });
      queryClient.invalidateQueries({ queryKey: ['story-map-tile-status', storyId] });
      if (generated.asset) {
        setMapTileModal({
          assetId: generated.asset.id,
          imageUrl: generated.asset.imageUrl,
          alreadyCollected: false,
        });
        setMapTileModalVisible(true);
      }
    } catch (error) {
      toastService.error(getLocalizedApiError(t, error, 'story_viewer.map_tile_generate_error'));
    }
  }, [generateMapTile, queryClient, storyId, storyMapTileStatus, t]);

  const handleCollectMapTile = useCallback(async () => {
    if (!storyId || !mapTileModal?.assetId) return;

    try {
      const result = await collectMapTile.mutateAsync({
        storyId,
        assetId: mapTileModal.assetId,
        childProfileId: artifactCollectionChildProfileId,
      });
      handleCloseMapTileModal();
      navigation.navigate('MapTiles', {
        rewardTileId: result.tile.id,
        storyId,
        childProfileId: artifactCollectionChildProfileId,
      });
    } catch (error) {
      toastService.error(t('story_viewer.map_tile_collect_error'));
    }
  }, [
    artifactCollectionChildProfileId,
    collectMapTile,
    handleCloseMapTileModal,
    mapTileModal?.assetId,
    navigation,
    storyId,
    t,
  ]);

  // Debug: log what is actively highlighted when sentence/word changes
  useEffect(() => {
    if (!effectiveHighlightEnabled) return;
    if (activeSentenceIndex === null) return;
  }, [effectiveHighlightEnabled, activeSentenceIndex, activeWordIndex, sentences, currentPosition]);

  // M6: Callback from AudioPlayer - toggle highlight on/off
  const handleHighlightToggle = useCallback(async (enabled: boolean) => {
    setIsHighlightEnabled(enabled);
    // Ref is synced automatically via useEffect on effectiveHighlightEnabled

    // Save highlight toggle globally (applies to all stories)
    await audioPlaybackService.saveHighlightEnabled(enabled);
    // Also update the Zustand store so MiniAudioPlayer / other consumers stay in sync
    useAudioPlayerStore.getState().toggleHighlight(enabled);
    console.log('[AudioPlayback] Saved global highlight state:', enabled);
  }, []);

  // M6: Callback from AudioPlayer - update current position (throttled)
  const handlePositionChange = useCallback((position: number) => {
    // Use ref instead of state to avoid stale closure
    if (!isHighlightEnabledRef.current) return;

    const now = Date.now();
    if (now - lastPositionUpdateTime.current < 100) {
      return; // Throttle to max 10 FPS
    }

    lastPositionUpdateTime.current = now;
    setCurrentPosition(position);
  }, []); // No dependencies - uses ref

  // Wrapper for handlePositionChange that prevents resetting restored position
  const handlePositionChangeWrapper = useCallback(
    (position: number) => {
      // Don't reset to 0 if we have a restored position (> 5s)
      // This prevents AudioPlayer's initial load (position=0) from clearing the restored state
      if (position === 0 && currentPosition > 5) {
        console.log(
          '[StoryViewer] Ignoring position reset to 0 (have restored position:',
          currentPosition.toFixed(3) + 's)'
        );
        return;
      }
      handlePositionChange(position);
    },
    [currentPosition, handlePositionChange]
  );

  // M7: Callback when audio finishes - clear saved state
  const handleAudioFinish = useCallback(async () => {
    console.log('[AudioPlayback] Audio finished, clearing saved state');
    getAnalytics().capture('story_completed', { story_id: storyId });
    await audioPlaybackService.clearState(storyId);
  }, [storyId]);

  const handleSaveCharacter = useCallback(
    async (characterId: string, description?: string | null) => {
      try {
        const data: { isHidden: false; description?: string } = { isHidden: false };
        if (description && description.trim()) {
          data.description = description.trim();
        }
        await updateCharacterMutation.mutateAsync({ id: characterId, data });
        setSavedCharacterIds((prev) => new Set(prev).add(characterId));
        toastService.success(t('story_viewer.character_saved'));
      } catch {
        toastService.error(t('common.error'), t('story_viewer.character_save_error'));
      }
    },
    [updateCharacterMutation, t]
  );

  // Stable array ref for memo — only changes when saved ids actually change (MUST be before early returns)
  const savedIdsKey = [...savedCharacterIds].sort().join(',');
  const savedCharacterIdsArray = useMemo(() => [...savedCharacterIds], [savedIdsKey]);

  // Memoized characters section — prevents re-renders when parent updates (e.g. audio position)
  const charactersSection = useMemo(() => {
    const characters = storyCharactersForSection;
    if (!characters || characters.length === 0) return null;
    return (
      <StoryCharactersSection
        characters={characters}
        savedCharacterIds={savedCharacterIdsArray}
        isArtisanMode={!isChildSession && isArtisanMode}
        onSaveCharacter={handleSaveCharacter}
        isSavePending={updateCharacterMutation.isPending}
        collapsible={isMobile}
      />
    );
  }, [
    storyCharactersForSection,
    savedCharacterIdsArray,
    isChildSession,
    isArtisanMode,
    handleSaveCharacter,
    updateCharacterMutation.isPending,
    isMobile,
  ]);

  // Handle delete story with confirmation
  const handleDeleteStory = useCallback(() => {
    setDeleteDialogVisible(true);
  }, []);

  const handleOpenAdminStory = useCallback(() => {
    if (!storyId) return;
    assignWebLocation(`/admin/stories/${encodeURIComponent(storyId)}`);
  }, [storyId]);

  const confirmDelete = useCallback(async () => {
    await deleteStory.mutateAsync(storyId);
    setDeleteDialogVisible(false);
    navigation.goBack(); // Return to library after delete
  }, [storyId, navigation, deleteStory]);

  const cancelDelete = useCallback(() => {
    setDeleteDialogVisible(false);
  }, []);

  // Share: if not published show PublishShareDialog; if published: web -> post-publish popup, native -> Share.share
  const handleShare = useCallback(async () => {
    if (parentReviewBlocksSharing) {
      toastService.error(
        parentReviewStatus === 'rejected'
          ? t('story_viewer.parent_review_rejected_share_blocked')
          : t('story_viewer.parent_review_pending_share_blocked')
      );
      return;
    }

    const isPublished = !!story?.isPublished;
    const shareUrl = story?.shareUrl;
    const title = story?.title || t('story_viewer.untitled_story');

    if (!isPublished || !shareUrl) {
      setPublishShareUrl(null);
      setPublishDialogOpenedFromShare(true);
      setPublishShareDialogVisible(true);
      return;
    }

    if (Platform.OS === 'web') {
      setPublishShareUrl(shareUrl);
      setPublishShareDialogVisible(true);
      return;
    }

    const message = t('story_viewer.share_message', { title });
    const shareTitle = t('story_viewer.share_title');
    try {
      await Share.share({ url: shareUrl, message, title: shareTitle });
      getAnalytics().capture('story_shared', { story_id: storyId });
    } catch (_) {}
  }, [parentReviewBlocksSharing, parentReviewStatus, story, storyId, t]);

  const handlePublishAndShare = useCallback(
    async (
      visibility: 'public' | 'unlisted' = 'public',
      coverAssetId?: string | null,
      pseudonym?: string,
      aboutMe?: string
    ) => {
      try {
        if (parentReviewBlocksSharing) {
          toastService.error(
            parentReviewStatus === 'rejected'
              ? t('story_viewer.parent_review_rejected_share_blocked')
              : t('story_viewer.parent_review_pending_share_blocked')
          );
          return;
        }
        if (!isChildSession && !user?.pseudonym && pseudonym) {
          await updateMe.mutateAsync({ pseudonym });
        }
        const result = await publishStory.mutateAsync({
          storyId,
          isPublished: true,
          visibility,
          coverAssetId,
          ...(isChildSession && pseudonym ? { childAuthorPseudonym: pseudonym } : {}),
          ...(isChildSession && aboutMe ? { childAuthorAboutMe: aboutMe } : {}),
        });
        if (result?.shareUrl) {
          getAnalytics().capture('story_published', {
            story_id: storyId,
            visibility,
          });
          const count = result.publishedStoriesCount ?? 0;
          if (count > 0) {
            const ordinal = getOrdinal(count, i18n.language);
            toastService.success(
              (t as (k: string, o?: Record<string, unknown>) => string)(
                'story_viewer.publish_success_ordinal',
                { ordinal }
              )
            );
          }
          if (Platform.OS === 'web') {
            setPublishShareUrl(result.shareUrl);
            return;
          }
          setPublishShareDialogVisible(false);
          const message = t('story_viewer.share_message', {
            title: story?.title || t('story_viewer.untitled_story'),
          });
          const shareTitle = t('story_viewer.share_title');
          await Share.share({ url: result.shareUrl, message, title: shareTitle });
          getAnalytics().capture('story_shared', {
            story_id: storyId,
          });
        }
      } catch (_) {}
    },
    [
      isChildSession,
      parentReviewBlocksSharing,
      parentReviewStatus,
      storyId,
      story?.title,
      user?.pseudonym,
      publishStory,
      updateMe,
      t,
    ]
  );

  // Open PublishShareDialog (pre-publish or update visibility)
  const handleOpenPublishDialog = useCallback(() => {
    if (parentReviewBlocksSharing) {
      toastService.error(
        parentReviewStatus === 'rejected'
          ? t('story_viewer.parent_review_rejected_share_blocked')
          : t('story_viewer.parent_review_pending_share_blocked')
      );
      return;
    }
    setPublishShareUrl(null);
    setPublishDialogOpenedFromShare(false);
    setPublishShareDialogVisible(true);
  }, [parentReviewBlocksSharing, parentReviewStatus, t]);

  const handleUnpublish = useCallback(() => {
    setUnpublishDialogVisible(true);
  }, []);

  const confirmUnpublish = useCallback(async () => {
    await publishStory.mutateAsync({ storyId, isPublished: false });
    setUnpublishDialogVisible(false);
    setPublishShareDialogVisible(false);
    setPublishShareUrl(null);
  }, [storyId, publishStory]);

  const handleParentReview = useCallback(
    async (status: 'approved' | 'rejected') => {
      if (!storyId) return;
      try {
        await reviewChildStory.mutateAsync({ storyId, status });
        toastService.success(
          status === 'approved'
            ? t('story_viewer.parent_review_approved_toast')
            : t('story_viewer.parent_review_rejected_toast')
        );
      } catch (_) {
        toastService.error(t('story_viewer.parent_review_error'));
      }
    },
    [reviewChildStory, storyId, t]
  );

  // M6: Get active scene index from sentence metadata
  const activeSceneIndex =
    activeSentenceIndex !== null ? (sentences[activeSentenceIndex]?.sceneIndex ?? null) : null;
  const activeScene =
    activeSceneIndex !== null ? ((story?.scenes?.[activeSceneIndex] as any) ?? null) : null;
  const activeGraphicNovelPageNumber =
    activeSceneIndex !== null
      ? Number.isFinite(Number(activeScene?.graphicNovelPageNumber))
        ? Number(activeScene?.graphicNovelPageNumber)
        : isGraphicNovel
          ? activeSceneIndex + 1
          : null
      : null;
  const activeSentenceText =
    activeSentenceIndex !== null
      ? normalizeHighlightText(sentences[activeSentenceIndex]?.text ?? '')
      : '';
  const activeGraphicNovelTextItem = useMemo<GraphicNovelTextOverlayItem | null>(() => {
    if (!hasGraphicNovelPages || !effectiveHighlightEnabled || !activeSentenceText) return null;
    if (activeGraphicNovelPageNumber === null) return null;

    const page = graphicNovelPages.find(
      (candidate) => Number(candidate.pageNumber) === activeGraphicNovelPageNumber
    );
    const items = page?.textOverlay?.items ?? [];
    return (
      items.find((item) => {
        const itemText = normalizeHighlightText(item.text || item.audioText || item.rawText || '');
        return !!itemText && (itemText.includes(activeSentenceText) || activeSentenceText.includes(itemText));
      }) ?? null
    );
  }, [
    activeGraphicNovelPageNumber,
    activeSentenceText,
    effectiveHighlightEnabled,
    graphicNovelPages,
    hasGraphicNovelPages,
  ]);
  const activeGraphicNovelPanelKey = activeGraphicNovelTextItem
    ? graphicNovelPanelKey(activeGraphicNovelTextItem.pageNumber, activeGraphicNovelTextItem.panelIndex)
    : null;

  const scrollTargetToViewportCenter = useCallback(
    (targetElement: View | null, fallbackTopOffset = 100) => {
      if (!targetElement) return;

      if (Platform.OS === 'web') {
        const element = targetElement as any;
        if (element?.scrollIntoView) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest',
          });
        }
        return;
      }

      targetElement.measureLayout(
        scrollViewRef.current as any,
        (_x, y, _width, height) => {
          const centeredY =
            scrollViewportHeight > 0
              ? y + height / 2 - scrollViewportHeight / 2
              : y - fallbackTopOffset;
          scrollViewRef.current?.scrollTo({
            y: Math.max(centeredY, 0),
            animated: true,
          });
        },
        () => {
          // Measurement failed, ignore
        }
      );
    },
    [scrollViewportHeight]
  );

  // M6: Auto-scroll active scene to center of viewport
  useEffect(() => {
    if (!effectiveHighlightEnabled || activeSceneIndex === null) {
      return;
    }

    if (hasGraphicNovelPages && activeGraphicNovelPageNumber !== null) {
      const panelElement = activeGraphicNovelPanelKey
        ? graphicNovelPanelRefs.current[activeGraphicNovelPanelKey]
        : null;
      scrollTargetToViewportCenter(panelElement ?? sceneRefs.current[activeSceneIndex]);
      return;
    }

    scrollTargetToViewportCenter(sceneRefs.current[activeSceneIndex]);
  }, [
    activeGraphicNovelPanelKey,
    activeGraphicNovelPageNumber,
    activeSceneIndex,
    effectiveHighlightEnabled,
    hasGraphicNovelPages,
    scrollTargetToViewportCenter,
  ]);

  const quizEnabled =
    !isChildSession || activeChild?.childMode?.childModeSettings?.quizGenerationEnabled !== false;

  useEffect(() => {
    if (!route.params?.scrollToQuiz || !storyId || !story || !quizEnabled) return;
    const autoScrollKey = `${storyId}:quiz`;
    if (quizAutoScrollKeyRef.current === autoScrollKey) return;
    quizAutoScrollKeyRef.current = autoScrollKey;

    const timeout = setTimeout(() => {
      const quizElement = quizSectionRef.current;
      if (!quizElement) {
        quizAutoScrollKeyRef.current = null;
        return;
      }

      if (Platform.OS === 'web') {
        const element = quizElement as any;
        if (element?.scrollIntoView) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest',
          });
        }
        return;
      }

      quizElement.measureLayout(
        scrollViewRef.current as any,
        (_x, y) => {
          scrollViewRef.current?.scrollTo({
            y: Math.max(y - 80, 0),
            animated: true,
          });
        },
        () => {}
      );
    }, 450);

    return () => clearTimeout(timeout);
  }, [quizEnabled, route.params?.scrollToQuiz, story, storyId]);

  useEffect(() => {
    return () => {
      if (quizHighlightTimeoutRef.current) {
        clearTimeout(quizHighlightTimeoutRef.current);
      }
    };
  }, []);

  const handleQuizScenePress = useCallback(
    (sceneId: number) => {
      const scenes = Array.isArray(story?.scenes) ? story.scenes : [];
      const sceneIndex = scenes.findIndex((scene: any) => scene.sceneId === sceneId);
      if (sceneIndex < 0) return;

      const sceneElement = sceneRefs.current[sceneIndex];
      if (!sceneElement) return;

      setHighlightedQuizSceneId(sceneId);
      if (quizHighlightTimeoutRef.current) {
        clearTimeout(quizHighlightTimeoutRef.current);
      }
      quizHighlightTimeoutRef.current = setTimeout(() => {
        setHighlightedQuizSceneId((current) => (current === sceneId ? null : current));
        quizHighlightTimeoutRef.current = null;
      }, 4200);

      if (Platform.OS === 'web') {
        const element = sceneElement as any;
        if (element?.scrollIntoView) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest',
          });
        }
        return;
      }

      sceneElement.measureLayout(
        scrollViewRef.current as any,
        (_x, y) => {
          scrollViewRef.current?.scrollTo({
            y: y - 100,
            animated: true,
          });
        },
        () => {}
      );
    },
    [story?.scenes]
  );

  const handleGenerateAudio = async () => {
    console.log('[handleGenerateAudio] Called with:', {
      selectedVoiceId,
      storyId,
      isPending: generateAudio.isPending,
      isGenerating,
    });

    const isRetry = !playerAudioData && story?.audioMetadata?.error === true;
    if (isRetry) {
      getAnalytics().capture('retry_audio_clicked', { story_id: storyId });
    }

    if (!selectedVoiceId) {
      console.log('[handleGenerateAudio] No voice selected');
      toastService.error(t('toast.audio_error_title'), t('toast.select_voice_first'));
      return;
    }

    setAudioGenerationRequested(true);
    try {
      console.log('[handleGenerateAudio] Starting mutation...');
      await generateAudio.mutateAsync({
        storyId,
        voiceId: selectedVoiceId,
      });

      if (!isRetry) {
        getAnalytics().capture('audio_generation_requested', {
          story_id: storyId,
          voice_id: selectedVoiceId,
        });
      }

      console.log('[handleGenerateAudio] Mutation succeeded');

      // Reset limit state on success
      setAudioLimitExceeded(false);
      setLimitInfo(null);

      // Invalidate usage query to show updated counter
      queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });

      toastService.info('Готуємо аудіосказку', 'Це може зайняти кілька хвилин');
    } catch (error: any) {
      setAudioGenerationRequested(false);
      console.log('[handleGenerateAudio] Error:', error);
      console.log('[handleGenerateAudio] Error response:', error?.response);

      // Check if it's a limit exceeded error
      if (error?.response?.data?.code === 'AUDIO_LIMIT_EXCEEDED') {
        console.log('[handleGenerateAudio] Audio limit exceeded');
        getAnalytics().capture('audio_limit_exceeded', { story_id: storyId });
        setAudioLimitExceeded(true);
        setLimitInfo({
          limit: error.response.data.limit,
          used: error.response.data.used,
          resetsAt: error.response.data.resetsAt,
        });
      } else if (error.response?.status === 403) {
        console.log('[handleGenerateAudio] 403 error:', error.response.data);
        const errorCode = error.response?.data?.code;
        if (errorCode === 'AUDIO_NOT_AVAILABLE') {
          toastService.error('Аудіосказки недоступні', 'Оновіть тариф для озвучування історій');
        } else {
          toastService.error('Ліміт вичерпано', error.response.data.message);
        }
      } else {
        console.log('[handleGenerateAudio] Generic error');
        getAnalytics().capture('audio_generation_failed', {
          story_id: storyId,
          voice_id: selectedVoiceId,
        });
        toastService.error(
          t('toast.audio_error_title'),
          getLocalizedApiError(t, error, 'story_viewer.audio_error_default')
        );
      }
    }
  };

  // Track audio_generation_failed when user sees failed state (e.g. opened story with failed audio)
  // MUST be before early returns — hooks must run on every render
  const audioFailed = !playerAudioData && story?.audioMetadata?.error === true;
  const audioFailedTrackedRef = useRef(false);
  useEffect(() => {
    if (audioFailed && storyId && !audioFailedTrackedRef.current) {
      audioFailedTrackedRef.current = true;
      getAnalytics().capture('audio_generation_failed', { story_id: storyId });
    }
  }, [audioFailed, storyId]);

  if (!storyId || isLoading) {
    return <StoryViewerSkeleton />;
  }

  if (error || !story) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Не вдалося завантажити історію</Text>
      </View>
    );
  }

  const hasGenerationInProgress = isGenerating || audioStatus?.jobStatus === 'processing';
  const showGeneratingBlock =
    hasGenerationInProgress || generateAudio.isPending || audioGenerationRequested;

  // M8: Render continue section (after story content)
  const renderContinueButton = () => {
    // Hide if there's a next part in the series
    if (seriesInfo && story.partNumber && story.partNumber < seriesInfo.totalParts) {
      return null;
    }
    return (
      <ContinueSeriesSection
        storyId={storyId}
        seriesInfo={
          seriesInfo
            ? { totalParts: seriesInfo.totalParts, baseTitle: seriesInfo.baseTitle }
            : undefined
        }
        userPlan={userPlan}
        onNavigateToPlans={() => navigation.navigate('Plans' as any)}
      />
    );
  };

  // M8: Render series navigation (previous/next buttons)
  const renderSeriesNavigation = () => {
    // DEBUG: Log series info
    console.log('[StoryViewer] Series navigation check:', {
      hasSeriesInfo: !!seriesInfo,
      hasSeriesId: !!story.seriesId,
      seriesInfo: seriesInfo,
      storyPartNumber: story.partNumber,
    });

    if (!seriesInfo || !story.seriesId) return null;

    const { partNumber, totalParts, storyIds, storyTitles = [] } = seriesInfo;
    const currentIndex = partNumber - 1;

    console.log('[StoryViewer] Rendering series navigation:', {
      partNumber,
      totalParts,
      currentIndex,
      storyIdsCount: storyIds?.length,
      hasPrevious: currentIndex > 0,
      hasNext: currentIndex < totalParts - 1,
    });

    return (
      <View style={styles.seriesNavigation}>
        <Text style={styles.partIndicator}>
          {t('series.part_number', { number: partNumber })}{' '}
          {t('series.of_parts', { total: totalParts })}
        </Text>
        {currentIndex > 0 && (
          <AppButton
            label={
              storyTitles[currentIndex - 1]
                ? `${t('series.part_number', { number: currentIndex })}: ${storyTitles[currentIndex - 1]}`
                : t('series.part_number', { number: currentIndex })
            }
            onPress={() => navigateToStory(storyIds[currentIndex - 1])}
            variant="secondary"
            leading={<Ionicons name="arrow-back" size={20} color={theme.colors.interactive.primary} />}
            style={styles.seriesNavAction}
          />
        )}

        {currentIndex < totalParts - 1 && (
          <AppButton
            label={
              storyTitles[currentIndex + 1]
                ? `${t('series.part_number', { number: currentIndex + 2 })}: ${storyTitles[currentIndex + 1]}`
                : t('series.part_number', { number: currentIndex + 2 })
            }
            onPress={() => navigateToStory(storyIds[currentIndex + 1])}
            variant="secondary"
            trailing={
              <Ionicons name="arrow-forward" size={20} color={theme.colors.interactive.primary} />
            }
            style={styles.seriesNavAction}
          />
        )}
      </View>
    );
  };

  // Render audio generation section (reusable component)
  // Hide when we have valid playerAudioData (API returned audioUrl) — prevents showing error + player together
  const renderAudioGenerationSection = () =>
    isChildSession
      ? null
      : !playerAudioData &&
        (!story.audioMetadata || audioFailed || showGeneratingBlock) && (
          <View style={styles.audioGenerationSection}>
            {audioLimitExceeded && limitInfo ? (
              // Limit exceeded message with upgrade button
              <View style={styles.limitExceededContainer}>
                <Text style={styles.limitExceededIcon}>🔒</Text>
                <Text style={styles.limitExceededTitle}>
                  {t('story_viewer.audio_limit_reached')}
                </Text>
                <Text style={styles.limitExceededMessage}>
                  {t('story_viewer.audio_limit_message', {
                    used: limitInfo.used,
                    limit: limitInfo.limit,
                  })}
                </Text>

                <AppButton
                  label={t('story_viewer.upgrade_plan')}
                  onPress={() => navigation.navigate('Plans')}
                  style={styles.audioLimitAction}
                />

                <Text style={styles.limitExceededDetails}>
                  {t('story_viewer.next_plan_benefit')}
                </Text>
                <Text style={styles.limitExceededDetails}>{bundleHintText}</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Plans' as any)}>
                  <Text style={styles.bundlePricingLink}>
                    {t('story_viewer.bundle_pricing_link')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : showGeneratingBlock ? (
              // Show loading state during generation with queue info
              <View style={styles.generatingContainer}>
                <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
                <Text style={styles.generatingText}>
                  {jobStatus === 'queued'
                    ? queuePosition && queuePosition > 0
                      ? t('story_viewer.audio_queue_position', { position: queuePosition })
                      : t('story_viewer.audio_queued')
                    : t('story_viewer.audio_generating')}
                </Text>
                {jobStatus === 'queued' && estimatedWaitMs && estimatedWaitMs > 0 && (
                  <Text style={styles.generatingHint}>
                    {t('story_viewer.audio_queue_wait', {
                      time: formatWaitTime(estimatedWaitMs, t),
                    })}
                  </Text>
                )}
                <Text style={styles.generatingHint}>
                  {jobStatus === 'processing' && processingStartedAt && estimatedProcessingMs
                    ? formatWaitTime(
                        Math.max(0, estimatedProcessingMs - (Date.now() - processingStartedAt)),
                        t
                      )
                    : t('toast.audio_generating_message')}
                </Text>
              </View>
            ) : (
              // Normal audio generation UI
              <>
                {/* Show inline warning if previous generation failed */}
                {audioFailed && (
                  <View style={styles.inlineWarning}>
                    <Text style={styles.warningIcon}>⚠️</Text>
                    <View style={styles.warningTextContainer}>
                      <Text style={styles.warningTitle}>
                        {t('story_viewer.previous_attempt_failed')}
                      </Text>
                      <Text style={styles.warningNote}>
                        {t('story_viewer.retry_will_reuse_chunks')}
                      </Text>
                    </View>
                  </View>
                )}

                {isLoadingVoices ? (
                  <View style={{ padding: 20 }}>
                    <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
                    <Text
                      style={{
                        textAlign: 'center',
                        marginTop: 8,
                        color: theme.colors.text.secondary,
                      }}
                    >
                      {t('story_viewer.loading_voices')}
                    </Text>
                  </View>
                ) : voicesError ? (
                  <View
                    style={{
                      padding: 16,
                      backgroundColor: theme.colors.status.error + '20',
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.status.error,
                        marginBottom: 8,
                        fontWeight: '600',
                      }}
                    >
                      ❌ {t('story_viewer.voices_error')}
                    </Text>
                    <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>
                      {String(voicesError)}
                    </Text>
                  </View>
                ) : voices.length === 0 ? (
                  <Text
                    style={{ color: theme.colors.status.error, padding: 16, textAlign: 'center' }}
                  >
                    ❌ {t('story_viewer.no_voices')}
                  </Text>
                ) : (
                  <VoiceSelector
                    voices={voices}
                    selectedVoiceId={selectedVoiceId}
                    onVoiceChange={(voiceId) => {
                      setSelectedVoiceId(voiceId);
                      const voice = voices.find((v) => v.id === voiceId);
                      setSelectedVoice(voice);
                      void storage.setPreferredStoryVoiceId(voiceId);
                    }}
                    language={storyLanguage ?? 'uk'}
                    userPlan={userPlan}
                    hasPremiumAccess={hasPremiumAccess}
                    onUpgrade={() => {
                      navigation.navigate('Plans' as any);
                    }}
                    audioUsage={audioUsage}
                  />
                )}

                {/* Conditional button based on selected voice */}
                {(() => {
                  console.log('[StoryViewer] Button rendering state:', {
                    selectedVoiceId,
                    selectedVoiceIsLocked: selectedVoice?.isLocked,
                    isGenerating,
                    generateAudioIsPending: generateAudio.isPending,
                    audioFailed,
                  });
                  return null;
                })()}

                {selectedVoice?.isLocked ? (
                  // Premium voice selected but locked - show upgrade button
                  <TouchableOpacity
                    style={[styles.audioButton, styles.audioButtonUpgrade]}
                    onPress={() => navigation.navigate('Plans' as any)}
                  >
                    <Text style={styles.audioButtonText}>
                      ⭐ {t('voice_selector.upgrade_to_unlock')}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  // Free voice or unlocked premium - show generate audio button
                  <TouchableOpacity
                    style={[
                      styles.audioButton,
                      (isGenerating || generateAudio.isPending) && styles.audioButtonDisabled,
                    ]}
                    onPress={handleGenerateAudio}
                    disabled={isGenerating || generateAudio.isPending}
                  >
                    {isGenerating || generateAudio.isPending ? (
                      <>
                        <ActivityIndicator
                          size="small"
                          color="#fff"
                          style={styles.audioButtonSpinner}
                        />
                        <Text style={styles.audioButtonText}>
                          {jobStatus && jobStatus === 'queued'
                            ? t('story_viewer.audio_queued')
                            : t('story_viewer.audio_generating')}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.audioButtonText}>
                        🎧{' '}
                        {audioFailed ? t('story_viewer.try_again') : t('story_viewer.create_audio')}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        );

  const renderParentReviewPanel = () => {
    if (story?.createdByMode !== 'child' || parentReviewStatus === 'not_required') {
      return null;
    }

    const isPendingReview = parentReviewStatus === 'pending';
    const isRejected = parentReviewStatus === 'rejected';
    const isApproved = parentReviewStatus === 'approved';
    const iconName = isApproved
      ? 'checkmark-circle-outline'
      : isRejected
        ? 'close-circle-outline'
        : 'time-outline';

    return (
      <View
        style={[
          styles.parentReviewPanel,
          isApproved && styles.parentReviewPanelApproved,
          isRejected && styles.parentReviewPanelRejected,
        ]}
      >
        <View style={styles.parentReviewHeader}>
          <Ionicons
            name={iconName}
            size={22}
            color={
              isApproved
                ? theme.colors.status.success
                : isRejected
                  ? theme.colors.status.error
                  : theme.colors.status.warning
            }
          />
          <Text style={styles.parentReviewTitle}>
            {isApproved
              ? t('story_viewer.parent_review_approved_title')
              : isRejected
                ? t('story_viewer.parent_review_rejected_title')
                : t('story_viewer.parent_review_pending_title')}
          </Text>
        </View>
        <Text style={styles.parentReviewMessage}>
          {isApproved
            ? t('story_viewer.parent_review_approved_message')
            : isRejected
              ? t('story_viewer.parent_review_rejected_message')
              : t('story_viewer.parent_review_pending_message')}
        </Text>
        {isPendingReview && (
          <View style={styles.parentReviewActions}>
            <TouchableOpacity
              style={[styles.parentReviewButton, styles.parentReviewRejectButton]}
              onPress={() => handleParentReview('rejected')}
              disabled={reviewChildStory.isPending}
            >
              <Ionicons name="close-outline" size={18} color={theme.colors.status.error} />
              <Text style={styles.parentReviewRejectText}>
                {t('story_viewer.parent_review_reject')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.parentReviewButton, styles.parentReviewApproveButton]}
              onPress={() => handleParentReview('approved')}
              disabled={reviewChildStory.isPending}
            >
              {reviewChildStory.isPending ? (
                <ActivityIndicator size="small" color={theme.colors.text.inverse} />
              ) : (
                <Ionicons name="checkmark-outline" size={18} color={theme.colors.text.inverse} />
              )}
              <Text style={styles.parentReviewApproveText}>
                {t('story_viewer.parent_review_approve')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderArtifactAwareSceneText = (scene: any, fallbackText: string) => {
    if (!closingArtifact) {
      return fallbackText;
    }
    if (!Array.isArray(scene?.textSegments)) {
      return renderArtifactMarkerText(
        fallbackText,
        stripArtifactMarkers(fallbackText),
        `scene-${scene?.sceneId ?? 'text'}`,
        { includeIcon: true }
      );
    }

    const segments = scene.textSegments
      .map((segment: any, index: number) => {
        const text = removeAudioTags(String(segment?.text ?? ''));
        if (!text) return null;

        return {
          key: `${segment?.type || 'text'}-${index}`,
          type: segment?.type,
          text,
          label: String(segment?.label || text).trim(),
        };
      })
      .filter(Boolean) as Array<{ key: string; type: string; text: string; label: string }>;

    const rendered = segments
      .map((segment, index) => {
        if (segment.type === 'artifact') {
          const text = segment.text.trim();
          const previousText = segments[index - 1]?.text ?? '';
          const nextText = segments[index + 1]?.text ?? '';
          const prefix = needsInlineSpaceBefore(previousText, text) ? ' ' : '';
          const suffix = needsInlineSpaceAfter(text, nextText) ? ' ' : '';

          return (
            <React.Fragment key={segment.key}>
              {prefix}
              <Text style={styles.artifactInline} onPress={() => handleOpenArtifact(segment.label)}>
                <Ionicons
                  name="sparkles-outline"
                  size={18}
                  color={theme.colors.interactive.primary}
                  style={styles.artifactInlineIcon}
                />
                {'\u00A0'}
                {text}
              </Text>
              {suffix}
            </React.Fragment>
          );
        }

        return segment.text;
      })
      .filter(Boolean);

    return rendered.length > 0 ? rendered : fallbackText;
  };

  function renderArtifactMarkerText(
    rawText: string,
    fallbackText: string,
    keyPrefix: string,
    options: { includeIcon?: boolean } = {}
  ): React.ReactNode {
    if (!closingArtifact || !rawText.includes('{')) {
      return fallbackText;
    }

    const rendered = splitArtifactMarkerText(rawText)
      .map((part, index) => {
        if (!part.text) return null;
        if (part.type !== 'artifact') return part.text;

        return (
          <Text
            key={`${keyPrefix}-artifact-${index}`}
            style={styles.artifactInline}
            onPress={() => handleOpenArtifact(part.label)}
          >
            {options.includeIcon ? (
              <>
                <Ionicons
                  name="sparkles-outline"
                  size={18}
                  color={theme.colors.interactive.primary}
                  style={styles.artifactInlineIcon}
                />
                {'\u00A0'}
              </>
            ) : null}
            {part.text}
          </Text>
        );
      })
      .filter(Boolean);

    return rendered.length > 0 ? rendered : fallbackText;
  }

  const renderAlignedSentenceWords = (
    sentence: (typeof sentences)[number],
    sentenceIndex: number,
    isSentenceActive: boolean
  ): React.ReactNode[] => {
    const artifactRanges = closingArtifact ? getArtifactDisplayRanges(sentence.text) : [];
    const displaySentenceText = stripArtifactMarkers(sentence.text);
    let searchFrom = 0;

    const wordPositions = sentence.words.map((word) => {
      const foundAt = displaySentenceText.indexOf(word.text, searchFrom);
      const start = foundAt >= 0 ? foundAt : searchFrom;
      const end = start + word.text.length;
      searchFrom = end;
      return { start, end };
    });

    const artifactIndexForWord = (wordIndex: number): number => {
      const position = wordPositions[wordIndex];
      if (!position) return -1;
      const midpoint = position.start + (position.end - position.start) / 2;
      return artifactRanges.findIndex((range) => midpoint >= range.start && midpoint <= range.end);
    };

    const renderedWords: React.ReactNode[] = [];
    let wordIndex = 0;

    while (wordIndex < sentence.words.length) {
      const artifactIndex = artifactIndexForWord(wordIndex);
      const renderWord = (word: (typeof sentence.words)[number], index: number) => {
        const isActiveWord = isSentenceActive && index === activeWordIndex;
        const wordStyle = isSentenceActive
          ? isActiveWord
            ? styles.activeWordColor
            : styles.inactiveWordColor
          : undefined;

        return <Text style={wordStyle}>{word.text}</Text>;
      };

      if (artifactIndex >= 0) {
        const range = artifactRanges[artifactIndex];
        const startIndex = wordIndex;
        const artifactWords: React.ReactNode[] = [];

        while (
          wordIndex < sentence.words.length &&
          artifactIndexForWord(wordIndex) === artifactIndex
        ) {
          artifactWords.push(
            <React.Fragment key={`${sentenceIndex}-artifact-${startIndex}-${wordIndex}`}>
              {renderWord(sentence.words[wordIndex], wordIndex)}
              {wordIndex < sentence.words.length - 1 &&
              artifactIndexForWord(wordIndex + 1) === artifactIndex
                ? ' '
                : null}
            </React.Fragment>
          );
          wordIndex += 1;
        }

        renderedWords.push(
          <React.Fragment key={`${sentenceIndex}-artifact-${startIndex}`}>
            <Text style={styles.artifactInline} onPress={() => handleOpenArtifact(range.label)}>
              <Ionicons
                name="sparkles-outline"
                size={18}
                color={theme.colors.interactive.primary}
                style={styles.artifactInlineIcon}
              />
              {'\u00A0'}
              {artifactWords}
            </Text>
            {wordIndex < sentence.words.length ? ' ' : null}
          </React.Fragment>
        );
        continue;
      }

      renderedWords.push(
        <React.Fragment key={`${sentenceIndex}-${wordIndex}`}>
          {renderWord(sentence.words[wordIndex], wordIndex)}
          {wordIndex < sentence.words.length - 1 ? ' ' : null}
        </React.Fragment>
      );
      wordIndex += 1;
    }

    return renderedWords;
  };

  const renderAlignedTextContent = (
    cleanedText: string,
    sceneIndex: number,
    options: { preserveTrailingSpaces?: boolean } = {}
  ): React.ReactNode[] | null => {
    if (!effectiveHighlightEnabled || !story.audioMetadata?.alignment || sentences.length === 0) {
      return null;
    }

    const sceneSentences = sentences.filter((s) => s.sceneIndex === sceneIndex);

    if (sceneSentences.length === 0) {
      return null;
    }

    const renderedText: React.ReactNode[] = [];
    let lastIndex = 0;
    let matchedSentenceCount = 0;

    sceneSentences.forEach((sentence, sentenceLocalIndex) => {
      const sentenceIndex = sentences.indexOf(sentence);
      const isSentenceActive = effectiveHighlightEnabled && sentenceIndex === activeSentenceIndex;
      const sentenceDisplayText = stripArtifactMarkers(sentence.text);

      // Find sentence position in scene text
      let matchedSentenceText = sentence.text;
      let sentencePos = cleanedText.indexOf(matchedSentenceText, lastIndex);
      if (sentencePos === -1 && sentenceDisplayText !== sentence.text) {
        matchedSentenceText = sentenceDisplayText;
        sentencePos = cleanedText.indexOf(matchedSentenceText, lastIndex);
      }
      if (sentencePos === -1) return;
      matchedSentenceCount += 1;

      // Add text before sentence (if any)
      if (sentencePos > lastIndex) {
        renderedText.push(cleanedText.substring(lastIndex, sentencePos));
      }

      // When highlight is ON: render individual words with color styles
      // When highlight is OFF: render plain sentence text without word wrappers
      if (effectiveHighlightEnabled) {
        // Render sentence wrapper with individual words
        const sentenceWords = renderAlignedSentenceWords(sentence, sentenceIndex, isSentenceActive);

        // Wrap sentence with background (if active) and gray color (if inactive)
        renderedText.push(
          <Text
            key={`sentence-${sentenceIndex}`}
            style={[
              styles.sentenceText,
              isSentenceActive && styles.activeSentenceBackground,
              !isSentenceActive && styles.grayTextColor, // Gray for inactive sentences
            ]}
          >
            {sentenceWords}
          </Text>
        );
      } else {
        // Highlight OFF: render plain sentence text (no word wrappers, black color)
        renderedText.push(
          <Text key={`sentence-${sentenceIndex}`} style={styles.sentenceText}>
            {sentenceDisplayText}
          </Text>
        );
      }

      // Add space after sentence (unless it's the last sentence)
      if (
        options.preserveTrailingSpaces &&
        sentenceLocalIndex < sceneSentences.length - 1 &&
        sentencePos + matchedSentenceText.length < cleanedText.length
      ) {
        renderedText.push(' ');
      }

      lastIndex = sentencePos + matchedSentenceText.length;
    });

    if (matchedSentenceCount === 0) {
      return null;
    }

    // Add remaining text after last sentence
    if (lastIndex < cleanedText.length) {
      renderedText.push(cleanedText.substring(lastIndex));
    }

    return renderedText;
  };

  // M6: Helper to render scene text with sentence/word wrappers
  const renderSceneTextWithHighlight = (scene: any, sceneIndex: number) => {
    const sceneText = typeof scene === 'string' ? scene : scene?.text || '';
    const cleanedSceneText = removeAudioTags(sceneText);

    if (!effectiveHighlightEnabled) {
      return (
        <Text style={sceneTextStyle}>
          {renderArtifactAwareSceneText(scene, cleanedSceneText)}
        </Text>
      );
    }

    const renderedText = renderAlignedTextContent(cleanedSceneText, sceneIndex, {
      preserveTrailingSpaces: true,
    });
    if (!renderedText) {
      return <Text style={sceneTextStyle}>{cleanedSceneText}</Text>;
    }

    return <Text style={sceneTextStyle}>{renderedText}</Text>;
  };

  // M6: Render story scenes with optional highlighting
  const findGraphicNovelSceneIndex = (pageNumber: number) => {
    const sceneIndex = story.scenes?.findIndex((scene: any, index: number) => {
      const scenePageNumber = Number(scene?.graphicNovelPageNumber ?? scene?.sceneId ?? index + 1);
      return scenePageNumber === pageNumber;
    });
    return typeof sceneIndex === 'number' && sceneIndex >= 0
      ? sceneIndex
      : Math.max(0, pageNumber - 1);
  };

  const isGraphicNovelTextActive = (item: GraphicNovelTextOverlayItem) => {
    if (!effectiveHighlightEnabled || !activeSentenceText) return false;
    if (activeGraphicNovelPageNumber !== item.pageNumber) return false;
    const itemText = normalizeHighlightText(item.text || item.audioText || item.rawText || '');
    if (!itemText) return false;
    return itemText.includes(activeSentenceText) || activeSentenceText.includes(itemText);
  };

  const renderGraphicNovelTextItem = (
    item: GraphicNovelTextOverlayItem,
    pageWidth: number,
    textStyle?: GraphicNovelTextOverlay['textStyle'] | null
  ) => {
    const rawText = removeAudioTags(item.rawText || item.text || item.audioText || '');
    const text = stripArtifactMarkers(removeAudioTags(item.text || item.audioText || rawText));
    if (!text.trim()) return null;
    const bubbleTextStyle = resolveGraphicNovelBubbleTextStyle(textStyle, proseTextSizePx);
    const textScale = pageWidth / bubbleTextStyle.targetPageWidthPx;

    const sceneIndex = findGraphicNovelSceneIndex(item.pageNumber);
    const highlightedText = renderAlignedTextContent(text, sceneIndex);
    const isActive = !highlightedText && isGraphicNovelTextActive(item);
    const rectStyle = item.cssPercent
      ? item.cssPercent
      : {
          left: `${item.rect.x * 100}%`,
          top: `${item.rect.y * 100}%`,
          width: `${item.rect.width * 100}%`,
          height: `${item.rect.height * 100}%`,
        };

    return (
      <View
        key={item.segmentId || item.id}
        pointerEvents="box-none"
        style={[
          styles.graphicNovelTextBox,
          rectStyle as any,
          {
            paddingHorizontal: bubbleTextStyle.paddingXPx * textScale,
            paddingVertical: bubbleTextStyle.paddingYPx * textScale,
          },
        ]}
        accessibilityLabel={item.ariaLabel}
      >
        <Text
          selectable
          style={[
            styles.graphicNovelBubbleText,
            {
              fontSize: bubbleTextStyle.fontSizePx * textScale,
              lineHeight: bubbleTextStyle.lineHeightPx * textScale,
            },
            isActive && styles.graphicNovelBubbleTextActive,
          ]}
        >
          {highlightedText ??
            renderArtifactMarkerText(rawText, text, `graphic-novel-${item.segmentId || item.id}`, {
              includeIcon: true,
            })}
        </Text>
      </View>
    );
  };

  const renderGraphicNovelPanelAnchors = (page: GraphicNovelPageApi) => {
    const panels = Array.isArray(page.layoutJson?.panels)
      ? page.layoutJson.panels
      : Array.isArray(page.panels)
        ? page.panels
        : [];

    return panels.map((_panel: any, index: number) => {
      const panelIndex = index + 1;
      const rect = panelRectFromGraphicNovelPage(page, panelIndex);
      if (!rect) return null;

      return (
        <View
          key={`panel-anchor-${page.pageNumber}-${panelIndex}`}
          pointerEvents="none"
          ref={(ref: View | null) => {
            graphicNovelPanelRefs.current[graphicNovelPanelKey(page.pageNumber, panelIndex)] = ref;
          }}
          style={[
            styles.graphicNovelPanelScrollAnchor,
            {
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            },
          ]}
        />
      );
    });
  };

  const graphicNovelPageSize = (page: GraphicNovelPageApi) => {
    const candidates = [
      page.textOverlay?.pageSize,
      page.layoutJson?.pageSize,
      page.layoutJson?.template?.pageSize,
      page.bubbleLayoutJson?.textOverlay?.pageSize,
    ];
    return candidates.find(
      (size) =>
        size &&
        typeof size.width === 'number' &&
        Number.isFinite(size.width) &&
        typeof size.height === 'number' &&
        Number.isFinite(size.height) &&
        size.width > 0 &&
        size.height > 0
    );
  };

  const graphicNovelPageAspectRatio = (page: GraphicNovelPageApi) => {
    const pageSize = graphicNovelPageSize(page);
    return pageSize ? pageSize.width / pageSize.height : 3 / 4;
  };

  const graphicNovelCanonicalWidth = (page: GraphicNovelPageApi) =>
    graphicNovelPageSize(page)?.width ?? GRAPHIC_NOVEL_CANONICAL_PAGE_WIDTH;

  const renderGraphicNovelPage = (page: GraphicNovelPageApi) => {
    const imageUrl = page.imageUrl ? (formatAssetUrl(page.imageUrl) ?? page.imageUrl) : null;
    const sceneIndex = findGraphicNovelSceneIndex(page.pageNumber);
    const isActivePage =
      effectiveHighlightEnabled && activeGraphicNovelPageNumber === page.pageNumber;
    const pageWidth = graphicNovelPageWidths[page.pageNumber] || graphicNovelCanonicalWidth(page);
    const pageFailed = page.status === 'failed';

    return (
      <View
        key={page.id || page.pageNumber}
        ref={(ref: View | null) => {
          sceneRefs.current[sceneIndex] = ref;
        }}
        style={[styles.graphicNovelPage, isActivePage && styles.graphicNovelPageActive]}
      >
        <View
          style={[
            styles.graphicNovelPageCanvas,
            isSingleColumn && styles.singleColumnMedia,
            { aspectRatio: graphicNovelPageAspectRatio(page) },
          ]}
          onLayout={(event) => handleGraphicNovelPageCanvasLayout(page.pageNumber, event)}
        >
          {imageUrl ? (
            <>
              <Image
                source={{ uri: imageUrl }}
                style={styles.graphicNovelPageImage as ImageStyle}
                resizeMode="contain"
              />
              {renderGraphicNovelPanelAnchors(page)}
              {page.textOverlay?.items?.map((item) =>
                renderGraphicNovelTextItem(item, pageWidth, page.textOverlay?.textStyle)
              )}
            </>
          ) : (
            <View style={styles.graphicNovelPagePlaceholder}>
              {pageFailed ? (
                <Ionicons
                  name="alert-circle-outline"
                  size={26}
                  color={theme.colors.status.error}
                />
              ) : (
                <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
              )}
              <Text style={styles.graphicNovelPagePlaceholderText}>
                {pageFailed
                  ? t('story_viewer.comic_page_failed', {
                      page: page.pageNumber,
                    })
                  : t('story_viewer.comic_page_preparing', {
                      page: page.pageNumber,
                    })}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderGraphicNovelPages = () => {
    if (!graphicNovelPages.length) {
      return (
        <View style={styles.graphicNovelLoading}>
          <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
          <Text style={styles.graphicNovelPagePlaceholderText}>
            {t('story_viewer.comic_loading')}
          </Text>
        </View>
      );
    }

    return graphicNovelPages.map(renderGraphicNovelPage);
  };

  const renderProseScene = (scene: any, sceneIndex: number, options: { showImage?: boolean } = {}) => {
    const showImage = options.showImage !== false;
    const isQuizHighlighted = highlightedQuizSceneId === scene.sceneId;
    return (
      <View
        key={scene.sceneId || sceneIndex}
        ref={(ref: View | null) => {
          sceneRefs.current[sceneIndex] = ref;
        }}
        style={styles.scene}
      >
        {showImage && scene.image?.url && scene.image?.status !== 'failed' ? (
          <Image
            source={{ uri: formatAssetUrl(scene.image.url) ?? scene.image.url }}
            style={[styles.sceneImage, isSingleColumn && styles.singleColumnMedia] as ImageStyle}
            resizeMode="cover"
          />
        ) : showImage && (story?.sceneIdsWithImages as number[] | undefined)?.includes(scene.sceneId) ? (
          <View style={[styles.sceneImagePlaceholder, isSingleColumn && styles.singleColumnMedia]}>
            <Text
              style={[
                styles.sceneImagePlaceholderText,
                (story?.failedScenes as Array<{ sceneId: number }> | undefined)?.some(
                  (f) => f.sceneId === scene.sceneId
                ) && styles.sceneImagePlaceholderTextError,
              ]}
            >
              {(story?.failedScenes as Array<{ sceneId: number }> | undefined)?.some(
                (f) => f.sceneId === scene.sceneId
              )
                ? t('story_viewer.image_failed')
                : t('story_viewer.image_preparing')}
            </Text>
          </View>
        ) : null}

        <View style={styles.sceneTextWrapper}>
          {isQuizHighlighted ? (
            <View pointerEvents="none" style={styles.sceneTextWrapperQuizHighlightLayer} />
          ) : null}
          {renderSceneTextWithHighlight(scene, sceneIndex)}
        </View>
      </View>
    );
  };

  const renderMixedStoryBlocks = () => {
    const pageByNumber = new Map(
      graphicNovelPages.map((page) => [Number(page.pageNumber), page])
    );
    return story.scenes?.map((scene: any, sceneIndex: number) => {
      if (scene?.mixedStoryBlockKind === 'comic' && scene.graphicNovelPageNumber) {
        const pageNumber = Number(scene.graphicNovelPageNumber);
        const page = pageByNumber.get(pageNumber);
        if (page) {
          return renderGraphicNovelPage(page);
        }
        return (
          <View
            key={`mixed-comic-pending-${scene.sceneId || pageNumber}`}
            ref={(ref: View | null) => {
              sceneRefs.current[sceneIndex] = ref;
            }}
            style={styles.graphicNovelPage}
          >
            <View
              style={[
                styles.graphicNovelPageCanvas,
                isSingleColumn && styles.singleColumnMedia,
                { aspectRatio: 2 },
              ]}
            >
              <View style={styles.graphicNovelPagePlaceholder}>
                <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                <Text style={styles.graphicNovelPagePlaceholderText}>
                  {t('story_viewer.comic_page_preparing', {
                    page: pageNumber,
                  })}
                </Text>
              </View>
            </View>
          </View>
        );
      }

      return renderProseScene(scene, sceneIndex, { showImage: false });
    });
  };

  const renderScenesWithHighlight = () => {
    if (isGraphicNovel) {
      return renderGraphicNovelPages();
    }
    if (isMixedStory) {
      return renderMixedStoryBlocks();
    }

    return story.scenes?.map((scene: any, sceneIndex: number) =>
      renderProseScene(scene, sceneIndex)
    );
  };

  const renderMapTileRewardButton = () => {
    const imagesReady = story?.imageGenerationComplete !== false;
    const disabled = generateMapTile.isPending || isStoryMapTileStatusLoading || !imagesReady;

    return (
      <View style={styles.mapTileReward}>
        <AppButton
          label={
            generateMapTile.isPending
              ? t('story_viewer.map_tile_generating')
              : t('story_viewer.map_tile_claim_prize')
          }
          onPress={handleOpenMapTilePrize}
          disabled={disabled}
          leading={
            generateMapTile.isPending || isStoryMapTileStatusLoading ? (
              <ActivityIndicator size="small" color={theme.colors.text.inverse} />
            ) : (
              <Ionicons name="gift-outline" size={20} color={theme.colors.text.inverse} />
            )
          }
          style={styles.mapTileRewardButton}
        />
      </View>
    );
  };

  const coverAssetOptions: CoverAssetOption[] = hasGraphicNovelPages
    ? graphicNovelPages.flatMap((page): CoverAssetOption[] =>
        page.imageAssetId
          ? [
              {
                assetId: page.imageAssetId,
                imageUrl: page.imageUrl ?? null,
              },
            ]
          : []
      )
    : (story?.scenes?.flatMap(
        (s: {
          image?: { id?: string; url?: string };
          imageUrl?: string | null;
        }): CoverAssetOption[] =>
          s.image?.id
            ? [
                {
                  assetId: s.image.id,
                  imageUrl: s.image?.url ?? s.imageUrl ?? null,
                },
              ]
            : []
      ) ?? []);

  const parentReviewPanel = renderParentReviewPanel();

  return (
    <View style={styles.container}>
      {/* Layout decision based on breakpoint */}
      {isSingleColumn ? (
        // Mobile + Tablet Portrait: Single Column with FAB
        <>
          <ScrollView
            ref={scrollViewRef}
            style={styles.container}
            onLayout={handleScrollViewportLayout}
          >
            {/* Reading Time (mobile) */}
            {readingTimeMinutes > 0 && (
              <View style={[styles.mobileSectionWrapper, styles.readingTimeSection]}>
                <View style={styles.readingTimeRow}>
                  <Ionicons name="time-outline" size={18} color={theme.colors.text.secondary} />
                  <Text style={styles.readingTimeText}>
                    {t('story_viewer.reading_time', { minutes: readingTimeMinutes })}
                  </Text>
                </View>
              </View>
            )}
            {!isChildSession && parentReviewPanel && (
              <View style={styles.mobileSectionWrapper}>{parentReviewPanel}</View>
            )}
            {/* Audio Generation Section */}
            <View style={styles.mobileSectionWrapper}>{renderAudioGenerationSection()}</View>

            {/* Show audio player if audio exists (mobile only) */}
            {isMobile && story.audioMetadata && playerAudioData && (
              <View style={styles.audioPlayerContainer}>
                <AudioPlayer
                  storyId={storyId}
                  audioUrl={playerAudioData.audioUrl}
                  duration={playerAudioData.duration}
                  title={`🎧 ${t('story_viewer.audio_title')}`}
                  hasAlignment={!!story.audioMetadata?.alignment}
                  onHighlightToggle={handleHighlightToggle}
                  onPositionChange={handlePositionChangeWrapper}
                  onFinish={handleAudioFinish}
                  onActivate={handleActivateAudio}
                />
              </View>
            )}

            {/* Characters Section (mobile) */}
            {isMobile && (
              <View style={[styles.mobileSectionWrapper, styles.mobileCharactersWrapper]}>
                {charactersSection}
              </View>
            )}

            {/* Story Scenes */}
            {renderScenesWithHighlight()}

            <View ref={quizSectionRef} style={styles.singleColumnTextSection}>
              <StoryReflectionSection
                storyId={storyId}
                enabled={quizEnabled}
                onScenePress={handleQuizScenePress}
                rewardAction={renderMapTileRewardButton()}
              />
            </View>

            {/* Continue Story Button */}
            {renderContinueButton()}
          </ScrollView>

          {/* FAB for Tablet Portrait only */}
          {isTabletPortrait && (story.audioMetadata || storyCharactersForSection.length > 0) && (
            <FloatingActionButton onPress={openBottomSheet} icon="musical-notes" />
          )}

          {/* Bottom Sheet for Tablet Portrait */}
          {isTabletPortrait && (
            <StoryBottomSheet
              bottomSheetRef={bottomSheetRef}
              audioData={playerAudioData}
              story={story}
              storyId={storyId}
              hasAlignment={!!story.audioMetadata?.alignment}
              onHighlightToggle={handleHighlightToggle}
              onPositionChange={handlePositionChangeWrapper}
              onFinish={handleAudioFinish}
              onActivateAudio={handleActivateAudio}
              onDeleteStory={isChildSession ? undefined : handleDeleteStory}
              onReportProblem={() => setShowFeedbackModal(true)}
              onPublish={isChildSession ? undefined : handleOpenPublishDialog}
              onShare={isChildSession ? undefined : handleShare}
              onUnpublish={isChildSession ? undefined : handleUnpublish}
              isPublishPending={publishStory.isPending}
              characters={storyCharactersForSection}
              onSaveCharacter={!isChildSession && isArtisanMode ? handleSaveCharacter : undefined}
              savedCharacterIds={savedCharacterIdsArray}
              userMode={user?.mode}
            />
          )}
        </>
      ) : (
        // Tablet Landscape + Desktop: Two Column Layout
        <View style={styles.desktopLayout}>
          {/* Left Column: Story Content */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.leftColumn}
            onLayout={handleScrollViewportLayout}
          >
            {/* Story Scenes */}
            {renderScenesWithHighlight()}

            <View ref={quizSectionRef}>
              <StoryReflectionSection
                storyId={storyId}
                enabled={quizEnabled}
                onScenePress={handleQuizScenePress}
                rewardAction={renderMapTileRewardButton()}
              />
            </View>

            {/* Continue Story Button */}
            {renderContinueButton()}

            {/* Series Navigation */}
            {renderSeriesNavigation()}
          </ScrollView>

          {/* Right Column: Sidebar (scrollable) */}
          <View style={styles.rightColumnWrapper}>
            <ScrollView
              style={styles.rightColumn}
              contentContainerStyle={styles.rightColumnContent}
              showsVerticalScrollIndicator={true}
            >
              <View style={styles.sidebar}>
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
                {/* Audio Generation Section (if audio not ready) */}
                {renderAudioGenerationSection()}

                {/* Audio Widget */}
                {story.audioMetadata && playerAudioData && (
                  <View style={styles.sidebarWidget}>
                    <AudioPlayer
                      storyId={storyId}
                      audioUrl={playerAudioData.audioUrl}
                      duration={playerAudioData.duration}
                      title={`${t('story_viewer.audio_title')}`}
                      hasAlignment={!!story.audioMetadata?.alignment}
                      onHighlightToggle={handleHighlightToggle}
                      onPositionChange={handlePositionChangeWrapper}
                      onFinish={handleAudioFinish}
                      onActivate={handleActivateAudio}
                    />
                  </View>
                )}

                {/* Characters Section */}
                {charactersSection}

                {!isChildSession ? parentReviewPanel : null}

                {canOpenAdminStory ? (
                  <AppButton
                    label={t('story_viewer.open_admin_panel')}
                    onPress={handleOpenAdminStory}
                    variant="secondary"
                    leading={
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={20}
                        color={theme.colors.interactive.primary}
                      />
                    }
                    style={styles.adminStoryAction}
                  />
                ) : null}

                {/* Publication block */}
                {!isChildSession ? (
                  <View style={styles.publicationSection}>
                    {!story?.isPublished ? (
                      <AppButton
                        label={t('story_viewer.publish')}
                        onPress={handleOpenPublishDialog}
                        disabled={publishStory.isPending || parentReviewBlocksSharing}
                        leading={
                          <Ionicons
                            name="cloud-upload-outline"
                            size={20}
                            color={theme.colors.text.inverse}
                          />
                        }
                        style={styles.publicationAction}
                      />
                    ) : (
                      <>
                        <Text style={styles.publicationSectionTitle}>
                          {t('story_viewer.publication_title')}
                        </Text>
                        <View style={styles.publicationBadge}>
                          <Ionicons
                            name={
                              story?.visibility === 'unlisted' ? 'link-outline' : 'globe-outline'
                            }
                            size={18}
                            color={theme.colors.text.secondary}
                          />
                          <Text style={styles.publicationBadgeText}>
                            {story?.visibility === 'unlisted'
                              ? t('story_viewer.publication_badge_unlisted')
                              : t('story_viewer.publication_badge_catalog')}
                          </Text>
                        </View>
                        <View style={styles.publicationButtonsStack}>
                          <AppButton
                            label={t('story_viewer.share_title')}
                            onPress={handleShare}
                            disabled={parentReviewBlocksSharing}
                            variant="secondary"
                            leading={
                              <Ionicons
                                name="share-social-outline"
                                size={20}
                                color={theme.colors.text.primary}
                              />
                            }
                            style={styles.publicationButtonFlex}
                          />
                          <AppButton
                            label={t('story_viewer.update_publication')}
                            onPress={handleOpenPublishDialog}
                            disabled={publishStory.isPending || parentReviewBlocksSharing}
                            variant="secondary"
                            leading={
                              <Ionicons name="create-outline" size={20} color={theme.colors.text.primary} />
                            }
                            style={styles.publicationButtonFlex}
                          />
                          <AppButton
                            label={t('story_viewer.unpublish')}
                            onPress={handleUnpublish}
                            variant="dangerSecondary"
                            size="sm"
                            style={styles.unpublishAction}
                          />
                        </View>
                      </>
                    )}
                  </View>
                ) : null}

                {/* Delete Story Button */}
                {!isChildSession ? (
                  <AppButton
                    label={t('story_viewer.delete_story')}
                    onPress={handleDeleteStory}
                    variant="dangerSecondary"
                    leading={
                      <Ionicons name="trash-outline" size={20} color={theme.colors.status.error} />
                    }
                    style={styles.deleteStoryAction}
                  />
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        visible={deleteDialogVisible}
        title={t('story_viewer.delete_confirm_title')}
        message={t('story_viewer.delete_confirm_message')}
        confirmText={t('story_viewer.delete')}
        cancelText={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        variant="danger"
      />

      {/* Unpublish Confirmation Dialog */}
      <ConfirmDialog
        visible={unpublishDialogVisible}
        title={t('story_viewer.unpublish_confirm_title')}
        message={t('story_viewer.unpublish_confirm_message')}
        confirmText={t('story_viewer.unpublish')}
        cancelText={t('common.cancel')}
        onConfirm={confirmUnpublish}
        onCancel={() => setUnpublishDialogVisible(false)}
        variant="danger"
      />

      {/* Publish & Share Dialog */}
      <PublishShareDialog
        visible={publishShareDialogVisible}
        onPublishAndShare={handlePublishAndShare}
        onCancel={() => {
          setPublishShareDialogVisible(false);
          // Don't clear publishShareUrl — would flash pre-publish during fade-out
        }}
        shareUrl={publishShareUrl}
        isLoading={publishStory.isPending}
        userPseudonym={isChildSession ? activeChild?.authorPseudonym : user?.pseudonym}
        authorAboutMe={isChildSession ? activeChild?.authorAboutMe : null}
        allowAuthorProfileEdit={isChildSession}
        onUnpublish={handleUnpublish}
        coverAssets={coverAssetOptions}
        coverAssetId={story?.coverAssetId ?? null}
        initialVisibility={
          story?.visibility === 'unlisted' ? 'unlisted' : story?.isPublished ? 'public' : 'unlisted'
        }
        openedFromShare={publishDialogOpenedFromShare}
      />

      <Modal
        visible={Boolean(artifactModalVisible && artifactModal && closingArtifact)}
        transparent
        animationType="fade"
        onRequestClose={handleCloseArtifactModal}
        onDismiss={() => setArtifactModal(null)}
      >
        <View style={styles.artifactModalRoot}>
          <TouchableOpacity
            style={styles.artifactModalBackdrop}
            activeOpacity={1}
            onPress={handleCloseArtifactModal}
          />
          <View style={styles.artifactModalCard}>
            <TouchableOpacity
              style={styles.artifactModalClose}
              onPress={handleCloseArtifactModal}
              accessibilityRole="button"
            >
              <Ionicons name="close-outline" size={22} color={theme.colors.text.secondary} />
            </TouchableOpacity>
            {artifactModalImageUrl ? (
              <Image
                source={{ uri: artifactModalImageUrl }}
                style={styles.artifactModalImage}
                resizeMode="contain"
              />
            ) : null}
            <Text style={styles.artifactModalTitle}>{artifactModalTitle}</Text>
            {isArtifactAlreadyCollected ? (
              <Text style={styles.artifactCollectedStatus}>
                {t('story_viewer.artifact_already_in_chest_prefix')}{' '}
                <Text style={styles.artifactCollectedLink} onPress={handleOpenArtifactsChest}>
                  {t('story_viewer.artifact_already_in_chest_link')}
                </Text>
              </Text>
            ) : isCollectedArtifactsLoading ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.interactive.primary}
                style={styles.artifactCollectLoading}
              />
            ) : (
              <AppButton
                label={t('story_viewer.artifact_collect')}
                onPress={handleCollectArtifact}
                disabled={collectStoryArtifact.isPending}
                leading={
                  collectStoryArtifact.isPending ? (
                    <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                  ) : (
                    <Ionicons name="sparkles-outline" size={18} color={theme.colors.text.inverse} />
                  )
                }
                style={styles.artifactCollectButton}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(mapTileModalVisible && mapTileModal)}
        transparent
        animationType="fade"
        onRequestClose={handleCloseMapTileModal}
        onDismiss={() => setMapTileModal(null)}
      >
        <View style={styles.artifactModalRoot}>
          <TouchableOpacity
            style={styles.artifactModalBackdrop}
            activeOpacity={1}
            onPress={handleCloseMapTileModal}
          />
          <View style={styles.artifactModalCard}>
            <TouchableOpacity
              style={styles.artifactModalClose}
              onPress={handleCloseMapTileModal}
              accessibilityRole="button"
            >
              <Ionicons name="close-outline" size={22} color={theme.colors.text.secondary} />
            </TouchableOpacity>
            {mapTileModalImageUrl ? (
              <Image
                source={{ uri: mapTileModalImageUrl }}
                style={styles.mapTileModalImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.mapTileModalFallback}>
                <Ionicons name="map-outline" size={54} color={theme.colors.text.tertiary} />
              </View>
            )}
            <Text style={styles.artifactModalTitle}>{t('story_viewer.map_tile_prize_title')}</Text>
            {mapTileModal?.alreadyCollected ? (
              <Text style={styles.artifactCollectedStatus}>
                {t('story_viewer.map_tile_already_on_map')}
              </Text>
            ) : (
              <AppButton
                label={t('story_viewer.map_tile_collect')}
                onPress={handleCollectMapTile}
                disabled={collectMapTile.isPending}
                leading={
                  collectMapTile.isPending ? (
                    <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                  ) : (
                    <Ionicons name="map-outline" size={18} color={theme.colors.text.inverse} />
                  )
                }
                style={styles.artifactCollectButton}
              />
            )}
          </View>
        </View>
      </Modal>

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="story_viewer"
        contentReportContext={{
          storyId,
          contentType: 'story',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.primary,
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.status.error,
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
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[6],
  },
  rightColumnWrapper: {
    width: theme.layout.sidebar.widthFixed,
    minWidth: theme.layout.sidebar.widthFixed,
    maxWidth: theme.layout.sidebar.widthFixed,
    flexShrink: 0,
  },
  rightColumn: {
    flex: 1,
  },
  rightColumnContent: {
    paddingLeft: 0,
    paddingRight: theme.spacing[6],
    paddingVertical: theme.spacing[6],
    paddingBottom: theme.spacing[12],
  },
  sidebar: {
    // No sticky - column scrolls when content overflows
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
  publicationSection: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  parentReviewPanel: {
    padding: theme.spacing[4],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.status.warning,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    marginBottom: theme.spacing[4],
  },
  parentReviewPanelApproved: {
    borderColor: theme.colors.status.success,
  },
  parentReviewPanelRejected: {
    borderColor: theme.colors.status.error,
  },
  parentReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  parentReviewTitle: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  parentReviewMessage: {
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
    color: theme.colors.text.secondary,
  },
  parentReviewActions: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    marginTop: theme.spacing[4],
  },
  parentReviewButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
  },
  parentReviewRejectButton: {
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.status.error,
    backgroundColor: theme.colors.background.primary,
  },
  parentReviewApproveButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  parentReviewRejectText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.status.error,
  },
  parentReviewApproveText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  publicationSectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  publicationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.md,
    marginBottom: theme.spacing[4],
    alignSelf: 'flex-start',
  },
  publicationBadgeText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  publicationButtonsStack: {
    flexDirection: 'column',
    gap: theme.spacing[3],
  },
  publicationButtonFlex: {
    alignSelf: 'stretch',
  },
  unpublishAction: {
    alignSelf: 'stretch',
  },
  publicationAction: {
    alignSelf: 'stretch',
  },
  adminStoryAction: {
    alignSelf: 'stretch',
    marginBottom: theme.spacing[4],
  },
  deleteStoryAction: {
    alignSelf: 'stretch',
  },
  // Common styles
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[4],
  },
  audioGenerationSection: {
    marginBottom: theme.spacing[4],
    padding: theme.spacing[5],
    borderWidth: 2,
    borderColor: theme.colors.interactive.primary,
    borderRadius: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
  },
  mobileSectionWrapper: {
    marginHorizontal: theme.spacing[6],
  },
  readingTimeSection: {
    marginBottom: theme.spacing[4],
  },
  singleColumnTextSection: {
    paddingHorizontal: theme.spacing[6],
  },
  mobileCharactersWrapper: {
    position: 'relative',
    zIndex: 300,
    elevation: 30,
    overflow: 'visible',
  },
  generatingContainer: {
    padding: theme.spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    minHeight: 200,
  },
  generatingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  generatingHint: {
    marginTop: theme.spacing[2],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  usageInfoContainer: {
    backgroundColor: theme.colors.primary[50],
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[4],
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary[500],
  },
  usageInfoText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  audioButton: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing[4],
  },
  audioButtonUpgrade: {
    backgroundColor: theme.colors.warning[600],
  },
  audioButtonDisabled: {
    opacity: 0.6,
  },
  audioButtonSpinner: {
    marginRight: theme.spacing[2],
  },
  audioButtonText: {
    color: '#fff',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  audioPlayerContainer: {
    marginHorizontal: theme.spacing[6],
    marginBottom: theme.spacing[4],
  },
  scene: {
    position: 'relative',
    marginBottom: theme.spacing[8],
  },
  sceneImage: {
    aspectRatio: 16 / 9,
    marginBottom: theme.spacing[4],
    width: '100%',
    borderRadius: theme.borders.radius.xl,
  },
  sceneImagePlaceholder: {
    aspectRatio: 16 / 9,
    marginBottom: theme.spacing[4],
    backgroundColor: theme.colors.background.tertiary,
    borderRadius: theme.borders.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  singleColumnMedia: {
    borderRadius: 0,
  },
  sceneImagePlaceholderText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  sceneImagePlaceholderTextError: {
    color: theme.colors.status.error,
  },
  sceneTextWrapper: {
    position: 'relative',
    paddingHorizontal: theme.spacing[6],
  },
  sceneTextWrapperQuizHighlightLayer: {
    position: 'absolute',
    top: -theme.spacing[2],
    bottom: -theme.spacing[2],
    left: theme.spacing[4],
    right: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  sceneText: {
    fontSize: theme.typography.fontSize.lg,
    lineHeight: theme.typography.fontSize.lg * 1.6,
    color: theme.colors.text.primary,
  },
  graphicNovelPage: {
    width: '100%',
    alignSelf: 'stretch',
    marginBottom: theme.spacing[8],
  },
  graphicNovelPageActive: {
    shadowColor: theme.colors.interactive.primary,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  graphicNovelPageCanvas: {
    position: 'relative',
    width: '100%',
    aspectRatio: 3 / 4,
    overflow: 'hidden',
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.tertiary,
  },
  graphicNovelPageImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  graphicNovelPanelScrollAnchor: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  graphicNovelTextBox: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_X,
    paddingVertical: GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_Y,
  },
  graphicNovelBubbleText: {
    width: '100%',
    minWidth: 0,
    flexShrink: 1,
    color: '#111111',
    fontSize: GRAPHIC_NOVEL_BUBBLE_FONT_SIZE,
    lineHeight: GRAPHIC_NOVEL_BUBBLE_LINE_HEIGHT,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
    includeFontPadding: false,
    ...Platform.select({
      web: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        textWrap: 'balance' as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        overflowWrap: 'break-word' as any,
      },
      default: {},
    }),
  },
  graphicNovelBubbleTextActive: {
    backgroundColor: 'rgb(218, 239, 253)',
    borderRadius: 4,
  },
  graphicNovelPagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
  },
  graphicNovelPagePlaceholderText: {
    marginTop: theme.spacing[3],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  graphicNovelLoading: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
  },
  mapTileReward: {
    alignSelf: 'stretch',
  },
  mapTileRewardButton: {
    alignSelf: 'stretch',
  },
  artifactInline: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
    textDecorationLine: 'underline',
  },
  artifactInlineIcon: {
    lineHeight: theme.typography.fontSize.lg * 1.6,
  },
  artifactModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[5],
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  artifactModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  artifactModalCard: {
    width: '100%',
    maxWidth: 360,
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
  artifactModalClose: {
    position: 'absolute',
    top: theme.spacing[3],
    right: theme.spacing[3],
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.primary,
    zIndex: 1,
  },
  artifactModalImage: {
    width: 188,
    height: 188,
    borderRadius: theme.borders.radius.md,
    marginBottom: theme.spacing[4],
    overflow: 'hidden',
  },
  mapTileModalImage: {
    width: 220,
    height: 220,
    borderRadius: 8,
    marginBottom: theme.spacing[4],
    overflow: 'hidden',
    backgroundColor: theme.colors.background.tertiary,
  },
  mapTileModalFallback: {
    width: 220,
    height: 220,
    borderRadius: 8,
    marginBottom: theme.spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.primary,
  },
  artifactModalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  artifactCollectButton: {
    alignSelf: 'stretch',
    marginTop: theme.spacing[4],
  },
  artifactCollectLoading: {
    marginTop: theme.spacing[4],
    minHeight: 44,
  },
  artifactCollectedStatus: {
    marginTop: theme.spacing[3],
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  artifactCollectedLink: {
    color: theme.colors.interactive.primary,
    textDecorationLine: 'underline',
  },
  limitExceededContainer: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    alignItems: 'center',
  },
  limitExceededIcon: {
    fontSize: 48,
    marginBottom: theme.spacing[4],
  },
  limitExceededTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
    textAlign: 'center',
  },
  limitExceededMessage: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  audioLimitAction: {
    marginBottom: theme.spacing[4],
  },
  limitExceededDetails: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginTop: theme.spacing[2],
  },
  bundlePricingLink: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.interactive.primary,
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  inlineWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.warning[50],
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning[500],
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  warningIcon: {
    fontSize: 20,
    marginRight: theme.spacing[3],
  },
  warningTextContainer: {
    flex: 1,
  },
  warningTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.warning[600],
    marginBottom: theme.spacing[1],
  },
  warningNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.fontSize.sm * 1.5,
  },
  // M6: Word highlighting styles (sentence wrappers with color-based highlighting)
  sentenceText: {
    // Wrapper for sentence - no additional styles by default
  },
  activeSentenceBackground: {
    backgroundColor: 'rgb(218, 239, 253)', // Light blue background for active sentence
  },
  grayTextColor: {
    color: '#6d6d6d', // Gray for inactive sentences when highlight is ON
  },
  inactiveWordColor: {
    color: '#6d6d6d', // Gray for non-active words in active sentence
  },
  activeWordColor: {
    color: '#000000', // Black for active word in active sentence
    textDecorationLine: 'underline',
  },
  // M8: Series navigation styles
  seriesNavigation: {
    marginTop: theme.spacing[6],
    paddingTop: theme.spacing[6],
    paddingBottom: theme.spacing[8],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: theme.colors.border.light,
    justifyContent: 'center',
  },
  seriesNavAction: {
    alignSelf: 'center',
    maxWidth: '100%',
    marginBottom: theme.spacing[2],
  },
  partIndicator: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginVertical: theme.spacing[3],
  },
  headerBreadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    paddingRight: theme.spacing[2],
  },
  headerBreadcrumbLinkPressable: {
    flexShrink: 1,
    minWidth: 0,
  },
  headerBreadcrumbLink: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.interactive.primary,
  },
  headerBreadcrumbSeparator: {
    marginHorizontal: theme.spacing[1],
  },
  headerBreadcrumbMiddle: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.secondary,
    flexShrink: 1,
  },
  headerBreadcrumbCurrent: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    flexShrink: 1,
  },
  tabletHeaderTitleContainer: {
    left: theme.spacing[4],
    right: theme.spacing[20] + theme.spacing[4],
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabletHeaderBreadcrumb: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    paddingRight: theme.spacing[20] + theme.spacing[4],
    fontSize: theme.typography.fontSize.lg,
    lineHeight: 26,
    color: theme.colors.text.primary,
  },
  tabletHeaderBreadcrumbLink: {
    color: theme.colors.interactive.primary,
  },
  tabletHeaderBreadcrumbSeparator: {
    color: theme.colors.text.tertiary,
    fontWeight: theme.typography.fontWeight.regular,
  },
  tabletHeaderBreadcrumbMiddle: {
    color: theme.colors.text.secondary,
  },
  tabletHeaderBreadcrumbCurrent: {
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  tabletHeaderTitle: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    paddingRight: theme.spacing[20] + theme.spacing[4],
    fontSize: theme.typography.fontSize.lg,
    lineHeight: 26,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  tabletHeaderRightContainer: {
    right: 0,
    zIndex: 2,
  },
  mobileHeaderTitleContainer: {
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  mobileHeaderRightContainer: {
    right: 0,
  },
  mobileHeaderBreadcrumb: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mobileHeaderBreadcrumbTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
  },
  mobileHeaderBreadcrumbLinkPressable: {
    flexShrink: 1,
    minWidth: 0,
  },
  mobileHeaderBreadcrumbLink: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.interactive.primary,
    lineHeight: 18,
    maxWidth: '100%',
  },
  mobileHeaderBreadcrumbCurrent: {
    flexShrink: 1,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    lineHeight: 20,
  },
});
