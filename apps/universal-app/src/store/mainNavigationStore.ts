import { create } from 'zustand';
import type { MainTabParamList } from '@/types/navigation';

export type LastMainRoute = {
  name: keyof MainTabParamList;
  params?: object;
} | null;

interface MainNavigationState {
  lastMainRoute: LastMainRoute;
  setLastMainRoute: (route: LastMainRoute) => void;
  isLayoutTransitionInProgress: boolean;
  setLayoutTransitionInProgress: (v: boolean) => void;
}

export const useMainNavigationStore = create<MainNavigationState>((set) => ({
  lastMainRoute: null,
  setLastMainRoute: (route) => set({ lastMainRoute: route }),
  isLayoutTransitionInProgress: false,
  setLayoutTransitionInProgress: (v) => set({ isLayoutTransitionInProgress: v }),
}));
