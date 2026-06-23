import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

export type MapTileConnector = 'PATH' | 'WATER' | 'PORTAL' | 'SHORE';
export type MapTileSide = 'N' | 'E' | 'S' | 'W';

export interface CollectedMapTileApi {
  id: string;
  userId: string;
  childProfileId: string | null;
  storyId: string;
  assetId: string;
  acquiredLabel: string | null;
  acquiredAt: string;
  imageUrl: string;
  storagePath: string;
  mimeType: string;
  maskId: string;
  connectors: Partial<Record<MapTileSide, MapTileConnector>>;
  location: 'board' | 'inventory';
  boardX: number | null;
  boardY: number | null;
  inventoryOrder: number;
  story: {
    id: string;
    title: string;
    language: string;
    createdAt: string;
    coverAssetId: string | null;
    coverImageUrl: string | null;
    coverThumbnailUrl: string | null;
  };
}

export interface GeneratedStoryMapTileApi {
  id: string;
  storyId: string;
  imageUrl: string;
  storagePath: string;
  mimeType: string;
  maskId: string;
  connectors: Partial<Record<MapTileSide, MapTileConnector>>;
  createdAt: string;
}

export interface StoryMapTileStatusApi {
  generated: GeneratedStoryMapTileApi | null;
  collected: CollectedMapTileApi | null;
}

export interface MapTilePlacementInput {
  id: string;
  location: 'board' | 'inventory';
  boardX?: number | null;
  boardY?: number | null;
  inventoryOrder?: number | null;
}

export function useCollectedMapTiles(params: { childProfileId?: string } = {}) {
  return useQuery({
    queryKey: ['collected-map-tiles', params.childProfileId ?? null],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.childProfileId) {
        searchParams.set('child_profile_id', params.childProfileId);
      }
      const queryString = searchParams.toString();
      const response = await apiClient.get<{
        status: string;
        tiles: CollectedMapTileApi[];
      }>(`/api/v1/me/map-tiles${queryString ? `?${queryString}` : ''}`);
      return response.data.tiles;
    },
  });
}

export function useStoryMapTileStatus(
  storyId: string | undefined,
  params: { childProfileId?: string; enabled?: boolean } = {}
) {
  const { enabled = true } = params;
  return useQuery({
    queryKey: ['story-map-tile-status', storyId, params.childProfileId ?? null],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.childProfileId) {
        searchParams.set('child_profile_id', params.childProfileId);
      }
      const queryString = searchParams.toString();
      const response = await apiClient.get<{
        status: string;
        generated: GeneratedStoryMapTileApi | null;
        collected: CollectedMapTileApi | null;
      }>(`/api/v1/me/map-tiles/story/${storyId}${queryString ? `?${queryString}` : ''}`);
      return {
        generated: response.data.generated,
        collected: response.data.collected,
      };
    },
    enabled: enabled && !!storyId,
  });
}

export function useCollectMapTile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      storyId: string;
      assetId?: string;
      childProfileId?: string;
    }) => {
      const response = await apiClient.post<{
        status: string;
        tile: CollectedMapTileApi;
        alreadyCollected: boolean;
      }>('/api/v1/me/map-tiles/collect', data);
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['collected-map-tiles'] });
      queryClient.invalidateQueries({ queryKey: ['story-map-tile-status', variables.storyId] });
    },
  });
}

export function useUpdateMapTileLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      placements: MapTilePlacementInput[];
      childProfileId?: string;
    }) => {
      const response = await apiClient.put<{
        status: string;
        tiles: CollectedMapTileApi[];
      }>('/api/v1/me/map-tiles/layout', data);
      return response.data.tiles;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collected-map-tiles'] });
    },
  });
}
