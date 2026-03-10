import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Image, StyleSheet, ActivityIndicator, TouchableOpacity, Platform, ImageStyle, Share } from 'react-native';
import { useRoute, RouteProp, useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useStory, useStoryGenerationStatus, useGenerateAudio, useGenerateAlignment, useAudioStatus, useAudioUrl, useDeleteStory, useGenerateContinuation, useSeriesInfo, useStoryStatus, usePublishStory } from '@/api/stories';
import { useUpdateMe } from '@/api/auth';
import { useSubscriptionUsage } from '@/api/plans';
import { useVoices } from '@/api/voices';
import { useUpdateCharacter } from '@/api/characters';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PublishShareDialog, type ShareCardScene } from '@/components/PublishShareDialog';
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
import i18n from '@/config/i18n';
import type { MainDrawerParamList } from '@/types/navigation';
import AudioPlayer from '@/components/AudioPlayer';
import VoiceSelector from '@/components/VoiceSelector';
import { useAlignmentSync } from '@/hooks/useAlignmentSync';
import { GenerationProgressModal } from '@/components/GenerationProgressModal';
import { StoryBottomSheet } from '@/components/StoryBottomSheet';
import { StoryCharactersSection, type StoryCharacter } from '@/components/StoryCharactersSection';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { StoryViewerSkeleton } from '@/components/StoryViewerSkeleton';
import { getReadingTimeMinutes } from '@wondertales/shared';

type StoryViewerRouteProp = RouteProp<MainDrawerParamList, 'Story'>;

// Helper function to remove audio tags from text
const removeAudioTags = (text: string): string => {
  // Remove ElevenLabs audio tags like [happy], [sad], [excited], etc.
  // Keep whitespace and newlines intact
  return text.replace(/\[[\w\s]+\]/g, '');
};

// Format wait time using i18n translations
const formatWaitTime = (ms: number, t: (key: string, opts?: Record<string, any>) => string): string => {
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
  const { t } = useTranslation();
  const { isTabletPortrait, isMobile } = useResponsive();
  const { user } = useAuthStore();
  const isArtisanMode = user?.mode === 'artisan';
  const storyId = route.params?.storyId;
  const autoPlay = route.params?.autoPlay;
  const hadAudioGenerationRef = useRef(false);
  const { data: story, isLoading, error, refetch } = useStory(storyId!);
  
  // Use lightweight status polling for image generation
  const { data: generationStatus } = useStoryGenerationStatus(storyId!);
  
  // Progressive image loading: update story cache as images are generated
  useEffect(() => {
    if (!generationStatus || !story) return;
    
    if (generationStatus.imageGenerationComplete && !story.imageGenerationComplete) {
      // Final refetch when generation is complete
      refetch();
    } else if (generationStatus.scenesWithImages && generationStatus.scenesWithImages.length > 0) {
      // Progressive update: add imageUrl to scenes that are already generated
      const updatedScenes = story.scenes.map((scene: any) => {
        const generated = generationStatus.scenesWithImages?.find(s => s.sceneId === scene.sceneId);
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
  }, [generationStatus, story, refetch, storyId, queryClient]);
  
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
  const scrollViewRef = useRef<ScrollView>(null);
  const sceneRefs = useRef<Record<number, View | null>>({});
  const lastPositionUpdateTime = useRef(0);
  
  // M7: Audio playback state persistence (global service handles saving/restoring)
  
  // Voice selection state
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined);
  const [selectedVoice, setSelectedVoice] = useState<any>(undefined);
  // Keep polling after retry until we get jobStatus (mutation completes before first poll)
  const [audioGenerationRequested, setAudioGenerationRequested] = useState(false);
  const hasAudioJobRef = useRef(false);
  
  // Use story language for voice selection (not UI language)
  const storyLanguage = story?.language || 'uk';
  const { data: voicesData, isLoading: isLoadingVoices, error: voicesError } = useVoices(storyLanguage);
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
  
  // Set header title from database after story loads (with scenario breadcrumb)
  useEffect(() => {
    if (story?.title) {
      if (story.scenarioCardName) {
        navigation.setOptions({
          headerTitle: () => (
            <View style={styles.headerBreadcrumb}>
              <TouchableOpacity onPress={() => navigation.navigate('Library', { scenarioCardId: story.scenarioCardId })}>
                <Text style={styles.headerBreadcrumbLink}>{story.scenarioCardName}</Text>
              </TouchableOpacity>
              <Ionicons name="chevron-forward" size={14} color={theme.colors.text.tertiary} style={styles.headerBreadcrumbSeparator} />
              <Text style={styles.headerBreadcrumbCurrent} numberOfLines={1}>{story.title}</Text>
            </View>
          ),
        });
      } else {
        navigation.setOptions({
          title: story.title,
        });
      }
    }
  }, [story?.title, story?.scenarioCardName, story?.scenarioCardId, navigation]);
  
  // Delete story mutation
  const deleteStory = useDeleteStory();
  const publishStory = usePublishStory();
  const updateMe = useUpdateMe();
  
  // Delete dialog state
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [publishShareDialogVisible, setPublishShareDialogVisible] = useState(false);
  const [publishShareUrl, setPublishShareUrl] = useState<string | null>(null);
  const [publishDialogOpenedFromShare, setPublishDialogOpenedFromShare] = useState(false);
  const [unpublishDialogVisible, setUnpublishDialogVisible] = useState(false);
  
  // M8: Series continuation
  const generateContinuation = useGenerateContinuation();
  const { data: seriesInfo } = useSeriesInfo(storyId);
  
  // M8: Continuation progress tracking
  const [isContinuationGenerating, setIsContinuationGenerating] = useState(false);
  const [continuationRequestId, setContinuationRequestId] = useState<string | null>(null);
  const { data: continuationStatus } = useStoryStatus(continuationRequestId || '', !!continuationRequestId);
  
  // Audio limit state (story-based, not minutes)
  const [audioLimitExceeded, setAudioLimitExceeded] = useState(false);
  const [limitInfo, setLimitInfo] = useState<{
    limit: number;
    used: number;
    resetsAt: string;
  } | null>(null);
  
  // Set default voice on mount (prefer first available/unlocked voice)
  useEffect(() => {
    if (voices.length > 0 && !selectedVoiceId) {
      const firstAvailable = voices.find(v => !v.isLocked) || voices[0];
      setSelectedVoiceId(firstAvailable.id);
      setSelectedVoice(firstAvailable);
    }
  }, [voices, selectedVoiceId]);

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
  const shouldPollAudio = generateAudio.isPending || audioGenerationRequested || hasAudioJobRef.current;
  
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
            toastService.success(
              t('toast.audio_ready_title'),
              storyTitle,
              {
                visibilityTime: 20000,
                actionText: t('toast.audio_play'),
                onPress: () => {
                  Toast.hide();
                  navigateToStory(storyId!, { autoPlay: true });
                },
              }
            );
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
  }, [isGenerating, audioStatus?.audioMetadata, storyId, viewingStoryId, story?.title, t, queryClient]);
  
  // Tick every 1s during processing for live countdown
  useEffect(() => {
    if (jobStatus !== 'processing') return;
    const id = setInterval(() => setCountdownTick(prev => prev + 1), 1000);
    return () => clearInterval(id);
  }, [jobStatus]);
  
  // M6: Proactive alignment generation
  // Automatically generate alignment if audio exists but alignment is missing
  useEffect(() => {
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
  }, [story, storyId, generateAlignment, isGenerating]);
  
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
  }, [generateAlignment.isPending, generateAlignment.isSuccess, generateAlignment.isError, generateAlignment.error]);
  
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
  
  const { activeSentenceIndex, activeWordIndex, sentences } = useAlignmentSync(
    story?.fullText || '',
    story?.audioMetadata?.alignment,
    currentPosition,
    sceneTexts
  );
  
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
  const handlePositionChangeWrapper = useCallback((position: number) => {
    // Don't reset to 0 if we have a restored position (> 5s)
    // This prevents AudioPlayer's initial load (position=0) from clearing the restored state
    if (position === 0 && currentPosition > 5) {
      console.log('[StoryViewer] Ignoring position reset to 0 (have restored position:', currentPosition.toFixed(3) + 's)');
      return;
    }
    handlePositionChange(position);
  }, [currentPosition, handlePositionChange]);
  
  // M7: Callback when audio finishes - clear saved state
  const handleAudioFinish = useCallback(async () => {
    console.log('[AudioPlayback] Audio finished, clearing saved state');
    await audioPlaybackService.clearState(storyId);
  }, [storyId]);

  const handleSaveCharacter = useCallback(
    async (characterId: string) => {
      try {
        await updateCharacterMutation.mutateAsync({ id: characterId, data: { isHidden: false } as any });
        setSavedCharacterIds((prev) => new Set(prev).add(characterId));
        toastService.success(t('story_viewer.character_saved'));
      } catch {
        toastService.error('Error');
      }
    },
    [updateCharacterMutation, t]
  );

  // Stable array ref for memo — only changes when saved ids actually change (MUST be before early returns)
  const savedIdsKey = [...savedCharacterIds].sort().join(',');
  const savedCharacterIdsArray = useMemo(() => [...savedCharacterIds], [savedIdsKey]);

  // Memoized characters section — prevents re-renders when parent updates (e.g. audio position)
  const charactersSection = useMemo(() => {
    const characters = story?.characters;
    if (!characters || characters.length === 0) return null;
    return (
      <StoryCharactersSection
        characters={characters as StoryCharacter[]}
        savedCharacterIds={savedCharacterIdsArray}
        isArtisanMode={isArtisanMode}
        onSaveCharacter={handleSaveCharacter}
        isSavePending={updateCharacterMutation.isPending}
      />
    );
  }, [
    story?.characters,
    savedCharacterIdsArray,
    isArtisanMode,
    handleSaveCharacter,
    updateCharacterMutation.isPending,
  ]);
  
  // Handle delete story with confirmation
  const handleDeleteStory = useCallback(() => {
    setDeleteDialogVisible(true);
  }, []);
  
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
    } catch (_) {}
  }, [story, t]);

  const handlePublishAndShare = useCallback(
    async (visibility: 'public' | 'unlisted' = 'public', shareCardSceneId?: number, pseudonym?: string) => {
      try {
        if (!user?.pseudonym && pseudonym) {
          await updateMe.mutateAsync({ pseudonym });
        }
        const result = await publishStory.mutateAsync({
          storyId,
          isPublished: true,
          visibility,
          shareCardSceneId,
        });
        if (result?.shareUrl) {
          const count = result.publishedStoriesCount ?? 0;
          if (count > 0) {
            const ordinal = getOrdinal(count, i18n.language);
            toastService.success(
              (t as (k: string, o?: Record<string, unknown>) => string)('story_viewer.publish_success_ordinal', { ordinal })
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
        }
      } catch (_) {}
    },
    [storyId, story?.title, user?.pseudonym, publishStory, updateMe, t]
  );

  // Open PublishShareDialog (pre-publish or update visibility)
  const handleOpenPublishDialog = useCallback(() => {
    setPublishShareUrl(null);
    setPublishDialogOpenedFromShare(false);
    setPublishShareDialogVisible(true);
  }, []);

  const handleUnpublish = useCallback(() => {
    setUnpublishDialogVisible(true);
  }, []);

  const confirmUnpublish = useCallback(async () => {
    await publishStory.mutateAsync({ storyId, isPublished: false });
    setUnpublishDialogVisible(false);
    setPublishShareDialogVisible(false);
    setPublishShareUrl(null);
  }, [storyId, publishStory]);
  
  // M8: Handle continue story
  const handleContinue = useCallback(async () => {
    if (generateContinuation.isPending) return;
    
    try {
      setIsContinuationGenerating(true);
      const result = await generateContinuation.mutateAsync(storyId);
      setContinuationRequestId(result.id); // API now returns { id, status, progress, createdAt }
    } catch (error: any) {
      setIsContinuationGenerating(false);
      toastService.error(
        t('story_viewer.continuation_error'),
        error.message || t('story_viewer.audio_error_default')
      );
    }
  }, [storyId, generateContinuation, t]);
  
  // M8: Handle continuation modal close
  const handleCloseContinuationModal = useCallback(() => {
    const newStoryId = continuationStatus?.storyId;
    setIsContinuationGenerating(false);
    setContinuationRequestId(null);
    
    if (newStoryId) {
      // Navigate to the continuation story
      navigateToStory(newStoryId);
    }
  }, [continuationStatus]);
  
  // M6: Get active scene index from sentence metadata
  const activeSceneIndex = activeSentenceIndex !== null
    ? (sentences[activeSentenceIndex]?.sceneIndex ?? null)
    : null;
  
  // M6: Auto-scroll active scene to center of viewport
  useEffect(() => {
    if (!effectiveHighlightEnabled || activeSceneIndex === null) {
      return;
    }
    
    const sceneElement = sceneRefs.current[activeSceneIndex];
    if (!sceneElement) return;
    
    // Use scrollIntoView on web, measureLayout on native
    if (Platform.OS === 'web') {
      const element = sceneElement as any;
      if (element?.scrollIntoView) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      }
    } else {
      // Native: measure and scroll using ScrollView ref
      sceneElement.measureLayout(
        scrollViewRef.current as any,
        (_x, y, _width, _height) => {
          scrollViewRef.current?.scrollTo({
            y: y - 100, // Offset to center approximately
            animated: true,
          });
        },
        () => {
          // Measurement failed, ignore
        }
      );
    }
  }, [activeSceneIndex, effectiveHighlightEnabled]);
  
  const handleGenerateAudio = async () => {
    console.log('[handleGenerateAudio] Called with:', {
      selectedVoiceId,
      storyId,
      isPending: generateAudio.isPending,
      isGenerating,
    });
    
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
        voiceId: selectedVoiceId
      });
      
      console.log('[handleGenerateAudio] Mutation succeeded');
      
      // Reset limit state on success
      setAudioLimitExceeded(false);
      setLimitInfo(null);
      
      // Invalidate usage query to show updated counter
      queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
      
      toastService.info(
        'Готуємо аудіосказку',
        'Це може зайняти кілька хвилин'
      );
    } catch (error: any) {
      setAudioGenerationRequested(false);
      console.log('[handleGenerateAudio] Error:', error);
      console.log('[handleGenerateAudio] Error response:', error?.response);
      
      // Check if it's a limit exceeded error
      if (error?.response?.data?.code === 'AUDIO_LIMIT_EXCEEDED') {
        console.log('[handleGenerateAudio] Audio limit exceeded');
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
          toastService.error(
            'Аудіосказки недоступні',
            'Оновіть тариф для озвучування історій'
          );
        } else {
          toastService.error(
            'Ліміт вичерпано',
            error.response.data.message
          );
        }
      } else {
        console.log('[handleGenerateAudio] Generic error');
        toastService.error(
          t('toast.audio_error_title'),
          'Не вдалося створити аудіосказку'
        );
      }
    }
  };

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

  // Check if audio generation failed (hide error when we have valid playerAudioData from API)
  const audioFailed = !playerAudioData && story.audioMetadata?.error === true;
  const hasGenerationInProgress = isGenerating || audioStatus?.jobStatus === 'processing';
  const showGeneratingBlock = hasGenerationInProgress || generateAudio.isPending || audioGenerationRequested;
  
  // M8: Render continue button (after story content)
  const renderContinueButton = () => {
    // Hide button if there's a next part in the series
    if (seriesInfo && story.partNumber && story.partNumber < seriesInfo.totalParts) {
      return null; // Has next part, don't show button
    }
    
    // Check if user has series access (Golden Stars or Fairyworld)
    const hasSeriesAccess = userPlan === 'golden' || userPlan === 'fairyworld';
    
    // Show upgrade prompt if user doesn't have access
    if (!hasSeriesAccess) {
      return (
        <View style={styles.continueContainer}>
          <Text style={styles.continueTitle}>
            {t('story_viewer.series_locked_title')}
          </Text>
          <Text style={styles.continueDescription}>
            {t('story_viewer.series_locked_description')}
          </Text>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={() => navigation.navigate('Plans' as any)}
          >
            <Ionicons name="lock-closed" size={24} color="#fff" />
            <Text style={styles.continueButtonText}>
              {t('story_viewer.upgrade_to_unlock')}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    return (
      <View style={styles.continueContainer}>
        <Text style={styles.continueTitle}>
          {t('story_viewer.enjoyed_story')}
        </Text>
        
        {seriesInfo?.totalParts && seriesInfo.totalParts > 1 && (
          <Text style={styles.seriesInfo}>
            {t('story_viewer.series_parts', { count: seriesInfo.totalParts })}
          </Text>
        )}
        
        <TouchableOpacity
          style={[
            styles.continueButton,
            generateContinuation.isPending && styles.continueButtonDisabled
          ]}
          onPress={handleContinue}
          disabled={generateContinuation.isPending}
        >
          {generateContinuation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="play-forward" size={24} color="#fff" />
              <Text style={styles.continueButtonText}>
                {t('story_viewer.continue_story')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
    
    const { partNumber, totalParts, storyIds } = seriesInfo;
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
        {/* Previous part button */}
        {currentIndex > 0 && (
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => navigateToStory(storyIds[currentIndex - 1])}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.interactive.primary} />
            <Text style={styles.navButtonText}>
              {t('series.part_number', { number: currentIndex })}
            </Text>
          </TouchableOpacity>
        )}
        
        <Text style={styles.partIndicator}>
          {t('series.part_number', { number: partNumber })} {t('series.of_parts', { total: totalParts })}
        </Text>
        
        {/* Next part button */}
        {currentIndex < totalParts - 1 && (
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => navigateToStory(storyIds[currentIndex + 1])}
          >
            <Text style={styles.navButtonText}>
              {t('series.part_number', { number: currentIndex + 2 })}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={theme.colors.interactive.primary} />
          </TouchableOpacity>
        )}
      </View>
    );
  };
  
  // Render audio generation section (reusable component)
  // Hide when we have valid playerAudioData (API returned audioUrl) — prevents showing error + player together
  const renderAudioGenerationSection = () => (
    !playerAudioData && (!story.audioMetadata || audioFailed || showGeneratingBlock) && (
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
                limit: limitInfo.limit 
              })}
            </Text>
            
            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => navigation.navigate('Plans')}
            >
              <Text style={styles.upgradeButtonText}>
                {t('story_viewer.upgrade_plan')}
              </Text>
            </TouchableOpacity>
            
            <Text style={styles.limitExceededDetails}>
              {t('story_viewer.next_plan_benefit')}
            </Text>
          </View>
        ) : showGeneratingBlock ? (
          // Show loading state during generation with queue info
          <View style={styles.generatingContainer}>
            <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
            <Text style={styles.generatingText}>
              {jobStatus === 'queued' 
                ? (queuePosition && queuePosition > 0
                    ? t('story_viewer.audio_queue_position', { position: queuePosition })
                    : t('story_viewer.audio_queued'))
                : t('story_viewer.audio_generating')}
            </Text>
            {jobStatus === 'queued' && estimatedWaitMs && estimatedWaitMs > 0 && (
              <Text style={styles.generatingHint}>
                {t('story_viewer.audio_queue_wait', { time: formatWaitTime(estimatedWaitMs, t) })}
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
                <Text style={{ textAlign: 'center', marginTop: 8, color: theme.colors.text.secondary }}>
                  {t('story_viewer.loading_voices')}
                </Text>
              </View>
            ) : voicesError ? (
              <View style={{ padding: 16, backgroundColor: theme.colors.status.error + '20', borderRadius: 8 }}>
                <Text style={{ color: theme.colors.status.error, marginBottom: 8, fontWeight: '600' }}>
                  ❌ {t('story_viewer.voices_error')}
                </Text>
                <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>
                  {String(voicesError)}
                </Text>
              </View>
            ) : voices.length === 0 ? (
              <Text style={{ color: theme.colors.status.error, padding: 16, textAlign: 'center' }}>
                ❌ {t('story_viewer.no_voices')}
              </Text>
            ) : (
              <VoiceSelector
                voices={voices}
                selectedVoiceId={selectedVoiceId}
                onVoiceChange={(voiceId) => {
                  setSelectedVoiceId(voiceId);
                  const voice = voices.find(v => v.id === voiceId);
                  setSelectedVoice(voice);
                }}
                language={storyLanguage}
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
                  (isGenerating || generateAudio.isPending) && styles.audioButtonDisabled
                ]}
                onPress={handleGenerateAudio}
                disabled={isGenerating || generateAudio.isPending}
              >
                {isGenerating || generateAudio.isPending ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" style={styles.audioButtonSpinner} />
                    <Text style={styles.audioButtonText}>
                      {(jobStatus && jobStatus === 'queued') ? t('story_viewer.audio_queued') : t('story_viewer.audio_generating')}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.audioButtonText}>
                    🎧 {audioFailed ? t('story_viewer.try_again') : t('story_viewer.create_audio')}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    )
  );

  // M6: Helper to render scene text with sentence/word wrappers
  const renderSceneTextWithHighlight = (sceneText: string, sceneIndex: number) => {
    const cleanedSceneText = removeAudioTags(sceneText);
    
    // If no alignment, render plain text
    if (!story.audioMetadata?.alignment || sentences.length === 0) {
      return <Text style={styles.sceneText}>{cleanedSceneText}</Text>;
    }
    
    // Find sentences that belong to this scene
    const sceneSentences = sentences.filter(s => s.sceneIndex === sceneIndex);
    
    if (sceneSentences.length === 0) {
      return <Text style={styles.sceneText}>{cleanedSceneText}</Text>;
    }
    
    let renderedText: any[] = [];
    let lastIndex = 0;
    
    sceneSentences.forEach((sentence, sentenceLocalIndex) => {
      const sentenceIndex = sentences.indexOf(sentence);
      const isSentenceActive = effectiveHighlightEnabled && sentenceIndex === activeSentenceIndex;
      
      // Find sentence position in scene text
      const sentencePos = cleanedSceneText.indexOf(sentence.text, lastIndex);
      if (sentencePos === -1) return;
      
      // Add text before sentence (if any)
      if (sentencePos > lastIndex) {
        renderedText.push(cleanedSceneText.substring(lastIndex, sentencePos));
      }
      
      // When highlight is ON: render individual words with color styles
      // When highlight is OFF: render plain sentence text without word wrappers
      if (effectiveHighlightEnabled) {
        // Render sentence wrapper with individual words
        const sentenceWords = sentence.words.map((word, wordIndex) => {
          const wordKey = `${sentenceIndex}-${wordIndex}`;
          const isActiveWord = isSentenceActive && wordIndex === activeWordIndex;
          
          // Color logic:
          // - Active sentence + active word → black (activeWordColor)
          // - Active sentence + inactive word → gray (inactiveWordColor)
          // - Inactive sentence → gray (grayTextColor) applied to sentence wrapper
          const wordStyle = isSentenceActive
            ? (isActiveWord ? styles.activeWordColor : styles.inactiveWordColor)
            : undefined; // Gray applied at sentence level for inactive sentences
          
          return (
            <React.Fragment key={wordKey}>
              <Text style={wordStyle}>{word.text}</Text>
              {wordIndex < sentence.words.length - 1 && ' '}
            </React.Fragment>
          );
        });
        
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
            {sentence.text}
          </Text>
        );
      }
      
      // Add space after sentence (unless it's the last sentence)
      if (sentenceLocalIndex < sceneSentences.length - 1) {
        renderedText.push(' ');
      }
      
      lastIndex = sentencePos + sentence.text.length;
    });
    
    // Add remaining text after last sentence
    if (lastIndex < cleanedSceneText.length) {
      renderedText.push(cleanedSceneText.substring(lastIndex));
    }
    
    return <Text style={styles.sceneText}>{renderedText}</Text>;
  };

  // M6: Render story scenes with optional highlighting
  const renderScenesWithHighlight = () => {
    return story.scenes?.map((scene: any, sceneIndex: number) => {
      return (
        <View 
          key={scene.sceneId || sceneIndex}
          ref={(ref: View | null) => { sceneRefs.current[sceneIndex] = ref; }}
          style={styles.scene}
        >
          {scene.image?.url && scene.image?.status !== 'failed' ? (
            <Image 
              source={{ uri: formatAssetUrl(scene.image.url) ?? scene.image.url }} 
              style={styles.sceneImage as ImageStyle}
              resizeMode="cover"
            />
          ) : (story?.sceneIdsWithImages as number[] | undefined)?.includes(scene.sceneId) ? (
            <View style={styles.sceneImagePlaceholder}>
              <Text style={[
                styles.sceneImagePlaceholderText,
                (story?.failedScenes as Array<{ sceneId: number }> | undefined)?.some(f => f.sceneId === scene.sceneId) && styles.sceneImagePlaceholderTextError,
              ]}>
                {(story?.failedScenes as Array<{ sceneId: number }> | undefined)?.some(f => f.sceneId === scene.sceneId)
                  ? t('story_viewer.image_failed')
                  : t('story_viewer.image_preparing')}
              </Text>
            </View>
          ) : null}
          
          <View style={styles.sceneTextWrapper}>
            {renderSceneTextWithHighlight(scene.text, sceneIndex)}
          </View>
        </View>
      );
    });
  };
  

  return (
    <View style={styles.container}>
      {/* Layout decision based on breakpoint */}
      {isMobile || isTabletPortrait ? (
        // Mobile + Tablet Portrait: Single Column with FAB
        <>
          <ScrollView 
            ref={scrollViewRef}
            style={styles.container}
          >
            {/* Reading Time (mobile) */}
            {readingTimeMinutes > 0 && (
              <View style={styles.mobileSectionWrapper}>
                <View style={styles.readingTimeRow}>
                  <Ionicons name="time-outline" size={18} color={theme.colors.text.secondary} />
                  <Text style={styles.readingTimeText}>
                    {t('story_viewer.reading_time', { minutes: readingTimeMinutes })}
                  </Text>
                </View>
              </View>
            )}
            {/* Audio Generation Section */}
            <View style={styles.mobileSectionWrapper}>
              {renderAudioGenerationSection()}
            </View>
            
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
              <View style={styles.mobileSectionWrapper}>
                {charactersSection}
              </View>
            )}
            
            {/* Story Scenes */}
            {renderScenesWithHighlight()}
            
            {/* Continue Story Button */}
            {renderContinueButton()}
          </ScrollView>
          
          {/* FAB for Tablet Portrait only */}
          {isTabletPortrait && (story.audioMetadata || (story?.characters?.length ?? 0) > 0) && (
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
              onDeleteStory={handleDeleteStory}
              onPublish={handleOpenPublishDialog}
              onShare={handleShare}
              onUnpublish={handleUnpublish}
              isPublishPending={publishStory.isPending}
              characters={story?.characters ?? []}
              onSaveCharacter={isArtisanMode ? handleSaveCharacter : undefined}
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
          >
            {/* Story Scenes */}
            {renderScenesWithHighlight()}
            
            {/* Continue Story Button */}
            {renderContinueButton()}
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
              
              {/* Publication block */}
              <View style={styles.publicationSection}>
                <Text style={styles.publicationSectionTitle}>{t('story_viewer.publication_title')}</Text>
                {!story?.isPublished ? (
                  <TouchableOpacity
                    style={styles.publishButton}
                    onPress={handleOpenPublishDialog}
                    disabled={publishStory.isPending}
                  >
                    <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.text.inverse} />
                    <Text style={styles.publishButtonText}>{t('story_viewer.publish')}</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <View style={styles.publicationBadge}>
                      <Ionicons
                        name={story?.visibility === 'unlisted' ? 'link-outline' : 'globe-outline'}
                        size={18}
                        color={theme.colors.text.secondary}
                      />
                      <Text style={styles.publicationBadgeText}>
                        {story?.visibility === 'unlisted'
                          ? t('story_viewer.publication_badge_unlisted')
                          : t('story_viewer.publication_badge_catalog')}
                      </Text>
                    </View>
                    <View style={styles.publicationButtonsRow}>
                      <TouchableOpacity style={[styles.shareButton, styles.publicationButtonFlex]} onPress={handleShare}>
                        <Ionicons name="share-social-outline" size={20} color={theme.colors.interactive.primary} />
                        <Text style={styles.shareButtonText}>{t('story_viewer.share_title')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.updatePublicationButton, styles.publicationButtonFlex]}
                        onPress={handleOpenPublishDialog}
                        disabled={publishStory.isPending}
                      >
                        <Ionicons name="create-outline" size={20} color={theme.colors.interactive.primary} />
                        <Text style={styles.updatePublicationButtonText}>{t('story_viewer.update_publication')}</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.unpublishLink} onPress={handleUnpublish}>
                      <Text style={styles.unpublishLinkText}>{t('story_viewer.unpublish')}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
              
              {/* Delete Story Button */}
              <TouchableOpacity 
                style={styles.deleteButton}
                onPress={handleDeleteStory}
              >
                <Ionicons name="trash-outline" size={20} color={theme.colors.status.error} />
                <Text style={styles.deleteButtonText}>{t('story_viewer.delete_story')}</Text>
              </TouchableOpacity>
              
              {/* Series Navigation */}
              {renderSeriesNavigation()}
            </View>
          </ScrollView>
          </View>
        </View>
      )}
      
      {/* M8: Continuation Progress Modal */}
      <GenerationProgressModal
        visible={isContinuationGenerating}
        status={continuationStatus?.status ?? 'pending'}
        progress={continuationStatus?.progress || 0}
        progressData={continuationStatus?.progressData}
        errorMessage={continuationStatus?.errorMessage ?? undefined}
        onClose={continuationStatus?.status === 'completed' ? handleCloseContinuationModal : undefined}
        onRetry={continuationStatus?.status === 'failed' ? handleContinue : undefined}
        allowManualClose={true}
      />
      
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
        userPseudonym={user?.pseudonym}
        onUnpublish={handleUnpublish}
        scenes={
          story?.scenes?.map((s: { image?: { url?: string }; imageUrl?: string | null }, i: number): ShareCardScene => ({
            index: i,
            imageUrl: s.image?.url ?? s.imageUrl ?? null,
          }))
        }
        shareCardSceneId={story?.shareCardSceneId ?? null}
        initialVisibility={story?.visibility === 'unlisted' ? 'unlisted' : 'public'}
        openedFromShare={publishDialogOpenedFromShare}
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
    width: '100%'
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
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border.light,
  },
  rightColumn: {
    flex: 1,
  },
  rightColumnContent: {
    paddingLeft: theme.spacing[6],
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
    marginBottom: theme.spacing[4],
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
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    marginBottom: theme.spacing[4],
    alignSelf: 'flex-start',
  },
  publicationBadgeText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  publicationButtonsRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  publicationButtonFlex: {
    flex: 1,
    marginTop: 0,
  },
  updatePublicationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    flex: 1,
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.background.primary,
  },
  updatePublicationButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.interactive.primary,
  },
  unpublishLink: {
    paddingVertical: theme.spacing[2],
    alignSelf: 'flex-start',
  },
  unpublishLinkText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.status.error,
    textDecorationLine: 'underline',
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    marginTop: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.interactive.primary,
  },
  publishButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    marginTop: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.background.primary,
  },
  shareButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.interactive.primary,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    marginTop: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.status.error,
    backgroundColor: theme.colors.background.primary,
  },
  deleteButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.status.error,
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
    height: undefined,
    aspectRatio: 16 / 9,
    marginBottom: theme.spacing[4],
    width: '100%',
  },
  sceneImagePlaceholder: {
    aspectRatio: 16 / 9,
    marginBottom: theme.spacing[4],
    backgroundColor: theme.colors.background.tertiary,
    borderRadius: theme.borders.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sceneImagePlaceholderText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  sceneImagePlaceholderTextError: {
    color: theme.colors.status.error,
  },
  sceneTextWrapper: {
    paddingHorizontal: theme.spacing[6],
  },
  sceneText: {
    fontSize: theme.typography.fontSize.lg,
    lineHeight: theme.typography.fontSize.lg * 1.6,
    color: theme.colors.text.primary,
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
  upgradeButton: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.md,
    marginBottom: theme.spacing[4],
  },
  upgradeButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  limitExceededDetails: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
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
  },
  // M8: Continue button styles
  continueContainer: {
    marginTop: theme.spacing[12],
    marginBottom: theme.spacing[8],
    paddingHorizontal: theme.spacing[6],
    alignItems: 'center',
  },
  continueTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
    textAlign: 'center',
  },
  seriesInfo: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
    textAlign: 'center',
  },
  continueDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginBottom: theme.spacing[4],
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[8],
    borderRadius: theme.borders.radius.lg,
    gap: theme.spacing[2],
    minWidth: 280,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  // M8: Series navigation styles
  seriesNavigation: {
    marginTop: theme.spacing[6],
    paddingTop: theme.spacing[6],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: theme.colors.border.light,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  navButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
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
  },
  headerBreadcrumbLink: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.interactive.primary,
  },
  headerBreadcrumbSeparator: {
    marginHorizontal: theme.spacing[1],
  },
  headerBreadcrumbCurrent: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    flexShrink: 1,
  },
});
