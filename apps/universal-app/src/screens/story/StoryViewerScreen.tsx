import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Image, StyleSheet, ActivityIndicator, TouchableOpacity, Platform, ImageStyle } from 'react-native';
import { useRoute, RouteProp, useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useStory, useGenerateAudio, useGenerateAlignment, useAudioStatus, useAudioUrl, useAudioUsage, useDeleteStory, useGenerateContinuation, useSeriesInfo, useStoryStatus } from '@/api/stories';
import { useVoices } from '@/api/voices';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toastService } from '@/services/toastService';
import { audioNotificationService } from '@/services/audioNotificationService';
import { audioPlaybackService } from '@/services/audioPlaybackService';
import { globalAudioService } from '@/services/globalAudioService';
import { useAudioPlayerStore } from '@/store/audioPlayerStore';
import { theme } from '@/theme';
import type { MainDrawerParamList } from '@/types/navigation';
import AudioPlayer from '@/components/AudioPlayer';
import VoiceSelector from '@/components/VoiceSelector';
import { useAlignmentSync } from '@/hooks/useAlignmentSync';
import { GenerationProgressModal } from '@/components/GenerationProgressModal';

type StoryViewerRouteProp = RouteProp<MainDrawerParamList, 'Story'>;

// Helper function to remove audio tags from text
const removeAudioTags = (text: string): string => {
  // Remove ElevenLabs audio tags like [happy], [sad], [excited], etc.
  // Keep whitespace and newlines intact
  return text.replace(/\[[\w\s]+\]/g, '');
};

export default function StoryViewerScreen() {
  const route = useRoute<StoryViewerRouteProp>();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { storyId } = route.params;
  const { data: story, isLoading, error } = useStory(storyId);
  const generateAudio = useGenerateAudio();
  const generateAlignment = useGenerateAlignment();
  
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
  const activeWordRef = useRef<Text>(null);
  const sceneRefs = useRef<(View | null)[]>([]);
  const wordPositions = useRef<Record<string, { x: number; y: number; width: number; top: number }>>({});
  const [underlineStyle, setUnderlineStyle] = useState<{ left: number; top: number; width: number } | null>(null);
  const [remountKey, setRemountKey] = useState(0);
  const lastPositionUpdateTime = useRef(0);
  
  // M7: Audio playback state persistence (global service handles saving/restoring)
  
  // Voice selection state
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined);
  const [selectedVoice, setSelectedVoice] = useState<any>(undefined);
  
  // Use story language for voice selection (not UI language)
  const storyLanguage = story?.language || 'uk';
  const { data: voicesData, isLoading: isLoadingVoices, error: voicesError } = useVoices(storyLanguage);
  const voices = voicesData?.data || [];
  const userPlan = voicesData?.meta?.userPlan || 'free';
  const hasPremiumAccess = voicesData?.meta?.hasPremiumAccess || false;
  
  // Audio usage stats
  const { data: audioUsage } = useAudioUsage();
  
  // Track which story is currently being viewed so MiniAudioPlayer can hide.
  // useFocusEffect (not useEffect) because Drawer/Tab navigators keep screens
  // mounted when navigating away — cleanup must fire on blur, not just unmount.
  const setViewingStoryId = useAudioPlayerStore((s) => s.setViewingStoryId);
  useFocusEffect(
    useCallback(() => {
      setViewingStoryId(storyId);
      return () => setViewingStoryId(null);
    }, [storyId, setViewingStoryId])
  );
  
  // Set header title from database after story loads
  useEffect(() => {
    if (story?.title) {
      navigation.setOptions({
        title: story.title,
      });
    }
  }, [story?.title, navigation]);
  
  // Delete story mutation
  const deleteStory = useDeleteStory();
  
  // Delete dialog state
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  
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
  
  // Use lightweight polling for audio status
  const { data: audioStatus } = useAudioStatus(storyId, true);
  const jobStatus = (audioStatus as any)?.jobStatus as 'queued' | 'processing' | null | undefined; // 'queued' | 'processing' | null
  const isGenerating = jobStatus !== null && jobStatus !== undefined;
  
  // Fetch audio URL when audio is ready
  const { data: audioData } = useAudioUrl(
    storyId,
    !!story?.audioMetadata // Only fetch if audio exists
  );
  
  // Sync audioMetadata from polling into story cache
  // (replaces dead onSuccess in useAudioStatus -- removed in TanStack Query v5)
  useEffect(() => {
    const polledMetadata = (audioStatus as any)?.audioMetadata;
    if (polledMetadata) {
      queryClient.setQueryData(['story', storyId], (oldData: any) => {
        if (!oldData) return oldData;
        return { ...oldData, audioMetadata: polledMetadata };
      });
    }
  }, [(audioStatus as any)?.audioMetadata, storyId, queryClient]);
  
  // Show toast when audio completes (using AsyncStorage to show only once)
  useEffect(() => {
    const checkAndShowNotification = async () => {
      // Show only if:
      // 1. Generation completed (isGenerating = false)
      // 2. Audio exists (audioStatus?.audioMetadata)
      // 3. Notification not shown yet
      if (!isGenerating && (audioStatus as any)?.audioMetadata) {
        // CRITICAL: Refetch story to update audioMetadata in UI
        // This ensures the audio generation section hides immediately
        queryClient.invalidateQueries({ queryKey: ['story', storyId] });
        
        const wasShown = await audioNotificationService.wasShown(storyId);
        
        if (!wasShown) {
          toastService.success(
            'Аудіосказка готова!',
            'Натисніть для перегляду',
            {
              visibilityTime: 20000, // 20 seconds
              onPress: () => {
                navigation.navigate('Story', { storyId });
              },
            }
          );
          
          await audioNotificationService.markAsShown(storyId);
        }
      }
    };
    
    checkAndShowNotification();
  }, [isGenerating, (audioStatus as any)?.audioMetadata, storyId, navigation, queryClient]);
  
  // M6: Proactive alignment generation
  // Automatically generate alignment if audio exists but alignment is missing
  useEffect(() => {
    if (!story || !story.audioMetadata) return;
    
    const audioMetadata = story.audioMetadata as any;
    
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
  
  // Register audio with global service when audioData becomes available
  useEffect(() => {
    if (!audioData || !story) return;

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
        audioUrl: audioData.audioUrl,
        duration: audioData.duration,
        initialPosition: initialPosition.toFixed(3) + 's',
        initialHighlight,
      });

      await globalAudioService.loadAndPlay({
        storyId,
        storyTitle: story.title || 'Story',
        audioUrl: audioData.audioUrl,
        duration: audioData.duration,
        hasAlignment: !!(story.audioMetadata as any)?.alignment,
        initialPosition,
        initialHighlightEnabled: initialHighlight,
        autoPlay: false, // Don't auto-play, let user press play
      });
    };

    loadAudio();
  }, [audioData, storyId, story]);
  
  // Called when user presses play on a story that isn't the currently active one
  const handleActivateAudio = useCallback(async () => {
    if (!audioData || !story) return;

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
      audioUrl: audioData.audioUrl,
      duration: audioData.duration,
      hasAlignment: !!(story.audioMetadata as any)?.alignment,
      initialPosition,
      initialHighlightEnabled: initialHighlight,
      autoPlay: true, // User explicitly pressed play
    });
  }, [audioData, storyId, story]);
  
  // M6: Alignment sync hook - maps audio position to sentences and words
  console.log('[StoryViewer] Before useAlignmentSync:', {
    hasStory: !!story,
    fullTextLength: story?.fullText?.length || 0,
    hasAudioMetadata: !!story?.audioMetadata,
    audioMetadata: story?.audioMetadata,
    alignmentType: typeof (story?.audioMetadata as any)?.alignment,
    hasAlignment: !!(story?.audioMetadata as any)?.alignment,
    wordCount: ((story?.audioMetadata as any)?.alignment?.words?.length) || 0,
    currentPosition: currentPosition.toFixed(3),
    isHighlightEnabled,
    effectiveHighlightEnabled,
  });
  
  // Precompute cleaned scene texts for sentence-to-scene mapping
  const sceneTexts = useMemo(() => {
    if (!story?.scenes) return [];
    return story.scenes.map((s: any) => removeAudioTags(s.text));
  }, [story?.scenes]);
  
  const { activeSentenceIndex, activeWordIndex, sentences } = useAlignmentSync(
    story?.fullText || '',
    (story?.audioMetadata as any)?.alignment,
    currentPosition,
    sceneTexts
  );
  
  // Debug: log what is actively highlighted when sentence/word changes
  useEffect(() => {
    if (!effectiveHighlightEnabled) return;
    if (activeSentenceIndex === null) return;
    const sentence = sentences[activeSentenceIndex];
    if (!sentence) return;
    const wordText = activeWordIndex !== null ? sentence.words[activeWordIndex]?.text : null;
    console.log('[StoryViewer] Highlight:', {
      pos: currentPosition.toFixed(3),
      sentIdx: activeSentenceIndex,
      sentSnippet: sentence.text.substring(0, 50),
      wordIdx: activeWordIndex,
      word: wordText || '(none)',
    });
  }, [effectiveHighlightEnabled, activeSentenceIndex, activeWordIndex, sentences, currentPosition]);
  
  // M6: Callback from AudioPlayer - toggle highlight on/off
  const handleHighlightToggle = useCallback(async (enabled: boolean) => {
    console.log('[StoryViewer] Highlight toggle:', enabled);
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
    console.log('[StoryViewer] Position update:', position.toFixed(2) + 's');
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
      navigation.navigate('Story', { storyId: newStoryId });
    }
  }, [continuationStatus, navigation]);
  
  // M6: Auto-scroll to active word when it changes (web only)
  useEffect(() => {
    if (!isWeb || !effectiveHighlightEnabled || activeWordIndex === null || !activeWordRef.current) {
      return;
    }
    
    // Use native scrollIntoView on web
    const wordElement = activeWordRef.current as any;
    if (wordElement && wordElement.scrollIntoView) {
      wordElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [activeSentenceIndex, effectiveHighlightEnabled, activeWordIndex]);
  
  // M6: Handle window resize - clear cached positions and remount
  useEffect(() => {
    if (!isWeb) return;
    
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        console.log('[StoryViewer] Window resized, clearing word positions and remounting');
        wordPositions.current = {};
        setUnderlineStyle(null);
        setRemountKey((prev: number) => prev + 1); // Force remount to trigger onLayout
      }, 300); // Debounce resize events
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [isWeb]);

  // M6: Update underline position when active word changes
  useEffect(() => {
    if (!effectiveHighlightEnabled || activeWordIndex === null || activeSentenceIndex === null) {
      setUnderlineStyle(null);
      return;
    }
    
    const wordKey = `${activeSentenceIndex}-${activeWordIndex}`;
    const wordLayout = wordPositions.current[wordKey];
    
    console.log('[StoryViewer] Update underline:', {
      wordKey,
      wordLayout,
      hasLayout: !!wordLayout,
    });
    
    if (wordLayout) {
      setUnderlineStyle({
        left: wordLayout.x,
        top: wordLayout.top,
        width: wordLayout.width,
      });
    }
  }, [activeSentenceIndex, activeWordIndex, effectiveHighlightEnabled]);
  
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
      queryClient.invalidateQueries({ queryKey: ['audio-usage'] });
      
      toastService.info(
        'Готуємо аудіосказку',
        'Це може зайняти кілька хвилин'
      );
    } catch (error: any) {
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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>Завантажуємо історію...</Text>
      </View>
    );
  }

  if (error || !story) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Не вдалося завантажити історію</Text>
      </View>
    );
  }

  // Check if web platform
  const isWeb = Platform.OS === 'web';

  // Check if audio generation failed
  const audioFailed = (story.audioMetadata as any)?.error === true;
  const hasGenerationInProgress = isGenerating || (audioStatus as any)?.jobStatus === 'processing';
  
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
            onPress={() => navigation.navigate('Story', { 
              storyId: storyIds[currentIndex - 1]
            })}
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
            onPress={() => navigation.navigate('Story', { 
              storyId: storyIds[currentIndex + 1]
            })}
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
  const renderAudioGenerationSection = () => (
    (!story.audioMetadata || audioFailed || hasGenerationInProgress) && (
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
        ) : hasGenerationInProgress ? (
          // Show loading state during generation
          <View style={styles.generatingContainer}>
            <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
            <Text style={styles.generatingText}>
              {jobStatus === 'queued' 
                ? t('story_viewer.audio_queued') 
                : t('story_viewer.audio_generating')}
            </Text>
            <Text style={styles.generatingHint}>
              {t('toast.audio_generating_message')}
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
    
    // Debug: Check if newlines are preserved
    if (sceneIndex === 0) {
      console.log('[renderSceneText] First scene text (first 200 chars):', 
        JSON.stringify(cleanedSceneText.substring(0, 200))
      );
    }
    
    // If no alignment, render plain text
    if (!story.audioMetadata?.alignment || sentences.length === 0) {
      return <Text style={styles.sceneText}>{cleanedSceneText}</Text>;
    }
    
    // Find sentences that belong to this scene using stored sceneIndex
    const sceneSentences = sentences.filter(s => s.sceneIndex === sceneIndex);
    
    if (sceneSentences.length === 0) {
      // No matching sentences for this scene
      return <Text style={styles.sceneText}>{cleanedSceneText}</Text>;
    }
    
    // Render text with wrapped sentences/words
    let renderedText: any[] = [];
    let lastIndex = 0;
    
    sceneSentences.forEach((sentence) => {
      const sentenceIndex = sentences.indexOf(sentence);
      const isActive = effectiveHighlightEnabled && sentenceIndex === activeSentenceIndex;
      
      // Find sentence position in scene text
      const sentencePos = cleanedSceneText.indexOf(sentence.text, lastIndex);
      if (sentencePos === -1) return;
      
      // Add text before sentence (if any)
      if (sentencePos > lastIndex) {
        renderedText.push(cleanedSceneText.substring(lastIndex, sentencePos));
      }
      
      // Add wrapped sentence with words
      renderedText.push(
        <Text
          key={`s-${sentenceIndex}`}
          style={[
            styles.sentenceText,
            isActive && styles.highlightedSentence,
          ]}
        >
          {sentence.words.map((word, wordIndex) => (
            <React.Fragment key={`${sentenceIndex}-${wordIndex}`}>
              <Text
                ref={
                  effectiveHighlightEnabled &&
                  sentenceIndex === activeSentenceIndex &&
                  wordIndex === activeWordIndex
                    ? activeWordRef
                    : undefined
                }
                onLayout={(event: any) => {
                  // Measure word position using DOM API (web only)
                  const wordElement = event.nativeEvent.target as any;
                  const wordKey = `${sentenceIndex}-${wordIndex}`;
                  
                  // Use sceneIndex from parent scope (passed to renderSceneTextWithHighlight)
                  const containerRef = sceneRefs.current[sceneIndex];
                  
                  if (wordIndex < 3 && sentenceIndex === 7) {
                    console.log('[onLayout] Called:', {
                      wordKey,
                      word: word.text,
                      sceneIndex,
                      hasElement: !!wordElement,
                      hasBoundingClientRect: wordElement && !!wordElement.getBoundingClientRect,
                      hasRef: !!containerRef,
                    });
                  }
                  
                  if (wordElement && wordElement.getBoundingClientRect && containerRef) {
                    const wordRect = wordElement.getBoundingClientRect();
                    const containerElement = containerRef as any;
                    const containerRect = containerElement.getBoundingClientRect();
                    
                    const position = {
                      x: wordRect.left - containerRect.left,
                      y: wordRect.top - containerRect.top,
                      width: wordRect.width,
                      top: wordRect.bottom - containerRect.top + 2, // Add 2px offset
                    };
                    
                    // Calculate position relative to scene container
                    wordPositions.current[wordKey] = position;
                    
                    // Log first few words for debugging
                    if (wordIndex < 3 && sentenceIndex === 7) {
                      console.log('[onLayout] Word measured:', {
                        wordKey,
                        word: word.text,
                        sceneIndex,
                        position,
                      });
                    }
                  }
                }}
                style={styles.wordText}
              >
                {word.text}
              </Text>
              {wordIndex < sentence.words.length - 1 ? ' ' : ''}
            </React.Fragment>
          ))}
        </Text>
      );
      
      lastIndex = sentencePos + sentence.text.length;
    });
    
    // Add remaining text after last sentence
    if (lastIndex < cleanedSceneText.length) {
      renderedText.push(cleanedSceneText.substring(lastIndex));
    }
    
    return <Text style={styles.sceneText}>{renderedText}</Text>;
  };

  // M6: Get scene index directly from sentence metadata (no substring matching needed)
  const activeSceneIndex = activeSentenceIndex !== null
    ? (sentences[activeSentenceIndex]?.sceneIndex ?? null)
    : null;
  
  console.log('[StoryViewer] Render state:', {
    activeSceneIndex,
    activeSentenceIndex,
    activeWordIndex,
    hasUnderlineStyle: !!underlineStyle,
    effectiveHighlightEnabled,
  });

  // M6: Render story scenes with optional highlighting
  const renderScenesWithHighlight = () => {
    return story.scenes?.map((scene: any, sceneIndex: number) => {
      // Check if this is the scene with active sentence
      const isActiveScene = sceneIndex === activeSceneIndex;
      
      const shouldRenderUnderline = effectiveHighlightEnabled && isActiveScene && underlineStyle;
      
      if (shouldRenderUnderline) {
        console.log('[Scene] Rendering underline for scene:', {
          sceneIndex,
          isActiveScene,
          underlineStyle,
        });
      }
      
      return (
        <View 
          key={`${scene.sceneId || sceneIndex}-${remountKey}`}
          ref={(ref: View | null) => { sceneRefs.current[sceneIndex] = ref; }}
          style={styles.scene}
        >
          {scene.image?.url && (
            <Image 
              source={{ uri: scene.image.url }} 
              style={styles.sceneImage as ImageStyle}
              resizeMode="cover"
            />
          )}
          
          {renderSceneTextWithHighlight(scene.text, sceneIndex)}
          
          {/* Animated underline only for active scene */}
          {shouldRenderUnderline && (
            <View
              style={[
                styles.wordUnderline,
                {
                  left: underlineStyle.left,
                  top: underlineStyle.top,
                  width: underlineStyle.width,
                },
              ]}
            />
          )}
        </View>
      );
    });
  };
  

  return (
    <View style={styles.container}>
      {isWeb ? (
        // Desktop: Two Column Layout
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
          
          {/* Right Column: Sidebar (sticky) */}
          
          <View style={styles.rightColumn}>
              <View style={styles.sidebar}>
                {/* Audio Generation Section (if audio not ready) */}
                {renderAudioGenerationSection()}
                {/* Audio Widget */}
                {story.audioMetadata && audioData && (<View style={styles.sidebarWidget}>
                  <Text style={styles.sidebarWidgetTitle}>{t('story_viewer.audio_title')}</Text>
                  <AudioPlayer
                    storyId={storyId}
                    audioUrl={audioData.audioUrl}
                    duration={audioData.duration}
                    hasAlignment={!!(story.audioMetadata as any)?.alignment}
                    onHighlightToggle={handleHighlightToggle}
                    onPositionChange={handlePositionChangeWrapper}
                    onFinish={handleAudioFinish}
                    onActivate={handleActivateAudio}
                  />
                </View>)}
                
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
                
                {/* Future widgets can be added here:
                    - Story metadata
                    - Share buttons
                    - Related stories
                    - etc.
                */}
              </View>
            </View>
        </View>
      ) : (
        // Mobile: Single Column ScrollView (existing layout)
        <ScrollView style={styles.container}>
          {/* Audio Generation Section */}
          {renderAudioGenerationSection()}
          
          {/* Show audio player if audio exists */}
          {story.audioMetadata && audioData && (
            <View style={styles.audioPlayerContainer}>
              <AudioPlayer
                storyId={storyId}
                audioUrl={audioData.audioUrl}
                duration={audioData.duration}
                title={`🎧 ${t('story_viewer.audio_title')}`}
                hasAlignment={!!(story.audioMetadata as any)?.alignment}
                onHighlightToggle={handleHighlightToggle}
                onPositionChange={handlePositionChangeWrapper}
                onFinish={handleAudioFinish}
                onActivate={handleActivateAudio}
              />
            </View>
          )}
          
          {/* Story Scenes */}
          {renderScenesWithHighlight()}
          
          {/* Continue Story Button */}
          {renderContinueButton()}
        </ScrollView>
      )}
      
      {/* M8: Continuation Progress Modal */}
      <GenerationProgressModal
        visible={isContinuationGenerating}
        status={continuationStatus?.status || 'pending'}
        progress={continuationStatus?.progress || 0}
        progressData={continuationStatus?.progressData}
        errorMessage={continuationStatus?.errorMessage}
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
    paddingHorizontal: theme.spacing[6], // 24px margin from screen edges
  },
  leftColumn: {
    flex: 1,
    paddingRight: theme.spacing[6],
    paddingTop: theme.spacing[6],
  },
  rightColumn: {
    width: 360,
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
  sidebarWidgetTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
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
    marginVertical: theme.spacing[4],
    padding: theme.spacing[5],
    borderWidth: 2,
    borderColor: theme.colors.interactive.primary,
    borderRadius: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
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
    paddingHorizontal: theme.spacing[6],
  },
  sceneImage: {
    height: undefined,
    aspectRatio: 16 / 9,
    marginBottom: theme.spacing[4],
    marginHorizontal: -theme.spacing[6], // Extend image to full width
  },
  sceneText: {
    fontSize: theme.typography.fontSize.lg,
    lineHeight: theme.typography.fontSize.lg * 1.6,
    color: theme.colors.text.primary,
  },
  limitExceededContainer: {
    padding: theme.spacing[6],
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
  // M6: Sentence/word highlighting styles
  sentenceText: {
    // Inline sentence span - no additional styles, just for structure
  },
  highlightedSentence: {
    backgroundColor: 'rgb(218, 239, 253)', // Light blue background
    borderRadius: theme.borders.radius.sm,
    // @ts-ignore - boxDecorationBreak works on web
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
    paddingVertical: 2,
  },
  wordText: {
    // Inline word span - no additional styles
  },
  wordUnderline: {
    position: 'absolute',
    height: 3,
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: 2,
    // @ts-ignore - CSS transition for smooth animation
    transition: 'left 0.15s ease-out, width 0.15s ease-out, top 0.15s ease-out',
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
});
