import { create } from 'zustand';

export interface PlayParams {
  storyId: string;
  storyTitle: string;
  audioUrl: string;
  duration: number;
  hasAlignment?: boolean;
  initialPosition?: number;
  initialHighlightEnabled?: boolean;
  initialPlaybackRate?: number;
  autoPlay?: boolean;
}

interface AudioPlayerState {
  // Currently playing story
  activeStoryId: string | null;
  storyTitle: string | null;
  audioUrl: string | null;
  duration: number;

  // Playback state
  isPlaying: boolean;
  position: number; // seconds (with ms precision, e.g. 45.234)
  isLoading: boolean;
  isLoaded: boolean;

  // Alignment / highlighting
  hasAlignment: boolean;
  isHighlightEnabled: boolean;

  // Finish event flag (consumed by AudioPlayer to trigger onFinish callback)
  didJustFinish: boolean;

  // Playback speed (0.75–1.25), persisted globally
  playbackRate: number;

  // The storyId currently being viewed in StoryViewerScreen (set/cleared on mount/unmount).
  // Used by MiniAudioPlayer to hide when the full player is already visible.
  viewingStoryId: string | null;

  // Actions
  play: (params: PlayParams) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (positionSeconds: number) => void;
  updatePosition: (positionSeconds: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setIsLoaded: (loaded: boolean) => void;
  toggleHighlight: (enabled: boolean) => void;
  setDidJustFinish: (value: boolean) => void;
  setViewingStoryId: (storyId: string | null) => void;
  setPlaybackRate: (rate: number) => void;
}

export const useAudioPlayerStore = create<AudioPlayerState>((set, get) => ({
  activeStoryId: null,
  storyTitle: null,
  audioUrl: null,
  duration: 0,

  isPlaying: false,
  position: 0,
  isLoading: false,
  isLoaded: false,

  hasAlignment: false,
  isHighlightEnabled: false,
  didJustFinish: false,
  playbackRate: 1,
  viewingStoryId: null,

  play: (params) => {
    // Stop previous playback (single-story rule)
    // The actual Sound loading is handled by globalAudioService
    set({
      activeStoryId: params.storyId,
      storyTitle: params.storyTitle,
      audioUrl: params.audioUrl,
      duration: params.duration,
      hasAlignment: params.hasAlignment ?? false,
      isHighlightEnabled: params.initialHighlightEnabled ?? false,
      playbackRate: params.initialPlaybackRate ?? get().playbackRate,
      position: params.initialPosition ?? 0,
      isPlaying: false,
      isLoading: true,
      isLoaded: false,
    });
  },

  pause: () => set({ isPlaying: false }),

  resume: () => set({ isPlaying: true }),

  stop: () =>
    set({
      activeStoryId: null,
      storyTitle: null,
      audioUrl: null,
      duration: 0,
      isPlaying: false,
      position: 0,
      isLoading: false,
      isLoaded: false,
      hasAlignment: false,
      isHighlightEnabled: false,
      didJustFinish: false,
    }),

  seek: (positionSeconds) => set({ position: positionSeconds }),

  updatePosition: (positionSeconds) => set({ position: positionSeconds }),

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  setIsLoading: (loading) => set({ isLoading: loading }),

  setIsLoaded: (loaded) => set({ isLoaded: loaded }),

  toggleHighlight: (enabled) => set({ isHighlightEnabled: enabled }),

  setDidJustFinish: (value) => set({ didJustFinish: value }),

  setViewingStoryId: (storyId) => set({ viewingStoryId: storyId }),

  setPlaybackRate: (rate) => set({ playbackRate: rate }),
}));
