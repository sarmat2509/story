import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface WizardState {
  // Current step (0-4)
  currentStep: number;
  
  // Form data
  childProfileId: string | null;
  theme: string | null;
  tone: string | null;
  language: string;
  imageStyle: string | null;
  includeFamily: boolean;
  selectedCharacters: string[];
  userNotes: string;
  
  // Validation errors
  errors: Record<string, string>;
  
  // Actions
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateField: (field: string, value: any) => void;
  setError: (field: string, error: string) => void;
  clearErrors: () => void;
  resetWizard: () => void;
  addCharacter: (characterId: string) => void;
  removeCharacter: (characterId: string) => void;
}

const initialState = {
  currentStep: 0,
  childProfileId: null,
  theme: null,
  tone: null,
  language: 'uk',
  imageStyle: null,
  includeFamily: false,
  selectedCharacters: [],
  userNotes: '',
  errors: {},
};

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setStep: (step) => set({ currentStep: step }),
      
      nextStep: () => set((state) => ({ 
        currentStep: Math.min(state.currentStep + 1, 4) 
      })),
      
      prevStep: () => set((state) => ({ 
        currentStep: Math.max(state.currentStep - 1, 0) 
      })),
      
      updateField: (field, value) => set({ [field]: value }),
      
      setError: (field, error) => set((state) => ({
        errors: { ...state.errors, [field]: error }
      })),
      
      clearErrors: () => set({ errors: {} }),
      
      resetWizard: () => set(initialState),
      
      addCharacter: (characterId) => set((state) => {
        if (state.selectedCharacters.length >= 5) return state;
        if (state.selectedCharacters.includes(characterId)) return state;
        return {
          selectedCharacters: [...state.selectedCharacters, characterId]
        };
      }),
      
      removeCharacter: (characterId) => set((state) => ({
        selectedCharacters: state.selectedCharacters.filter(id => id !== characterId)
      })),
    }),
    {
      name: 'wizard-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
