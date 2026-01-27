import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface QueueItem {
  id: string;
  type: string;
  data: any;
  timestamp: number;
  retryCount: number;
}

interface OfflineState {
  // Queue
  queue: QueueItem[];
  
  // Sync status
  isSyncing: boolean;
  lastSyncAt: number | null;
  
  // Actions
  addToQueue: (type: string, data: any) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  syncQueue: () => Promise<void>;
  setSyncing: (syncing: boolean) => void;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      queue: [],
      isSyncing: false,
      lastSyncAt: null,

      addToQueue: (type, data) => {
        const item: QueueItem = {
          id: `${type}-${Date.now()}-${Math.random()}`,
          type,
          data,
          timestamp: Date.now(),
          retryCount: 0,
        };
        set((state) => ({ queue: [...state.queue, item] }));
      },
      
      removeFromQueue: (id) => set((state) => ({
        queue: state.queue.filter(item => item.id !== id)
      })),
      
      clearQueue: () => set({ queue: [] }),
      
      syncQueue: async () => {
        const { queue, isSyncing } = get();
        if (isSyncing || queue.length === 0) return;
        
        set({ isSyncing: true });
        
        try {
          // TODO: Implement actual sync logic
          // For now, just clear the queue
          set({ queue: [], lastSyncAt: Date.now() });
        } catch (error) {
          console.error('Error syncing queue:', error);
        } finally {
          set({ isSyncing: false });
        }
      },
      
      setSyncing: (syncing) => set({ isSyncing: syncing }),
    }),
    {
      name: 'offline-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
