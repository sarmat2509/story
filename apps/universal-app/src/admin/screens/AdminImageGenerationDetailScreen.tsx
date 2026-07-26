import React, { useEffect, useState } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useAdminDirectorScenes } from '@/admin/api/admin';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import {
  buildAdminImageGenerationAttempts,
  type AdminImageGenerationAttempt,
} from '@/admin/utils/imageGenerationAttempts';
import { API_BASE_URL } from '@/config/constants';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';
import { formatAssetUrl } from '@/utils/assetUrl';
import { authenticatedFetch } from '@/utils/authenticatedFetch';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && !Array.isArray(item)
      )
    : [];
}

function compactValue(value: unknown): string {
  if (value == null || value === '') return 'n/a';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatAdminImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/')) {
    return Platform.OS === 'web' ? url : `${API_BASE_URL.replace(/\/$/, '')}${url}`;
  }
  return formatAssetUrl(url) ?? url;
}

function jsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

function previewableReferencePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'n/a') return null;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null;
  return trimmed;
}

function referencePreviewUrl(row: Record<string, unknown>): string | null {
  const rawPath =
    previewableReferencePath(row.thumbnailPath) ??
    previewableReferencePath(row.storagePath) ??
    previewableReferencePath(row.url);

  return rawPath ? formatAdminImageUrl(formatAssetUrl(rawPath) ?? rawPath) : null;
}

function referenceDisplayPath(row: Record<string, unknown>): string {
  return compactValue(row.storagePath ?? row.url ?? row.fileUri);
}

function referenceLabel(row: Record<string, unknown>, index: number): string {
  return [
    `Image ${compactValue(row.index ?? index + 1)}`,
    compactValue(row.referenceKind ?? row.type ?? row.source),
    compactValue(row.characterName ?? row.environmentId ?? row.name),
  ]
    .filter((part) => part !== 'n/a')
    .join(' · ');
}

function referenceTransport(row: Record<string, unknown>): string {
  if (row.fileUri) return 'fileUri';
  if (row.hasBase64Data) {
    return `base64${row.base64Bytes ? ` · ${row.base64Bytes} bytes` : ''}`;
  }
  return referencePreviewUrl(row) ? 'stored asset' : 'n/a';
}

function hasReferenceText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== 'n/a';
}

function hasPositiveReferenceBytes(value: unknown): boolean {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue > 0;
}

function isDisplayableReference(row: Record<string, unknown>): boolean {
  return (
    referencePreviewUrl(row) != null ||
    previewableReferencePath(row.fileUri) != null ||
    row.hasBase64Data === true ||
    hasPositiveReferenceBytes(row.base64Bytes) ||
    hasReferenceText(row.instructionText)
  );
}

function referenceDedupKey(row: Record<string, unknown>, fallbackIndex: number): string {
  return [
    row.storagePath,
    row.url,
    row.fileUri,
    row.thumbnailPath,
    row.referenceKind,
    row.source,
    row.type,
    row.characterName,
    row.environmentId,
    row.name,
    row.index ?? fallbackIndex,
  ]
    .map((value) => (value == null ? '' : String(value)))
    .join('|');
}

function collectAttemptReferences(attempt: AdminImageGenerationAttempt): Record<string, unknown>[] {
  const unique = new Map<string, Record<string, unknown>>();
  const addReferences = (references: unknown) => {
    for (const reference of arrayOfRecords(references)) {
      if (!isDisplayableReference(reference)) continue;
      unique.set(referenceDedupKey(reference, unique.size), reference);
    }
  };

  addReferences(attempt.rawManifest.references);

  return Array.from(unique.values());
}

function AuthenticatedAdminImagePreview({
  url,
  style,
  resizeMode = 'cover',
  preserveAspectRatio = false,
}: {
  url: string | null;
  style: any;
  resizeMode?: 'cover' | 'contain';
  preserveAspectRatio?: boolean;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    setResolvedUrl(null);
    setNaturalAspectRatio(null);
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
        const response = await authenticatedFetch(url, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setResolvedUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    setNaturalAspectRatio(null);
    if (!resolvedUrl || failed || !preserveAspectRatio) {
      return () => {
        cancelled = true;
      };
    }

    Image.getSize(
      resolvedUrl,
      (width, height) => {
        if (!cancelled && width > 0 && height > 0) {
          setNaturalAspectRatio(width / height);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [failed, preserveAspectRatio, resolvedUrl]);

  if (resolvedUrl && !failed) {
    return (
      <Image
        source={{ uri: resolvedUrl }}
        style={
          preserveAspectRatio && naturalAspectRatio
            ? [style, { aspectRatio: naturalAspectRatio }]
            : style
        }
        resizeMode={resizeMode}
      />
    );
  }

  return (
    <View style={[style, styles.emptyImage]}>
      <Ionicons name="image-outline" size={24} color={theme.colors.text.secondary} />
      <Text style={styles.emptyImageText}>{failed ? 'Image failed' : 'No image'}</Text>
    </View>
  );
}

function SummaryPill({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.summaryPill}>
      <Text style={styles.summaryPillLabel}>{label}</Text>
      <Text selectable style={styles.summaryPillValue}>
        {compactValue(value)}
      </Text>
    </View>
  );
}

function ReferenceList({ references }: { references: Record<string, unknown>[] }) {
  const [activeReferenceKey, setActiveReferenceKey] = useState<string | null>(null);

  if (references.length === 0) {
    return <Text style={styles.helperText}>No references recorded.</Text>;
  }

  return (
    <View style={styles.referenceList}>
      {references.map((reference, index) => {
        const rowKey = referenceDedupKey(reference, index);
        const previewUrl = referencePreviewUrl(reference);
        const isActive = activeReferenceKey === rowKey;

        return (
          <View
            key={rowKey}
            style={[styles.referenceAnchor, isActive ? styles.referenceAnchorActive : null]}
          >
            <TouchableOpacity
              style={[
                styles.referenceRow,
                previewUrl && isActive ? styles.referenceRowActive : null,
              ]}
              disabled={!previewUrl}
              onPress={() => {
                if (!previewUrl) return;
                setActiveReferenceKey(isActive ? null : rowKey);
              }}
            >
              <Text style={styles.referenceTitle}>{referenceLabel(reference, index)}</Text>
              <Text selectable style={styles.referenceMeta}>
                {compactValue(reference.source)}/{compactValue(reference.type)} ·{' '}
                {referenceTransport(reference)}
              </Text>
              <Text selectable style={styles.referencePath}>
                {referenceDisplayPath(reference)}
              </Text>
              {reference.instructionText ? (
                <Text selectable style={styles.referenceInstruction}>
                  {String(reference.instructionText)}
                </Text>
              ) : null}
            </TouchableOpacity>
            {previewUrl && isActive ? (
              <View style={styles.referencePreviewTooltip}>
                <AuthenticatedAdminImagePreview
                  url={previewUrl}
                  style={styles.referencePreviewImage}
                  resizeMode="contain"
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function validationScoreLabel(attempt: AdminImageGenerationAttempt): string {
  const validation = attempt.validation;
  if (!validation) return attempt.validationMissingReason ?? 'n/a';
  if (validation.validationScore != null) return `${validation.validationScore}/100`;
  if (validation.validationStatus === 'provider_blocked') return 'blocked';
  return 'n/a';
}

function validationCostLabel(attempt: AdminImageGenerationAttempt): string {
  const costUsd = attempt.validation?.usage?.costUsd;
  if (costUsd == null || !Number.isFinite(costUsd)) return 'n/a';
  const eventCount = attempt.validation?.usage?.eventCount;
  return `$${costUsd.toFixed(6)}${eventCount ? ` (${eventCount} events)` : ''}`;
}

export default function AdminImageGenerationDetailScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const route = useRoute<RouteProp<AdminStackParamList, 'AdminImageGenerationDetail'>>();
  const { storyId } = route.params;
  const sceneIndex = Number(route.params.sceneIndex);
  const generationIndex = Number(route.params.generationIndex);
  const query = useAdminDirectorScenes(storyId);

  const storyScene = query.data?.storyScenes.find((scene) => scene.sceneIndex === sceneIndex);
  const validations =
    query.data?.validations.filter((validation) => validation.sceneIndex === sceneIndex) ?? [];
  const attempts = storyScene
    ? buildAdminImageGenerationAttempts({
        sceneIndex,
        manifest: storyScene.imageRequestManifest,
        validations,
        fallbackImageUrl: storyScene.imageUrl,
        fallbackImageStoragePath: storyScene.imageStoragePath,
      })
    : [];
  const attempt = attempts.find((item) => item.generationIndex === generationIndex) ?? null;
  const rawGenerationManifestRecord = asRecord(attempt?.modelRawManifest);
  const primaryRequest = attempt?.requests[0] ?? null;
  const references = attempt ? collectAttemptReferences(attempt) : [];
  const rawManifestTitle =
    attempt?.kind === 'edit'
      ? 'Raw Edit Manifest'
      : attempt?.kind === 'generate'
        ? 'Raw Generation Manifest'
        : 'Raw Image Manifest';
  const recordLabel =
    attempt?.panelIndex != null
      ? `${storyId} · page ${
          attempt.pageNumber ?? storyScene?.graphicNovelPageNumber ?? sceneIndex
        } · panel ${attempt.panelIndex} · generation ${generationIndex}`
      : `${storyId} · scene ${sceneIndex} · generation ${generationIndex}`;

  return (
    <AdminLayout
      navigation={navigation}
      activeRoute="AdminStories"
      title="Admin / Image Generation"
    >
      <View style={styles.headerRow}>
        <Text style={styles.recordId}>{recordLabel}</Text>
        <View style={styles.headerActions}>
          {attempt?.validation ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                navigation.navigate('AdminValidationDetail', { id: attempt.validation!.id })
              }
            >
              <Text style={styles.secondaryButtonText}>Open validation</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('AdminScenesStory', { storyId })}
          >
            <Text style={styles.backButtonText}>Back to story scenes</Text>
          </TouchableOpacity>
        </View>
      </View>

      {query.isLoading ? <AdminLoadingState /> : null}
      {query.error ? <AdminErrorState message={(query.error as Error).message} /> : null}
      {!query.isLoading && !query.error && !attempt ? (
        <AdminErrorState message="Image generation attempt not found" />
      ) : null}

      {attempt ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroPanel}>
            <AuthenticatedAdminImagePreview
              url={formatAdminImageUrl(attempt.imageUrl)}
              style={styles.previewImage}
              resizeMode="contain"
              preserveAspectRatio
            />
            <View style={styles.heroDetails}>
              <Text style={styles.heroTitle}>{attempt.label}</Text>
              <View style={styles.summaryGrid}>
                <SummaryPill label="Kind" value={attempt.kind} />
                {attempt.pageNumber != null ? (
                  <SummaryPill label="Page" value={attempt.pageNumber} />
                ) : null}
                {attempt.panelIndex != null ? (
                  <SummaryPill label="Panel" value={attempt.panelIndex} />
                ) : null}
                {attempt.panelId ? <SummaryPill label="Panel ID" value={attempt.panelId} /> : null}
                <SummaryPill label="Operation" value={attempt.summary.operation} />
                <SummaryPill label="Mode" value={attempt.summary.mode} />
                <SummaryPill label="Model" value={attempt.summary.model} />
                <SummaryPill
                  label="Aspect"
                  value={primaryRequest?.aspectRatio ?? attempt.rawManifest.aspectRatio}
                />
                <SummaryPill label="Prompt chars" value={attempt.summary.promptChars} />
                <SummaryPill label="Refs" value={attempt.summary.referenceCount} />
                <SummaryPill label="Requests" value={attempt.summary.requestCount} />
                <SummaryPill label="Validation score" value={validationScoreLabel(attempt)} />
                <SummaryPill label="Validation cost" value={validationCostLabel(attempt)} />
                {attempt.cropRect ? <SummaryPill label="Crop" value={attempt.cropRect} /> : null}
                <SummaryPill label="Image path" value={attempt.imageStoragePath} />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>References</Text>
            <ReferenceList references={references} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{rawManifestTitle}</Text>
            <ScrollView style={styles.rawBox} nestedScrollEnabled>
              <Text selectable style={styles.rawText}>
                {jsonPreview(rawGenerationManifestRecord ?? attempt.rawManifest)}
              </Text>
            </ScrollView>
          </View>

        </ScrollView>
      ) : null}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  recordId: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  backButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.secondary,
  },
  backButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  secondaryButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    gap: 16,
  },
  heroPanel: {
    flexDirection: 'row',
    gap: 18,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 12,
    padding: 16,
    backgroundColor: theme.colors.background.primary,
  },
  previewImage: {
    width: 420,
    maxWidth: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    backgroundColor: theme.colors.background.secondary,
  },
  emptyImage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyImageText: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    fontWeight: '700',
  },
  heroDetails: {
    flex: 1,
    minWidth: 320,
    gap: 12,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: theme.colors.text.primary,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  summaryPill: {
    minWidth: 150,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: theme.colors.background.secondary,
    gap: 3,
  },
  summaryPillLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.text.secondary,
    textTransform: 'uppercase',
  },
  summaryPillValue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text.primary,
  },
  referenceList: {
    gap: 8,
  },
  referenceAnchor: {
    position: 'relative',
  },
  referenceAnchorActive: {
    zIndex: 20,
  },
  referenceRow: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.interactive.primary,
    paddingLeft: 10,
    paddingVertical: 6,
    paddingRight: 10,
    borderRadius: 8,
    gap: 3,
  },
  referenceRowActive: {
    backgroundColor: theme.colors.interactive.secondary + '66',
  },
  referenceTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text.primary,
  },
  referenceMeta: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  referencePath: {
    fontSize: 12,
    color: theme.colors.interactive.primary,
  },
  referenceInstruction: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.text.secondary,
  },
  referencePreviewTooltip: {
    position: 'absolute',
    bottom: '100%',
    left: 10,
    width: 400,
    maxWidth: '90%',
    marginBottom: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.primary,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  referencePreviewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: theme.colors.background.secondary,
  },
  helperText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  rawBox: {
    maxHeight: 520,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 12,
    padding: 12,
    backgroundColor: theme.colors.background.primary,
  },
  rawText: {
    fontFamily: Platform.select({ web: 'monospace', default: undefined }),
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.text.secondary,
  },
});
