import React, { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { NavigationProp, useNavigation, useRoute } from '@react-navigation/native';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { stripCharacterIdFromName } from '@wondertales/shared';
import {
  type AdminMapTileAssetPayload,
  useAdminDirectorScenes,
  useAdminJobStatus,
  useAdminRegenerateGraphicNovelPageImage,
  useAdminRegenerateSceneImage,
  useAdminResetStoryAudio,
} from '@/admin/api/admin';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { API_BASE_URL } from '@/config/constants';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';
import { formatAssetUrl } from '@/utils/assetUrl';
import { storage } from '@/utils/storage';

function confirmAdminAudioAction(message: string): Promise<boolean> {
  if (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.confirm === 'function'
  ) {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert('Confirm', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) {
    return '—';
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  return `${Math.round(ms)} ms (${(ms / 1000).toFixed(1)} s)`;
}

function formatCompactDurationMs(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) {
    return null;
  }
  if (ms < 60_000) {
    return `${Math.max(1, Math.round(ms / 1000))}s`;
  }
  return `${Math.round(ms / 60_000)}m`;
}

function shortJobId(jobId: string): string {
  return jobId.slice(-7);
}

function formatValidationScore(score: number | null, status: string): string {
  if (score != null) return `${score}/100`;
  if (status === 'provider_blocked') return 'blocked';
  return 'n/a';
}

function formatAdminApiUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/')) {
    return Platform.OS === 'web' ? url : `${API_BASE_URL.replace(/\/$/, '')}${url}`;
  }
  return url;
}

function toLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toUpperCase();
}

function scrollToAnchor(anchorId: string) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function splitCharacterNameAndId(rawName: unknown): {
  displayName: string;
  characterId: string | null;
} {
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    return { displayName: '', characterId: null };
  }

  const match = rawName.match(/\[ID:\s*([^\]]+)\]/i);
  return {
    displayName: stripCharacterIdFromName(rawName).trim(),
    characterId: match?.[1]?.trim() ?? null,
  };
}

function renderCharacterCards(
  characters: unknown[],
  keyPrefix: string,
  options?: {
    selectedOutfitId?: string | null;
    onOutfitPress?: (outfitId: string) => void;
  }
): React.ReactNode {
  return (
    <View style={styles.characterCardsRow}>
      {characters.map((character, index) => {
        const entries =
          character && typeof character === 'object' && !Array.isArray(character)
            ? Object.entries(character as Record<string, unknown>)
            : [['value', character]];
        const { displayName, characterId } = splitCharacterNameAndId(
          (character as Record<string, unknown>)?.name
        );

        return (
          <View key={`${keyPrefix}-${index}`} style={styles.characterCard}>
            <View style={styles.characterCardTitleWrap}>
              <Text style={styles.characterCardTitle}>
                {(displayName || `CHARACTER ${index + 1}`).toUpperCase()}
              </Text>
              {characterId ? <Text style={styles.characterCardId}>ID: {characterId}</Text> : null}
            </View>
            <View style={styles.valueGroup}>
              {entries
                .filter(([key]) => key !== 'name')
                .map(([key, entry]) => (
                  <View key={`${keyPrefix}-${index}-${key}`} style={styles.valueRow}>
                    <Text style={styles.valueKey}>{toLabel(String(key))}</Text>
                    {key === 'outfitId' && typeof entry === 'string' ? (
                      <TouchableOpacity
                        onPress={() => {
                          options?.onOutfitPress?.(entry);
                        }}
                      >
                        <Text
                          style={
                            entry === options?.selectedOutfitId
                              ? styles.linkTextActive
                              : styles.linkText
                          }
                        >
                          {entry}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      renderStructuredValue(entry, `${keyPrefix}-${index}-${key}`)
                    )}
                  </View>
                ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function renderStructuredValue(value: unknown, keyPrefix: string = 'root'): React.ReactNode {
  if (value == null) {
    return <Text style={styles.valueText}>n/a</Text>;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <Text style={styles.valueText}>{String(value)}</Text>;
  }

  if (Array.isArray(value)) {
    const shouldRenderCharactersAsCards =
      keyPrefix.toLowerCase().includes('characters') &&
      value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));

    if (shouldRenderCharactersAsCards) {
      return renderCharacterCards(value, keyPrefix);
    }

    return (
      <View style={styles.valueGroup}>
        {value.map((entry, index) => (
          <View key={`${keyPrefix}-${index}`} style={styles.valueRow}>
            <Text style={styles.valueKey}>{`${toLabel(String(index + 1))}`}</Text>
            {renderStructuredValue(entry, `${keyPrefix}-${index}`)}
          </View>
        ))}
      </View>
    );
  }

  if (typeof value === 'object') {
    return (
      <View style={styles.valueGroup}>
        {Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
          <View key={`${keyPrefix}-${key}`} style={styles.valueRow}>
            <Text style={styles.valueKey}>{toLabel(key)}</Text>
            {renderStructuredValue(entry, `${keyPrefix}-${key}`)}
          </View>
        ))}
      </View>
    );
  }

  return <Text style={styles.valueText}>{String(value)}</Text>;
}

function renderSceneVisual(
  sceneVisual: unknown,
  options?: {
    selectedOutfitId?: string | null;
    onOutfitPress?: (outfitId: string) => void;
  }
): React.ReactNode {
  if (!sceneVisual || typeof sceneVisual !== 'object') {
    return <Text style={styles.metaText}>n/a</Text>;
  }

  const scene = sceneVisual as Record<string, unknown>;
  const cameraComposition =
    scene.cameraComposition && typeof scene.cameraComposition === 'object'
      ? (scene.cameraComposition as Record<string, unknown>)
      : null;

  return (
    <View style={styles.sceneVisualSections}>
      <View style={styles.sceneVisualTopRow}>
        <View style={[styles.sceneVisualBlock, styles.sceneVisualColumn]}>
          <View style={styles.sceneVisualHeading}>
            <Ionicons name="image-outline" size={16} color={theme.colors.interactive.primary} />
            <Text style={styles.sceneVisualHeadingText}>SETTING</Text>
          </View>
          {renderStructuredValue(scene.setting, 'sceneVisual-setting')}
        </View>

        <View style={[styles.sceneVisualBlock, styles.sceneVisualColumn]}>
          <View style={styles.sceneVisualHeading}>
            <Ionicons name="sunny-outline" size={16} color={theme.colors.interactive.primary} />
            <Text style={styles.sceneVisualHeadingText}>LIGHTING</Text>
          </View>
          {renderStructuredValue(scene.lighting, 'sceneVisual-lighting')}
        </View>
      </View>

      <View style={styles.sceneDivider} />

      <View style={styles.sceneVisualBlock}>
        <View style={styles.sceneVisualHeading}>
          <Ionicons name="camera-outline" size={16} color={theme.colors.interactive.primary} />
          <Text style={styles.sceneVisualHeadingText}>CAMERA COMPOSITION</Text>
        </View>
        {cameraComposition?.shot !== undefined ? (
          <View style={styles.valueRow}>
            <Text style={styles.valueKey}>SHOT</Text>
            {renderStructuredValue(cameraComposition.shot, 'sceneVisual-camera-shot')}
          </View>
        ) : (
          <Text style={styles.metaText}>n/a</Text>
        )}
        {Array.isArray(cameraComposition?.characters) && cameraComposition.characters.length > 0 ? (
          <View style={styles.valueRow}>
            <Text style={styles.valueKey}>CHARACTERS</Text>
            {renderCharacterCards(
              cameraComposition.characters,
              'sceneVisual-camera-characters',
              options
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function AuthenticatedAdminImagePreview({
  url,
  style,
  resizeMode,
  emptyLabel,
  iconName,
}: {
  url: string | null;
  style: any;
  resizeMode: 'cover' | 'contain';
  emptyLabel: string;
  iconName: keyof typeof Ionicons.glyphMap;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    setResolvedUrl(null);
    setFailed(false);

    if (!url) {
      return () => undefined;
    }

    if (Platform.OS !== 'web' || url.startsWith('blob:') || url.startsWith('data:')) {
      setResolvedUrl(url);
      return () => undefined;
    }

    const load = async () => {
      try {
        const token = await storage.getAuthToken();
        const response = await fetch(url, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) {
          throw new Error(`Image request failed: ${response.status}`);
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setResolvedUrl(objectUrl);
        }
      } catch (_error) {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  if (!url || failed) {
    return (
      <View style={[style, styles.mapTilePreviewEmptyState]}>
        <Ionicons name={iconName} size={26} color={theme.colors.text.secondary} />
        <Text style={styles.metaText}>{emptyLabel}</Text>
      </View>
    );
  }

  if (!resolvedUrl) {
    return (
      <View style={[style, styles.mapTilePreviewEmptyState]}>
        <Text style={styles.metaText}>Loading...</Text>
      </View>
    );
  }

  return <Image source={{ uri: resolvedUrl }} style={style} resizeMode={resizeMode} />;
}

function renderFeatureChips(features: unknown, keyPrefix: string): React.ReactNode {
  const list = Array.isArray(features)
    ? features.filter((feature): feature is string => typeof feature === 'string' && feature.length > 0)
    : [];

  if (list.length === 0) {
    return <Text style={styles.metaText}>n/a</Text>;
  }

  return (
    <View style={styles.mapTileChipRow}>
      {list.map((feature) => (
        <View key={`${keyPrefix}-${feature}`} style={styles.mapTileFeatureChip}>
          <Text style={styles.mapTileFeatureChipText}>{feature}</Text>
        </View>
      ))}
    </View>
  );
}

function renderConnectorChips(connectors: unknown): React.ReactNode {
  if (!connectors || typeof connectors !== 'object' || Array.isArray(connectors)) {
    return <Text style={styles.metaText}>n/a</Text>;
  }

  const entries = Object.entries(connectors as Record<string, unknown>).filter(
    ([, value]) => typeof value === 'string' && value.length > 0
  );
  if (entries.length === 0) {
    return <Text style={styles.metaText}>n/a</Text>;
  }

  return (
    <View style={styles.mapTileChipRow}>
      {entries.map(([side, value]) => (
        <View key={`connector-${side}`} style={styles.mapTileConnectorChip}>
          <Text style={styles.mapTileConnectorSide}>{side}</Text>
          <Text style={styles.mapTileConnectorValue}>{String(value)}</Text>
        </View>
      ))}
    </View>
  );
}

function renderRouteGroups(routeGroups: unknown): React.ReactNode {
  if (!Array.isArray(routeGroups) || routeGroups.length === 0) {
    return <Text style={styles.metaText}>n/a</Text>;
  }

  return (
    <View style={styles.mapTileRouteList}>
      {routeGroups.map((group, index) => {
        const routeGroup =
          group && typeof group === 'object' && !Array.isArray(group)
            ? (group as Record<string, unknown>)
            : {};
        const kind = typeof routeGroup.kind === 'string' ? routeGroup.kind : `GROUP ${index + 1}`;
        const endpoints = Array.isArray(routeGroup.endpoints)
          ? routeGroup.endpoints.map(String)
          : [];

        return (
          <View key={`route-group-${index}`} style={styles.mapTileRouteItem}>
            <Text style={styles.mapTileRouteKind}>{kind}</Text>
            <Text style={styles.mapTileRouteEndpoints}>
              {endpoints.length > 0 ? endpoints.join(' -> ') : 'n/a'}
            </Text>
            {typeof routeGroup.note === 'string' && routeGroup.note.length > 0 ? (
              <Text style={styles.mapTileRouteNote}>{routeGroup.note}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function renderMapTile(
  mapTile: unknown,
  mapTileAsset: AdminMapTileAssetPayload | null | undefined
): React.ReactNode {
  if (!mapTile || typeof mapTile !== 'object') {
    return <Text style={styles.metaText}>n/a</Text>;
  }

  const tile = mapTile as Record<string, unknown>;
  const rawAssetImageUrl = mapTileAsset?.imageUrl ?? null;
  const assetImageUrl = rawAssetImageUrl?.startsWith('/api/')
    ? formatAdminApiUrl(rawAssetImageUrl)
    : formatAssetUrl(rawAssetImageUrl);
  const mask = mapTileAsset?.mask ?? null;
  const maskImageUrl = formatAdminApiUrl(mask?.imageUrl ?? null);
  const rawGenerationParams = mapTileAsset?.generationParams
    ? JSON.stringify(mapTileAsset.generationParams, null, 2)
    : null;

  return (
    <View style={styles.mapTilePanel}>
      <View style={styles.mapTileHeader}>
        <View style={styles.sceneVisualHeading}>
          <Ionicons name="map-outline" size={18} color={theme.colors.interactive.primary} />
          <Text style={styles.sceneVisualHeadingText}>MAP TILE</Text>
        </View>
        {mapTileAsset?.createdAt ? (
          <Text style={styles.mapTileGeneratedAt}>
            Current tile asset from {new Date(mapTileAsset.createdAt).toLocaleString()}
          </Text>
        ) : (
          <Text style={styles.mapTileGeneratedAt}>No generated tile asset yet</Text>
        )}
      </View>

      <View style={styles.mapTileHeroRow}>
        <View style={styles.mapTileMetadataColumn}>
          <View style={styles.mapTileField}>
            <Text style={styles.mapTileFieldLabel}>Director description</Text>
            <Text selectable style={styles.mapTileDescriptionText}>
              {typeof tile.description === 'string' && tile.description.trim()
                ? tile.description
                : 'n/a'}
            </Text>
          </View>

          <View style={styles.mapTileField}>
            <Text style={styles.mapTileFieldLabel}>Required features</Text>
            {renderFeatureChips(tile.requiredFeatures, 'mapTile-requiredFeatures')}
          </View>

          <View style={styles.mapTileTechGrid}>
            <View style={styles.mapTileTechCard}>
              <Text style={styles.mapTileFieldLabel}>Mask</Text>
              <Text selectable style={styles.mapTileTechTitle}>
                {mask?.id ?? 'n/a'}
              </Text>
              {mask?.label ? <Text style={styles.mapTileTechText}>{mask.label}</Text> : null}
              {mask?.topology ? <Text style={styles.mapTileTechText}>{mask.topology}</Text> : null}
            </View>

            <View style={styles.mapTileTechCard}>
              <Text style={styles.mapTileFieldLabel}>Mask features</Text>
              {renderFeatureChips(mask?.features, 'mapTile-maskFeatures')}
            </View>

            <View style={styles.mapTileTechCard}>
              <Text style={styles.mapTileFieldLabel}>Connectors</Text>
              {renderConnectorChips(mask?.connectors)}
            </View>

            <View style={styles.mapTileTechCard}>
              <Text style={styles.mapTileFieldLabel}>Asset</Text>
              <Text style={styles.mapTileTechText}>mime: {mapTileAsset?.mimeType ?? 'n/a'}</Text>
              <Text style={styles.mapTileTechText}>
                generation: {formatDurationMs(mapTileAsset?.generationTimeMs)}
              </Text>
              <Text style={styles.mapTileTechText}>
                size: {mapTileAsset?.fileSizeBytes ? `${mapTileAsset.fileSizeBytes} bytes` : 'n/a'}
              </Text>
            </View>
          </View>

          <View style={styles.mapTileField}>
            <Text style={styles.mapTileFieldLabel}>Route groups</Text>
            {renderRouteGroups(mask?.routeGroups)}
          </View>
        </View>

        <View style={styles.mapTilePreviewColumn}>
          <Text style={styles.mapTileFieldLabel}>Tile image</Text>
          <AuthenticatedAdminImagePreview
            url={assetImageUrl}
            style={styles.mapTilePreviewImage}
            resizeMode="cover"
            emptyLabel="No tile image"
            iconName="image-outline"
          />
          {mapTileAsset?.id ? (
            <Text selectable style={styles.mapTileAssetId}>
              asset: {mapTileAsset.id}
            </Text>
          ) : null}

          <Text style={styles.mapTileFieldLabel}>Mask image</Text>
          <AuthenticatedAdminImagePreview
            url={maskImageUrl}
            style={styles.mapTileMaskPreviewImage}
            resizeMode="contain"
            emptyLabel="No mask image"
            iconName="grid-outline"
          />
        </View>
      </View>

      <View style={styles.mapTileField}>
        <Text style={styles.mapTileFieldLabel}>Raw generation params</Text>
        <ScrollView style={styles.mapTileRawBox} nestedScrollEnabled>
          <Text selectable style={styles.audioPre}>
            {rawGenerationParams ?? 'n/a'}
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

type RegenerationJobEntry = {
  jobId: string;
};

function getSceneRegenerationJobKey(storyId: string, sceneId: number): string {
  return `${storyId}:scene:${sceneId}`;
}

function getGraphicPageRegenerationJobKey(storyId: string, pageNumber: number): string {
  return `${storyId}:graphic-page:${pageNumber}`;
}

function RegenerationJobStatus({
  jobId,
  onTerminal,
}: {
  jobId: string;
  onTerminal: () => void;
}) {
  const query = useAdminJobStatus(jobId);
  const notifiedTerminalRef = useRef(false);
  const status = query.data?.job.status;

  useEffect(() => {
    notifiedTerminalRef.current = false;
  }, [jobId]);

  useEffect(() => {
    if (!status || (status !== 'completed' && status !== 'failed')) {
      return;
    }
    if (notifiedTerminalRef.current) {
      return;
    }
    notifiedTerminalRef.current = true;
    onTerminal();
  }, [onTerminal, status]);

  if (query.isLoading) {
    return (
      <Text style={styles.regenerationStatus}>Checking job {shortJobId(jobId)}...</Text>
    );
  }

  if (query.error) {
    return (
      <Text style={[styles.regenerationStatus, styles.regenerationStatusError]}>
        Status unavailable · {shortJobId(jobId)}
      </Text>
    );
  }

  const job = query.data?.job;
  const queue = query.data?.queue;
  if (!job) {
    return null;
  }

  if (job.status === 'queued') {
    const wait = formatCompactDurationMs(queue?.estimatedWaitMs);
    return (
      <Text style={styles.regenerationStatus}>
        Queued{queue?.queuePosition ? ` #${queue.queuePosition}` : ''}
        {wait ? ` · ~${wait}` : ''} · {shortJobId(job.id)}
      </Text>
    );
  }

  if (job.status === 'processing') {
    return (
      <Text style={styles.regenerationStatus}>Processing · {shortJobId(job.id)}</Text>
    );
  }

  if (job.status === 'completed') {
    const took = formatCompactDurationMs(job.actualDurationMs);
    return (
      <Text style={[styles.regenerationStatus, styles.regenerationStatusSuccess]}>
        Completed{took ? ` · ${took}` : ''} · {shortJobId(job.id)}
      </Text>
    );
  }

  return (
    <Text style={[styles.regenerationStatus, styles.regenerationStatusError]}>
      Failed{job.error ? `: ${job.error}` : ''} · {shortJobId(job.id)}
    </Text>
  );
}

export default function AdminScenesScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const route = useRoute<any>();
  const routeStoryId = route.params?.storyId as string | undefined;
  const scenesQuery = useAdminDirectorScenes(routeStoryId);
  const regenerateMutation = useAdminRegenerateSceneImage();
  const regenerateGraphicNovelPageMutation = useAdminRegenerateGraphicNovelPageImage();
  const resetAudioMutation = useAdminResetStoryAudio();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const [regenerationJobs, setRegenerationJobs] = useState<Record<string, RegenerationJobEntry>>(
    {}
  );

  useEffect(() => {
    setSelectedEnvironmentId(null);
    setSelectedOutfitId(null);
    setRegenerationJobs({});
  }, [routeStoryId]);
  const storyScenes = useMemo(
    () => scenesQuery.data?.storyScenes ?? [],
    [scenesQuery.data?.storyScenes]
  );
  const directorScenes = useMemo(() => scenesQuery.data?.items ?? [], [scenesQuery.data?.items]);
  const storyMeta = scenesQuery.data?.story;
  const isGraphicPageStory =
    storyMeta?.storyFormat === 'graphic_novel' || storyMeta?.storyFormat === 'mixed_story';
  const directorSceneByIndex = useMemo(
    () => new Map(directorScenes.map((item) => [item.sceneIndex, item])),
    [directorScenes]
  );
  const scenes = useMemo(
    () =>
      storyScenes.map((scene) => {
        const directorScene = directorSceneByIndex.get(scene.sceneIndex);
        return {
          sceneIndex: scene.sceneIndex,
          storyText: scene.storyText,
          mixedStoryBlockKind: scene.mixedStoryBlockKind,
          mixedStoryScreenOrder: scene.mixedStoryScreenOrder,
          graphicNovelPageNumber: scene.graphicNovelPageNumber,
          imageTargetKind: scene.imageTargetKind,
          hasImage: scene.hasImage,
          imageUrl: scene.imageUrl,
          imageStoragePath: scene.imageStoragePath,
          directorScene,
        };
      }),
    [directorSceneByIndex, storyScenes]
  );
  const storyAudio = scenesQuery.data?.audio;
  const audioPlaybackUrl = formatAssetUrl(storyAudio?.audioUrl ?? null);
  const validations = useMemo(
    () => scenesQuery.data?.validations ?? [],
    [scenesQuery.data?.validations]
  );
  const validationsBySceneIndex = useMemo(() => {
    const map = new Map<number, typeof validations>();
    const currentImageStoragePathBySceneIndex = new Map(
      scenes.map((scene) => [scene.sceneIndex, scene.imageStoragePath ?? null])
    );
    for (const item of validations) {
      const currentImageStoragePath = currentImageStoragePathBySceneIndex.get(item.sceneIndex);
      if (!currentImageStoragePath || item.imageStoragePath !== currentImageStoragePath) {
        continue;
      }
      const list = map.get(item.sceneIndex) ?? [];
      list.push(item);
      map.set(item.sceneIndex, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          a.attempt - b.attempt ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }
    return map;
  }, [scenes, validations]);
  const cost = scenesQuery.data?.cost;
  const environments = useMemo(
    () => scenesQuery.data?.environments ?? [],
    [scenesQuery.data?.environments]
  );
  const outfits = useMemo(() => scenesQuery.data?.outfits ?? [], [scenesQuery.data?.outfits]);
  const renderRegenerateButton = (item: (typeof scenes)[number]) => {
    if (!routeStoryId) return null;

    const imageTargetKind =
      item.imageTargetKind ?? (isGraphicPageStory ? 'graphic_novel_page' : 'scene');
    if (imageTargetKind === 'none') {
      return <Text style={styles.metaText}>no image</Text>;
    }
    if (!item.hasImage) {
      return null;
    }

    if (imageTargetKind === 'graphic_novel_page') {
      const pageNumber = item.graphicNovelPageNumber ?? item.sceneIndex;
      const jobKey = getGraphicPageRegenerationJobKey(routeStoryId, pageNumber);
      const job = regenerationJobs[jobKey];
      const isPending =
        regenerateGraphicNovelPageMutation.isPending &&
        regenerateGraphicNovelPageMutation.variables?.storyId === routeStoryId &&
        regenerateGraphicNovelPageMutation.variables?.pageNumber === pageNumber;
      const mutationError =
        regenerateGraphicNovelPageMutation.error &&
        regenerateGraphicNovelPageMutation.variables?.storyId === routeStoryId &&
        regenerateGraphicNovelPageMutation.variables?.pageNumber === pageNumber
          ? regenerateGraphicNovelPageMutation.error
          : null;

      return (
        <View style={styles.regenerationActionGroup}>
          <TouchableOpacity
            style={styles.sceneActionButton}
            disabled={isPending}
            onPress={() => {
              regenerateGraphicNovelPageMutation.mutate(
                {
                  storyId: routeStoryId,
                  pageNumber,
                },
                {
                  onSuccess: (data) => {
                    setRegenerationJobs((current) => ({
                      ...current,
                      [jobKey]: { jobId: data.jobId },
                    }));
                  },
                }
              );
            }}
          >
            <Text style={styles.sceneActionButtonText}>
              {isPending ? 'Queueing...' : 'Regenerate page image'}
            </Text>
          </TouchableOpacity>
          {job ? (
            <RegenerationJobStatus
              jobId={job.jobId}
              onTerminal={() => {
                void scenesQuery.refetch();
              }}
            />
          ) : null}
          {mutationError ? (
            <Text style={[styles.regenerationStatus, styles.regenerationStatusError]}>
              Queue failed: {(mutationError as Error).message}
            </Text>
          ) : null}
        </View>
      );
    }

    const jobKey = getSceneRegenerationJobKey(routeStoryId, item.sceneIndex);
    const job = regenerationJobs[jobKey];
    const isPending =
      regenerateMutation.isPending &&
      regenerateMutation.variables?.storyId === routeStoryId &&
      regenerateMutation.variables?.sceneId === item.sceneIndex;
    const mutationError =
      regenerateMutation.error &&
      regenerateMutation.variables?.storyId === routeStoryId &&
      regenerateMutation.variables?.sceneId === item.sceneIndex
        ? regenerateMutation.error
        : null;

    return (
      <View style={styles.regenerationActionGroup}>
        <TouchableOpacity
          style={styles.sceneActionButton}
          disabled={isPending}
          onPress={() => {
            regenerateMutation.mutate(
              {
                storyId: routeStoryId,
                sceneId: item.sceneIndex,
              },
              {
                onSuccess: (data) => {
                  setRegenerationJobs((current) => ({
                    ...current,
                    [jobKey]: { jobId: data.jobId },
                  }));
                },
              }
            );
          }}
        >
          <Text style={styles.sceneActionButtonText}>
            {isPending ? 'Queueing...' : 'Regenerate image'}
          </Text>
        </TouchableOpacity>
        {job ? (
          <RegenerationJobStatus
            jobId={job.jobId}
            onTerminal={() => {
              void scenesQuery.refetch();
            }}
          />
        ) : null}
        {mutationError ? (
          <Text style={[styles.regenerationStatus, styles.regenerationStatusError]}>
            Queue failed: {(mutationError as Error).message}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <AdminLayout
      navigation={navigation}
      activeRoute="AdminStories"
      title="Admin / Story"
      panelStyle={styles.snapshotPanel}
    >
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Story article</Text>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => navigation.navigate('AdminStories')}
          >
            <Text style={styles.clearButtonText}>Back to stories</Text>
          </TouchableOpacity>
        </View>
        {storyMeta?.title ? <Text style={styles.storyTitle}>{storyMeta.title}</Text> : null}
        {routeStoryId ? <Text style={styles.selectedMeta}>{routeStoryId}</Text> : null}
        {!routeStoryId ? (
          <Text style={styles.helperText}>Open this page from the stories table.</Text>
        ) : null}
        {routeStoryId && !scenesQuery.isLoading && !scenesQuery.error && storyAudio ? (
          <View style={styles.audioSection} nativeID="admin-story-audio-section">
            <View style={styles.storyTextHeading}>
              <Ionicons
                name="volume-high-outline"
                size={16}
                color={theme.colors.interactive.primary}
              />
              <Text style={styles.sceneVisualHeadingText}>AUDIO (TTS)</Text>
            </View>
            {storyAudio.voiceName ? (
              <Text style={styles.audioMetaLine}>
                Voice: {storyAudio.voiceName}
                {storyAudio.durationSeconds != null && Number.isFinite(storyAudio.durationSeconds)
                  ? ` · ${Math.round(storyAudio.durationSeconds)}s`
                  : ''}
              </Text>
            ) : null}
            <Text style={styles.audioBlockLabel}>Generation timing</Text>
            <View style={styles.audioTimingBlock}>
              <Text style={styles.audioMetaLine}>
                Total pipeline (job wall):{' '}
                {formatDurationMs(storyAudio.timing?.audioGenerationTimeMs)}
              </Text>
              <Text style={styles.audioMetaLine}>
                Prosody / audio tags (LLM):{' '}
                {formatDurationMs(storyAudio.timing?.prosodyTaggingTimeMs)}
              </Text>
              <Text style={styles.audioMetaLine}>
                TTS (wall, full chunk loop):{' '}
                {formatDurationMs(storyAudio.timing?.ttsBatchWallTimeMs)}
              </Text>
              <Text style={styles.audioMetaLine}>
                TTS (wall, sum of parallel batches):{' '}
                {formatDurationMs(storyAudio.timing?.ttsSynthesisBatchesWallMs)}
              </Text>
              <Text style={styles.audioMetaLine}>
                TTS (parallel lower bound, sum of slowest chunk per batch):{' '}
                {formatDurationMs(storyAudio.timing?.ttsChunksParallelEstimateMs)}
              </Text>
              <Text style={styles.audioMetaLine}>
                TTS (serial sum of chunk synthesize, not user wait):{' '}
                {formatDurationMs(storyAudio.timing?.ttsChunksSynthesisTimeMs)}
              </Text>
            </View>
            {storyAudio.chunks && storyAudio.chunks.length > 0 ? (
              <>
                <Text style={styles.audioBlockLabel}>Per-chunk TTS (synthesize wall)</Text>
                <ScrollView style={styles.audioScrollBox} nestedScrollEnabled>
                  {storyAudio.chunks.map((c) => (
                    <Text
                      key={`chunk-${c.groupIndex}-${c.assetId ?? 'x'}`}
                      selectable
                      style={styles.audioPre}
                    >
                      chunk {c.groupIndex}
                      {c.assetId ? ` · ${c.assetId.slice(0, 8)}…` : ''}:{' '}
                      {formatDurationMs(c.generationTimeMs)}
                    </Text>
                  ))}
                </ScrollView>
              </>
            ) : null}
            <Text style={styles.audioBlockLabel}>Vendor style prompt (English)</Text>
            <ScrollView style={styles.audioScrollBox} nestedScrollEnabled>
              <Text selectable style={styles.audioPre}>
                {storyAudio.vendorStylePromptEn?.trim() ? storyAudio.vendorStylePromptEn : '—'}
              </Text>
            </ScrollView>
            <Text style={styles.audioBlockLabel}>Synthesis text (with audio tags)</Text>
            {storyAudio.synthesisProsodyHint ? (
              <Text style={styles.audioProsodyWarning}>{storyAudio.synthesisProsodyHint}</Text>
            ) : null}
            {storyAudio.synthesisTaggedSegments && storyAudio.synthesisTaggedSegments.length > 0 ? (
              <Text style={styles.audioBlockHint}>
                Pink background: narration slice not yet synthesized (no completed TTS chunk for
                that slot).
              </Text>
            ) : null}
            <ScrollView style={styles.audioScrollBoxLarge} nestedScrollEnabled>
              {storyAudio.synthesisTaggedSegments &&
              storyAudio.synthesisTaggedSegments.length > 0 ? (
                <Text selectable style={styles.audioPre}>
                  {storyAudio.synthesisTaggedSegments.map((seg, idx) => (
                    <Text
                      key={`synth-seg-${idx}`}
                      selectable
                      style={seg.isMissingChunk ? styles.audioPreMissingChunk : undefined}
                    >
                      {seg.text}
                    </Text>
                  ))}
                </Text>
              ) : (
                <Text selectable style={styles.audioPre}>
                  {storyAudio.synthesisTaggedText?.trim() ? storyAudio.synthesisTaggedText : '—'}
                </Text>
              )}
            </ScrollView>
            <Text style={styles.audioBlockLabel}>Playback</Text>
            {audioPlaybackUrl ? (
              Platform.OS === 'web' ? (
                createElement('audio', {
                  controls: true,
                  src: audioPlaybackUrl,
                  style: { width: '100%', maxWidth: 560, height: 44, marginTop: 4 },
                })
              ) : (
                <Text selectable style={styles.audioMetaLine}>
                  {audioPlaybackUrl}
                </Text>
              )
            ) : (
              <Text style={styles.helperText}>
                No final audio asset — generate audio for this story first.
              </Text>
            )}
            <Text style={styles.audioBlockLabel}>Admin — audio reset</Text>
            <Text style={styles.helperText}>
              Clear removes alignment, audio_assets, audio files, and story audio metadata.
              Regenerate does that then queues a new full TTS job (all chunks from scratch).
            </Text>
            <View style={styles.audioAdminActions}>
              <TouchableOpacity
                style={styles.audioDangerButton}
                disabled={resetAudioMutation.isPending || !routeStoryId}
                onPress={async () => {
                  if (!routeStoryId) return;
                  const ok = await confirmAdminAudioAction(
                    'Remove all audio data for this story from the database and storage?'
                  );
                  if (!ok) return;
                  resetAudioMutation.mutate({ storyId: routeStoryId, regenerate: false });
                }}
              >
                <Text style={styles.audioDangerButtonText}>
                  {resetAudioMutation.isPending ? 'Working…' : 'Clear audio'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.audioDangerButton}
                disabled={resetAudioMutation.isPending || !routeStoryId}
                onPress={async () => {
                  if (!routeStoryId) return;
                  const ok = await confirmAdminAudioAction(
                    'Clear all audio and queue a full regeneration (new chunks, new mix)?'
                  );
                  if (!ok) return;
                  resetAudioMutation.mutate({ storyId: routeStoryId, regenerate: true });
                }}
              >
                <Text style={styles.audioDangerButtonText}>
                  {resetAudioMutation.isPending ? 'Working…' : 'Regenerate from scratch'}
                </Text>
              </TouchableOpacity>
            </View>
            {resetAudioMutation.isSuccess && resetAudioMutation.data?.jobId ? (
              <Text style={styles.audioMetaLine}>Queued job: {resetAudioMutation.data.jobId}</Text>
            ) : null}
            {resetAudioMutation.error ? (
              <Text style={styles.audioErrorText}>
                {(resetAudioMutation.error as Error).message}
              </Text>
            ) : null}
          </View>
        ) : null}
        {scenesQuery.isLoading ? <AdminLoadingState /> : null}
        {scenesQuery.error ? (
          <AdminErrorState message={(scenesQuery.error as Error).message} />
        ) : null}
        {routeStoryId &&
        !scenesQuery.isLoading &&
        !scenesQuery.error &&
        storyAudio &&
        scenes.length > 0 ? (
          <Text style={styles.helperText}>
            Per-scene «STORY TEXT» is the writer manuscript (prose). Inline `[…]` TTS prosody
            markup, when the pipeline stores it, appears only above under AUDIO → «Synthesis text».
          </Text>
        ) : null}
        {routeStoryId && !scenesQuery.isLoading && !scenesQuery.error ? (
          <View style={styles.sceneCard}>
            {renderMapTile(storyMeta?.mapTile, storyMeta?.mapTileAsset)}
          </View>
        ) : null}
        {routeStoryId && !scenesQuery.isLoading && !scenesQuery.error ? (
          scenes.length > 0 ? (
            <View style={styles.cardGrid}>
              {scenes.map((item) => (
                <View key={item.sceneIndex} style={styles.sceneCard}>
                  <View style={styles.sceneCardHeader}>
                    <Text style={styles.sceneCardTitle}>
                      SCENE {item.sceneIndex}
                      {item.graphicNovelPageNumber
                        ? ` · PAGE ${item.graphicNovelPageNumber}`
                        : ''}
                    </Text>
                    <View style={styles.sceneCardHeaderActions}>
                      {item.directorScene?.environmentId ? (
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedEnvironmentId(item.directorScene?.environmentId ?? null);
                            scrollToAnchor('admin-environments-section');
                          }}
                        >
                          <Text
                            style={
                              item.directorScene.environmentId === selectedEnvironmentId
                                ? styles.linkTextActive
                                : styles.linkText
                            }
                          >
                            {item.directorScene.environmentId}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.metaText}>n/a</Text>
                      )}
                      {renderRegenerateButton(item)}
                    </View>
                  </View>

                  <View style={styles.sceneSection}>
                    <View style={styles.storyTextBlock}>
                      <View style={styles.storyTextHeading}>
                        <Ionicons
                          name="book-outline"
                          size={16}
                          color={theme.colors.interactive.primary}
                        />
                        <Text style={styles.sceneVisualHeadingText}>STORY TEXT</Text>
                      </View>
                      <Text style={styles.storyTextBody}>{item.storyText || 'n/a'}</Text>
                    </View>

                    {item.directorScene ? (
                      <>
                        <View style={styles.sceneDivider} />

                        {renderSceneVisual(item.directorScene.sceneVisual, {
                          selectedOutfitId,
                          onOutfitPress: (outfitId) => {
                            setSelectedOutfitId(outfitId);
                            scrollToAnchor('admin-outfits-section');
                          },
                        })}

                        <View style={styles.sceneDivider} />
                      </>
                    ) : null}

                    <View style={styles.validationBlock}>
                      <View style={styles.storyTextHeading}>
                        <Ionicons
                          name="shield-checkmark-outline"
                          size={16}
                          color={theme.colors.interactive.primary}
                        />
                        <Text style={styles.sceneVisualHeadingText}>VALIDATIONS</Text>
                      </View>
                      {(validationsBySceneIndex.get(item.sceneIndex) ?? []).length > 0 ? (
                        <View style={styles.validationList}>
                          {(validationsBySceneIndex.get(item.sceneIndex) ?? []).map(
                            (validation) => (
                              <TouchableOpacity
                                key={validation.id}
                                style={styles.validationCard}
                                onPress={() =>
                                  navigation.navigate('AdminValidationDetail', {
                                    id: validation.id,
                                  })
                                }
                              >
                                <View style={styles.validationCardHeader}>
                                  <Text style={styles.validationCardTitle}>
                                    Attempt {validation.attempt}
                                    {validation.graphicNovelPageNumber
                                      ? ` · Page ${validation.graphicNovelPageNumber}`
                                      : ''}
                                  </Text>
                                  <Text style={styles.validationScore}>
                                    {formatValidationScore(
                                      validation.validationScore,
                                      validation.validationStatus
                                    )}
                                  </Text>
                                </View>
                                <View style={styles.validationMetaRow}>
                                  <Text style={styles.validationMetaText}>
                                    {validation.validationStatus}
                                  </Text>
                                  <Text style={styles.validationMetaText}>
                                    Validator: {validation.visionModel ?? 'n/a'}
                                  </Text>
                                  <Text style={styles.validationMetaText}>
                                    {new Date(validation.createdAt).toLocaleString()}
                                  </Text>
                                </View>
                                <Text style={styles.validationLink}>Open validation</Text>
                              </TouchableOpacity>
                            )
                          )}
                        </View>
                      ) : (
                        <Text style={styles.helperText}>No validations found for this scene.</Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.helperText}>No scenes found for this story.</Text>
          )
        ) : null}
      </View>
      {routeStoryId && !scenesQuery.isLoading && !scenesQuery.error ? (
        <>
          <View style={styles.section} nativeID="admin-environments-section">
            <Text style={styles.sectionTitle}>Environments</Text>
            {environments.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.referenceRow}
              >
                {environments.map((environment) => (
                  <View
                    key={environment.id}
                    style={[
                      styles.referenceCard,
                      styles.environmentCard,
                      environment.id === selectedEnvironmentId && styles.referenceCardActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.referenceCardId,
                        environment.id === selectedEnvironmentId && styles.referenceCardIdActive,
                      ]}
                    >
                      {environment.id}
                    </Text>
                    {environment.imageUrl ? (
                      <Image
                        source={{
                          uri: formatAssetUrl(environment.imageUrl) ?? environment.imageUrl,
                        }}
                        style={styles.environmentImage}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text style={styles.referenceCardTitle}>{environment.name ?? 'n/a'}</Text>
                    <Text style={styles.referenceCardBody}>{environment.description ?? 'n/a'}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.helperText}>No environments found for this story.</Text>
            )}
          </View>
          <View style={styles.section} nativeID="admin-outfits-section">
            <Text style={styles.sectionTitle}>Outfits</Text>
            {outfits.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.referenceRow}
              >
                {outfits.map((outfit) => (
                  <View
                    key={outfit.id}
                    style={[
                      styles.referenceCard,
                      styles.outfitCard,
                      outfit.id === selectedOutfitId && styles.referenceCardActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.referenceCardId,
                        outfit.id === selectedOutfitId && styles.referenceCardIdActive,
                      ]}
                    >
                      {outfit.id}
                    </Text>
                    {outfit.imageUrl ? (
                      <Image
                        source={{ uri: formatAssetUrl(outfit.imageUrl) ?? outfit.imageUrl }}
                        style={styles.outfitImage}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text style={styles.referenceCardTitle}>{outfit.characterName ?? 'n/a'}</Text>
                    <Text style={styles.referenceCardBody}>{outfit.description ?? 'n/a'}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.helperText}>No outfits found for this story.</Text>
            )}
          </View>
        </>
      ) : null}
      {routeStoryId && !scenesQuery.isLoading && !scenesQuery.error ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cost breakdown</Text>
          {cost ? (
            <View style={styles.costCard}>
              <View style={styles.costTotalRow}>
                <Text style={styles.costTotalLabel}>TOTAL COST</Text>
                <Text style={styles.costTotalValue}>${cost.costUsd.toFixed(6)}</Text>
              </View>
              <Text style={styles.helperText}>
                Cache hits: {cost.cacheStats.cacheHitCount} calls, cached input:{' '}
                {cost.cacheStats.totalCachedInputUnits.toLocaleString()} tokens
              </Text>
              {cost.breakdown.length > 0 ? (
                <View style={styles.costBreakdownList}>
                  {cost.breakdown.map((item, index) => (
                    <View
                      key={`${item.provider}-${item.operation}-${item.model ?? 'na'}-${index}`}
                      style={styles.costBreakdownRow}
                    >
                      <View style={styles.costBreakdownMain}>
                        <Text style={styles.costBreakdownOperation}>{item.operation}</Text>
                        <Text style={styles.costBreakdownMeta}>
                          {item.provider}
                          {item.model ? ` / ${item.model}` : ''}
                        </Text>
                        <Text style={styles.costBreakdownMeta}>
                          {new Date(item.createdAt).toLocaleString()}
                        </Text>
                      </View>
                      <Text style={styles.costBreakdownValue}>${item.costUsd.toFixed(6)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.helperText}>No AI cost records found for this story.</Text>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  helperText: {
    fontSize: 15,
    color: theme.colors.text.secondary,
  },
  selectedMeta: {
    fontSize: 15,
    color: theme.colors.text.secondary,
  },
  storyTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  snapshotPanel: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    gap: 28,
  },
  clearButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.secondary,
  },
  clearButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  cardGrid: {
    gap: 20,
  },
  sceneCard: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 20,
    padding: 24,
    backgroundColor: theme.colors.background.primary,
    gap: 20,
  },
  sceneCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  sceneCardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  regenerationActionGroup: {
    alignItems: 'flex-end',
    gap: 6,
  },
  sceneActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.primary,
  },
  sceneActionButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '700',
    fontSize: 13,
  },
  regenerationStatus: {
    maxWidth: 260,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.primary[50],
    color: theme.colors.interactive.primary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  regenerationStatusSuccess: {
    backgroundColor: theme.colors.status.success + '20',
    color: theme.colors.status.success,
  },
  regenerationStatusError: {
    backgroundColor: theme.colors.status.error + '20',
    color: theme.colors.status.error,
  },
  sceneCardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  sceneSection: {
    gap: 16,
  },
  storyTextBlock: {
    gap: 12,
  },
  storyTextHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  validationBlock: {
    gap: 12,
  },
  validationList: {
    gap: 12,
  },
  validationCard: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 16,
    padding: 16,
    backgroundColor: theme.colors.background.secondary,
    gap: 8,
  },
  validationCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  validationCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  validationScore: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.interactive.primary,
  },
  validationMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  validationMetaText: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  validationLink: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.interactive.primary,
    textDecorationLine: 'underline',
  },
  storyTextBody: {
    fontSize: 16,
    lineHeight: 26,
    color: theme.colors.text.primary,
  },
  linkText: {
    fontSize: 14,
    color: theme.colors.interactive.primary,
    textDecorationLine: 'underline',
  },
  linkTextActive: {
    fontSize: 14,
    color: theme.colors.interactive.primary,
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  metaText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  referenceCard: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 18,
    padding: 18,
    backgroundColor: theme.colors.background.secondary,
    gap: 12,
  },
  referenceRow: {
    gap: 12,
    paddingRight: 8,
  },
  environmentCard: {
    width: 360,
    flexShrink: 0,
  },
  outfitCard: {
    width: 300,
    flexShrink: 0,
  },
  referenceCardActive: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  referenceCardId: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.interactive.primary,
  },
  referenceCardIdActive: {
    color: theme.colors.interactive.primaryActive,
  },
  referenceCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  referenceCardBody: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.text.secondary,
  },
  environmentImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: theme.colors.background.primary,
  },
  outfitImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: theme.colors.background.primary,
  },
  characterCardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  characterCard: {
    minWidth: 260,
    maxWidth: 360,
    flexGrow: 1,
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    gap: 10,
  },
  characterCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.interactive.primary,
    letterSpacing: 0.4,
  },
  characterCardTitleWrap: {
    gap: 4,
  },
  characterCardId: {
    fontSize: 11,
    lineHeight: 15,
    color: theme.colors.text.secondary,
    fontWeight: '600',
  },
  sceneVisualSections: {
    gap: 18,
  },
  sceneVisualTopRow: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  sceneVisualBlock: {
    gap: 12,
  },
  sceneVisualColumn: {
    flex: 1,
    minWidth: 260,
  },
  sceneVisualHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sceneVisualHeadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0.4,
  },
  sceneDivider: {
    height: 1,
    backgroundColor: theme.colors.border.light,
  },
  valueGroup: {
    gap: 12,
  },
  valueRow: {
    gap: 6,
  },
  valueKey: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0.4,
  },
  valueText: {
    fontSize: 15,
    color: theme.colors.text.primary,
    lineHeight: 23,
  },
  mapTilePanel: {
    gap: 18,
  },
  mapTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  mapTileGeneratedAt: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  mapTileHeroRow: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  mapTileMetadataColumn: {
    flex: 1,
    minWidth: 360,
    gap: 16,
  },
  mapTilePreviewColumn: {
    width: 280,
    flexShrink: 0,
    gap: 10,
  },
  mapTilePreviewImage: {
    width: 280,
    height: 280,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  mapTileMaskPreviewImage: {
    width: 280,
    height: 280,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  mapTilePreviewEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mapTileAssetId: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.text.secondary,
  },
  mapTileField: {
    gap: 8,
  },
  mapTileFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    textTransform: 'uppercase',
  },
  mapTileDescriptionText: {
    fontSize: 16,
    lineHeight: 25,
    color: theme.colors.text.primary,
  },
  mapTileChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mapTileFeatureChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.primary[50],
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  mapTileFeatureChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.interactive.primary,
  },
  mapTileConnectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
  },
  mapTileConnectorSide: {
    minWidth: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.text.inverse,
    backgroundColor: theme.colors.interactive.primary,
  },
  mapTileConnectorValue: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  mapTileTechGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  mapTileTechCard: {
    minWidth: 220,
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    gap: 8,
  },
  mapTileTechTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  mapTileTechText: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.colors.text.secondary,
  },
  mapTileRouteList: {
    gap: 8,
  },
  mapTileRouteItem: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    gap: 4,
  },
  mapTileRouteKind: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.interactive.primary,
  },
  mapTileRouteEndpoints: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  mapTileRouteNote: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.text.secondary,
  },
  mapTileRawBox: {
    maxHeight: 260,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    padding: 10,
  },
  costCard: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 18,
    padding: 20,
    backgroundColor: theme.colors.background.primary,
    gap: 14,
  },
  costTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  costTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0.4,
  },
  costTotalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  costBreakdownList: {
    gap: 12,
  },
  costBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
  },
  costBreakdownMain: {
    flex: 1,
    gap: 4,
  },
  costBreakdownOperation: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  costBreakdownMeta: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  costBreakdownValue: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  audioSection: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    gap: 10,
  },
  audioBlockLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  audioMetaLine: {
    fontSize: 13,
    color: theme.colors.text.primary,
    lineHeight: 20,
  },
  audioTimingBlock: {
    gap: 2,
    marginBottom: 4,
  },
  audioAdminActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  audioDangerButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
  },
  audioDangerButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  audioErrorText: {
    fontSize: 13,
    color: theme.colors.status.error,
    marginTop: 4,
  },
  audioScrollBox: {
    maxHeight: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
    padding: 10,
  },
  audioScrollBoxLarge: {
    /** Native: cap height so the screen stays usable; web: grow with text (page scroll). */
    ...Platform.select({
      default: { maxHeight: 1200 },
      web: {},
    }),
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
    padding: 10,
  },
  audioPre: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.colors.text.primary,
    fontFamily: Platform.select({
      web: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      default: undefined,
    }),
  },
  audioPreMissingChunk: {
    backgroundColor: '#fce4ec',
  },
  audioBlockHint: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginBottom: 6,
    lineHeight: 18,
  },
  audioProsodyWarning: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.status.warning,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
});
