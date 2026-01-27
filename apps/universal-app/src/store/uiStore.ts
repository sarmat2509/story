import { create } from 'zustand';

interface Modal {
  id: string;
  type: string;
  props?: any;
}

interface UIState {
  // Modals
  modals: Modal[];
  
  // Loading states
  isLoading: boolean;
  loadingMessage: string | null;
  
  // Language
  currentLanguage: string;
  
  // Theme
  isDarkMode: boolean;
  
  // Actions
  showModal: (id: string, type: string, props?: any) => void;
  hideModal: (id: string) => void;
  hideAllModals: () => void;
  setLoading: (loading: boolean, message?: string) => void;
  setLanguage: (language: string) => void;
  toggleTheme: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  modals: [],
  isLoading: false,
  loadingMessage: null,
  currentLanguage: 'uk',
  isDarkMode: false,

  showModal: (id, type, props) => set((state) => ({
    modals: [...state.modals, { id, type, props }]
  })),
  
  hideModal: (id) => set((state) => ({
    modals: state.modals.filter(m => m.id !== id)
  })),
  
  hideAllModals: () => set({ modals: [] }),
  
  setLoading: (loading, message) => set({ 
    isLoading: loading, 
    loadingMessage: message || null 
  }),
  
  setLanguage: (language) => set({ currentLanguage: language }),
  
  toggleTheme: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
}));
