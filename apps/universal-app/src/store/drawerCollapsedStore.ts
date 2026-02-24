import { LayoutAnimation, Platform, UIManager } from 'react-native';
import { create } from 'zustand';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface DrawerCollapsedState {
  collapsed: boolean;
  toggle: () => void;
}

export const useDrawerCollapsedStore = create<DrawerCollapsedState>((set) => ({
  collapsed: true,
  toggle: () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    set((s) => ({ collapsed: !s.collapsed }));
  },
}));
