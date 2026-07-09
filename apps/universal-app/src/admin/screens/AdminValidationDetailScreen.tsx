import React, { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  type ImageStyle,
  type StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  type ViewStyle,
  View,
} from 'react-native';
import { NavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  useAdminImageValidation,
  useAdminRegenerateGraphicNovelPageImage,
  useAdminRegenerateSceneImage,
} from '@/admin/api/admin';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { API_BASE_URL } from '@/config/constants';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';
import { formatAssetUrl } from '@/utils/assetUrl';
import { storage } from '@/utils/storage';

function toLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toUpperCase();
}

const negativeBooleanLabels: Record<string, { ok: string; fail: string }> = {
  duplicated: { ok: 'NOT DUPLICATED', fail: 'DUPLICATED' },
  hasUnexpectedCharacters: { ok: 'NO UNEXPECTED CHARACTERS', fail: 'UNEXPECTED CHARACTERS' },
  hasExtraPanelStructure: { ok: 'NO EXTRA PANEL STRUCTURE', fail: 'EXTRA PANEL STRUCTURE' },
  hasTextOrLetters: { ok: 'NO TEXT IN ART', fail: 'TEXT IN ART' },
  hasRenderingArtifacts: { ok: 'NO RENDERING ARTIFACTS', fail: 'RENDERING ARTIFACTS' },
  hasArtworkOutsidePanelBounds: {
    ok: 'NO ARTWORK OUTSIDE PANEL BOUNDS',
    fail: 'ARTWORK OUTSIDE PANEL BOUNDS',
  },
  hasArtworkOverSpeechBubbles: {
    ok: 'NO ARTWORK OVER SPEECH BUBBLES',
    fail: 'ARTWORK OVER SPEECH BUBBLES',
  },
};

function getBooleanDisplay(
  key: string,
  value: boolean
): { label: string; isOk: boolean; icon: React.ComponentProps<typeof Ionicons>['name'] } {
  const negativeLabels = negativeBooleanLabels[key];
  if (negativeLabels) {
    return {
      label: value ? negativeLabels.fail : negativeLabels.ok,
      isOk: !value,
      icon: value ? 'alert-circle' : 'checkmark-circle',
    };
  }

  return {
    label: toLabel(key),
    isOk: value,
    icon: value ? 'checkmark-circle' : 'close-circle',
  };
}

function getFieldLabel(key: string, value: unknown): string {
  if (typeof value === 'boolean') {
    return getBooleanDisplay(key, value).label;
  }
  return toLabel(key);
}

function isScalarValue(value: unknown): boolean {
  return (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function formatValidationScore(score: number | null, status?: string): string {
  if (score != null) return String(score);
  if (status === 'provider_blocked') return 'blocked';
  return 'n/a';
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

type CharacterBBox = {
  found?: boolean;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  confidence?: number;
  visibility?: string | null;
  notes?: string | null;
};

type CharacterCropRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CharacterBBoxModalTarget = {
  characterName: string;
  bbox: CharacterBBox;
  cropRect: CharacterCropRect | null;
  source: 'result' | 'manifest';
};

type CharacterBBoxCardContext = {
  getBBoxTarget: (character: Record<string, unknown>) => CharacterBBoxModalTarget | null;
  onOpenBBox: (target: CharacterBBoxModalTarget) => void;
};

const BBOX_PALETTE = [
  { border: '#2563eb', fill: 'rgba(37, 99, 235, 0.24)' },
  { border: '#dc2626', fill: 'rgba(220, 38, 38, 0.22)' },
  { border: '#16a34a', fill: 'rgba(22, 163, 74, 0.22)' },
  { border: '#9333ea', fill: 'rgba(147, 51, 234, 0.22)' },
  { border: '#ea580c', fill: 'rgba(234, 88, 12, 0.22)' },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function compactId(value: string | null | undefined): string {
  if (!value) return 'n/a';
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function jsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

function formatAdminImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/')) {
    return Platform.OS === 'web' ? url : `${API_BASE_URL.replace(/\/$/, '')}${url}`;
  }
  return formatAssetUrl(url) ?? url;
}

function omitKeys(value: unknown, keys: string[]): unknown {
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeCharacterNameForLookup(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}

function readCharacterBBox(value: unknown): CharacterBBox | null {
  const record = asRecord(value);
  if (!record) return null;
  const xMin = finiteNumber(record.xMin);
  const yMin = finiteNumber(record.yMin);
  const xMax = finiteNumber(record.xMax);
  const yMax = finiteNumber(record.yMax);
  if (xMin == null || yMin == null || xMax == null || yMax == null) return null;
  if (xMax <= xMin || yMax <= yMin) return null;
  const confidence = finiteNumber(record.confidence);
  return {
    found: typeof record.found === 'boolean' ? record.found : undefined,
    xMin: Math.max(0, Math.min(1000, xMin)),
    yMin: Math.max(0, Math.min(1000, yMin)),
    xMax: Math.max(0, Math.min(1000, xMax)),
    yMax: Math.max(0, Math.min(1000, yMax)),
    confidence: confidence == null ? undefined : Math.max(0, Math.min(100, confidence)),
    visibility: typeof record.visibility === 'string' ? record.visibility : null,
    notes: typeof record.notes === 'string' ? record.notes : null,
  };
}

function readCharacterCropRect(value: unknown): CharacterCropRect | null {
  const record = asRecord(value);
  if (!record) return null;
  const left = finiteNumber(record.left);
  const top = finiteNumber(record.top);
  const width = finiteNumber(record.width);
  const height = finiteNumber(record.height);
  if (left == null || top == null || width == null || height == null) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function findNamedRecord(items: unknown, name: string): Record<string, unknown> | null {
  const normalizedName = normalizeCharacterNameForLookup(name);
  if (!normalizedName) return null;
  return (
    asArray(items)
      .map(asRecord)
      .find((record) => normalizeCharacterNameForLookup(record?.name) === normalizedName) ?? null
  );
}

function findCharacterCropManifestRecord(
  items: unknown,
  name: string
): Record<string, unknown> | null {
  const normalizedName = normalizeCharacterNameForLookup(name);
  if (!normalizedName) return null;
  return (
    asArray(items)
      .map(asRecord)
      .find(
        (record) => normalizeCharacterNameForLookup(record?.characterName) === normalizedName
      ) ?? null
  );
}

function characterBBoxTargetFromValidation(
  character: Record<string, unknown>,
  requestManifest: unknown
): CharacterBBoxModalTarget | null {
  const characterName = typeof character.name === 'string' ? character.name : null;
  if (!characterName) return null;

  const directBBox = readCharacterBBox(character.characterBoundingBox);
  const directCropRect = readCharacterCropRect(character.characterCropRect);
  if (directBBox) {
    return {
      characterName,
      bbox: directBBox,
      cropRect: directCropRect,
      source: 'result',
    };
  }

  const manifest = asRecord(requestManifest);
  const boxRecord = findNamedRecord(manifest?.characterBoundingBoxes, characterName);
  const bbox = readCharacterBBox(boxRecord);
  if (!bbox) return null;

  const cropRecord = findCharacterCropManifestRecord(manifest?.characterCrops, characterName);
  return {
    characterName,
    bbox,
    cropRect: readCharacterCropRect(cropRecord?.cropRect),
    source: 'manifest',
  };
}

function bboxPaletteForName(name: string) {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return BBOX_PALETTE[hash % BBOX_PALETTE.length];
}

function percentStyleValue(value: number): `${number}%` {
  return `${value}%` as `${number}%`;
}

function bboxPercentStyle(bbox: CharacterBBox) {
  return {
    left: percentStyleValue(bbox.xMin / 10),
    top: percentStyleValue(bbox.yMin / 10),
    width: percentStyleValue((bbox.xMax - bbox.xMin) / 10),
    height: percentStyleValue((bbox.yMax - bbox.yMin) / 10),
  };
}

function getToneStyle(tone: Tone) {
  if (tone === 'success') return styles.infoPillSuccess;
  if (tone === 'warning') return styles.infoPillWarning;
  if (tone === 'danger') return styles.infoPillDanger;
  return styles.infoPillNeutral;
}

function getToneTextStyle(tone: Tone) {
  if (tone === 'success') return styles.infoPillValueSuccess;
  if (tone === 'warning') return styles.infoPillValueWarning;
  if (tone === 'danger') return styles.infoPillValueDanger;
  return styles.infoPillValueNeutral;
}

function getManifestSummary(manifest: unknown): string {
  const record = asRecord(manifest);
  if (!record) return 'no manifest';

  const attempts = asArray(record.attempts);
  const references = asArray(record.references);
  const imageOrder = asArray(record.imageOrder);
  const firstAttempt = asRecord(attempts[0]);
  const mode = firstAttempt?.promptMode ?? record.operation ?? 'validation';

  return `${attempts.length || 0} attempt(s) · ${String(mode)} · ${references.length} ref(s) · ${imageOrder.length} image(s)`;
}

function InfoPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number | null | undefined;
  tone?: Tone;
}) {
  return (
    <View style={[styles.infoPill, getToneStyle(tone)]}>
      <Text style={styles.infoPillLabel}>{label}</Text>
      <Text style={[styles.infoPillValue, getToneTextStyle(tone)]} numberOfLines={2}>
        {value ?? 'n/a'}
      </Text>
    </View>
  );
}

function VerdictFlag({
  fieldKey,
  value,
  healthyWhenFalse = true,
}: {
  fieldKey: string;
  value: unknown;
  healthyWhenFalse?: boolean;
}) {
  if (typeof value !== 'boolean') return null;
  const booleanDisplay = negativeBooleanLabels[fieldKey]
    ? getBooleanDisplay(fieldKey, value)
    : (() => {
        const isOk = healthyWhenFalse ? !value : value;
        return {
          label: toLabel(fieldKey),
          isOk,
          icon: (isOk ? 'checkmark-circle' : 'alert-circle') as React.ComponentProps<
            typeof Ionicons
          >['name'],
        };
      })();
  const isOk = booleanDisplay.isOk;

  return (
    <View style={[styles.flagPill, isOk ? styles.flagPillSuccess : styles.flagPillDanger]}>
      <Ionicons
        name={booleanDisplay.icon}
        size={16}
        color={isOk ? theme.colors.status.success : theme.colors.status.error}
      />
      <Text
        style={[styles.flagPillText, isOk ? styles.flagPillTextSuccess : styles.flagPillTextDanger]}
      >
        {booleanDisplay.label}
      </Text>
    </View>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <ScrollView style={styles.jsonScrollBox} contentContainerStyle={styles.jsonScrollContent}>
      <Text selectable style={styles.jsonText}>
        {jsonPreview(value)}
      </Text>
    </ScrollView>
  );
}

function AuthenticatedAdminImagePreview({
  url,
  style,
  resizeMode,
}: {
  url: string | null;
  style: StyleProp<ImageStyle>;
  resizeMode: 'cover' | 'contain';
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const emptyStyle = style as StyleProp<ViewStyle>;

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
          cache: 'no-store',
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
      } catch {
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
      <View style={[emptyStyle, styles.previewImageEmpty]}>
        <Ionicons name="image-outline" size={28} color={theme.colors.text.secondary} />
        <Text style={styles.valueText}>Image unavailable</Text>
      </View>
    );
  }

  if (!resolvedUrl) {
    return (
      <View style={[emptyStyle, styles.previewImageEmpty]}>
        <Text style={styles.valueText}>Loading image...</Text>
      </View>
    );
  }

  return <Image source={{ uri: resolvedUrl }} style={style} resizeMode={resizeMode} />;
}

function CharacterBBoxModal({
  target,
  imageUrl,
  onClose,
}: {
  target: CharacterBBoxModalTarget | null;
  imageUrl: string | null;
  onClose: () => void;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const visible = !!target;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    setResolvedUrl(null);
    setFailed(false);
    setImageSize(null);

    if (!visible || !imageUrl) {
      return () => undefined;
    }

    if (Platform.OS !== 'web' || imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) {
      setResolvedUrl(imageUrl);
      return () => undefined;
    }

    const load = async () => {
      try {
        const token = await storage.getAuthToken();
        const response = await fetch(imageUrl, {
          cache: 'no-store',
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
      } catch {
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
  }, [imageUrl, visible]);

  useEffect(() => {
    if (!resolvedUrl) return;
    let cancelled = false;
    Image.getSize(
      resolvedUrl,
      (width, height) => {
        if (!cancelled && width > 0 && height > 0) {
          setImageSize({ width, height });
        }
      },
      () => {
        if (!cancelled) setImageSize(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [resolvedUrl]);

  const palette = target ? bboxPaletteForName(target.characterName) : BBOX_PALETTE[0];
  const aspectRatio = imageSize ? imageSize.width / imageSize.height : 1;
  const bboxStyle = target ? bboxPercentStyle(target.bbox) : null;
  const cropLabel = target?.cropRect
    ? `${target.cropRect.left},${target.cropRect.top} ${target.cropRect.width}x${target.cropRect.height}`
    : 'n/a';
  const bboxLabel = target
    ? `${Math.round(target.bbox.xMin)},${Math.round(target.bbox.yMin)} - ${Math.round(
        target.bbox.xMax
      )},${Math.round(target.bbox.yMax)}`
    : 'n/a';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bboxModalBackdrop}>
        <View style={styles.bboxModalCard}>
          <View style={styles.bboxModalHeader}>
            <View style={styles.cardHeaderLeft}>
              <Ionicons name="scan-outline" size={18} color={theme.colors.interactive.primary} />
              <View style={styles.cardTitleBlock}>
                <Text style={styles.cardTitle}>{target?.characterName ?? 'BBox'}</Text>
                <Text style={styles.cardSummary}>
                  {target?.source === 'result' ? 'stored on character row' : 'from request manifest'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.bboxModalCloseButton} onPress={onClose}>
              <Ionicons name="close" size={18} color={theme.colors.text.primary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.bboxImageFrame, { aspectRatio }]}>
            {resolvedUrl && target && bboxStyle ? (
              <>
                <Image
                  source={{ uri: resolvedUrl }}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="contain"
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.bboxOverlay,
                    bboxStyle,
                    { borderColor: palette.border, backgroundColor: palette.fill },
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.bboxOverlayLabel,
                    {
                      left: bboxStyle.left,
                      top: bboxStyle.top,
                      backgroundColor: palette.border,
                    },
                  ]}
                >
                  <Text style={styles.bboxOverlayLabelText}>{target.characterName}</Text>
                </View>
              </>
            ) : (
              <View style={styles.previewImageEmpty}>
                <Ionicons
                  name={failed ? 'alert-circle-outline' : 'image-outline'}
                  size={28}
                  color={theme.colors.text.secondary}
                />
                <Text style={styles.valueText}>
                  {failed ? 'Image unavailable' : 'Loading image...'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.infoGrid}>
            <InfoPill label="BBox 0..1000" value={bboxLabel} />
            <InfoPill label="Visibility" value={target?.bbox.visibility ?? 'n/a'} />
            <InfoPill label="Confidence" value={target?.bbox.confidence ?? 'n/a'} />
            <InfoPill label="Crop px" value={cropLabel} />
          </View>
          {target?.bbox.notes ? (
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackLabel}>BBOX NOTES</Text>
              <Text style={styles.feedbackText}>{target.bbox.notes}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function parseNumberedSummary(value: string): Array<{ marker: string; text: string }> {
  const matches = Array.from(value.matchAll(/\((\d+)\)\s*([^]+?)(?=\s*\(\d+\)\s*|$)/g));
  if (matches.length === 0) {
    return [{ marker: '1', text: value.trim() }];
  }
  return matches
    .map((match) => ({ marker: match[1], text: match[2].trim() }))
    .filter((item) => item.text.length > 0);
}

function SummaryList({ label, value }: { label: string; value: unknown }) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const items = parseNumberedSummary(value);

  return (
    <View style={styles.summaryListBox}>
      <Text style={styles.summaryListLabel}>{label}</Text>
      <View style={styles.summaryListItems}>
        {items.map((item, index) => (
          <View key={`${label}-${item.marker}-${index}`} style={styles.summaryListItem}>
            <View style={styles.summaryListMarker}>
              <Text style={styles.summaryListMarkerText}>{item.marker}</Text>
            </View>
            <Text selectable style={styles.summaryListText}>
              {item.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function renderCharacterCards(
  characters: unknown[],
  keyPrefix: string,
  bboxContext?: CharacterBBoxCardContext
): React.ReactNode {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.characterRow}
    >
      {characters.map((character, index) => {
        const entries =
          character && typeof character === 'object' && !Array.isArray(character)
            ? Object.entries(character as Record<string, unknown>)
            : [['value', character]];
        const characterRecord = asRecord(character);
        const bboxTarget = characterRecord ? bboxContext?.getBBoxTarget(characterRecord) : null;
        const identitySummary = entries.find(([key]) => key === 'identityComparisonSummary')?.[1];

        return (
          <View key={`${keyPrefix}-${index}`} style={styles.characterCard}>
            <View style={styles.characterCardHeader}>
              <Text style={styles.characterCardTitle}>
                {typeof (character as Record<string, unknown>)?.name === 'string'
                  ? String((character as Record<string, unknown>).name).toUpperCase()
                  : `CHARACTER ${index + 1}`}
              </Text>
              {bboxTarget ? (
                <TouchableOpacity
                  style={styles.bboxButton}
                  activeOpacity={0.82}
                  onPress={() => bboxContext?.onOpenBBox(bboxTarget)}
                >
                  <Ionicons
                    name="scan-outline"
                    size={14}
                    color={theme.colors.interactive.primary}
                  />
                  <Text style={styles.bboxButtonText}>BBox</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.valueGroup}>
              {entries
                .filter(
                  ([key]) =>
                    key !== 'name' &&
                    key !== 'identityComparisonSummary' &&
                    key !== 'characterBoundingBox' &&
                    key !== 'characterCropRect'
                )
                .map(([key, entry]) =>
                  isScalarValue(entry) ? (
                    <View key={`${keyPrefix}-${index}-${key}`} style={styles.booleanFieldRow}>
                      <Text style={styles.valueKey}>{getFieldLabel(String(key), entry)}</Text>
                      {renderStructuredValue(entry, `${keyPrefix}-${index}-${key}`, String(key))}
                    </View>
                  ) : (
                    <View key={`${keyPrefix}-${index}-${key}`} style={styles.valueRow}>
                      <Text style={styles.valueKey}>{getFieldLabel(String(key), entry)}</Text>
                      {renderStructuredValue(entry, `${keyPrefix}-${index}-${key}`, String(key))}
                    </View>
                  )
                )}
            </View>
            <SummaryList label="Identity comparison summary" value={identitySummary} />
          </View>
        );
      })}
    </ScrollView>
  );
}

function renderStructuredValue(
  value: unknown,
  keyPrefix: string = 'root',
  fieldKey: string = keyPrefix
): React.ReactNode {
  if (value == null) return <Text style={styles.valueText}>n/a</Text>;
  if (typeof value === 'boolean') {
    const booleanDisplay = getBooleanDisplay(fieldKey, value);
    return (
      <Ionicons
        name={booleanDisplay.icon}
        size={18}
        color={booleanDisplay.isOk ? theme.colors.status.success : theme.colors.status.error}
      />
    );
  }
  if (typeof value === 'string' || typeof value === 'number') {
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
        {value.map((entry, index) =>
          isScalarValue(entry) ? (
            <View key={`${keyPrefix}-${index}`} style={styles.booleanFieldRow}>
              <Text style={styles.valueKey}>{String(index + 1).padStart(2, '0')}</Text>
              {renderStructuredValue(entry, `${keyPrefix}-${index}`, String(index + 1))}
            </View>
          ) : (
            <View key={`${keyPrefix}-${index}`} style={styles.valueRow}>
              <Text style={styles.valueKey}>{String(index + 1).padStart(2, '0')}</Text>
              {renderStructuredValue(entry, `${keyPrefix}-${index}`, String(index + 1))}
            </View>
          )
        )}
      </View>
    );
  }
  return (
    <View style={styles.valueGroup}>
      {Object.entries(value as Record<string, unknown>).map(([key, entry]) =>
        key === 'identityComparisonSummary' ? (
          <View key={`${keyPrefix}-${key}`} style={styles.valueRow}>
            <Text style={styles.valueKey}>{getFieldLabel(key, entry)}</Text>
            {renderStructuredValue(entry, `${keyPrefix}-${key}`, key)}
          </View>
        ) : isScalarValue(entry) ? (
          <View key={`${keyPrefix}-${key}`} style={styles.booleanFieldRow}>
            <Text style={styles.valueKey}>{getFieldLabel(key, entry)}</Text>
            {renderStructuredValue(entry, `${keyPrefix}-${key}`, key)}
          </View>
        ) : (
          <View key={`${keyPrefix}-${key}`} style={styles.inlineFieldRow}>
            <Text style={styles.valueKey}>{getFieldLabel(key, entry)}</Text>
            <View style={styles.inlineFieldValue}>
              {renderStructuredValue(entry, `${keyPrefix}-${key}`, key)}
            </View>
          </View>
        )
      )}
    </View>
  );
}

function DetailCard({
  title,
  icon,
  children,
  summary,
  defaultExpanded = true,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  children: React.ReactNode;
  summary?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        activeOpacity={0.82}
        style={styles.cardHeader}
        onPress={() => setExpanded((value) => !value)}
      >
        <View style={styles.cardHeaderLeft}>
          <Ionicons name={icon} size={18} color={theme.colors.interactive.primary} />
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle}>{title}</Text>
            {summary ? (
              <Text style={styles.cardSummary} numberOfLines={1}>
                {summary}
              </Text>
            ) : null}
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.text.secondary}
        />
      </TouchableOpacity>
      {expanded ? <View style={styles.cardBody}>{children}</View> : null}
    </View>
  );
}

function ValidationVerdict({ result }: { result: Record<string, unknown> | null }) {
  if (!result) return <Text style={styles.valueText}>No structured result.</Text>;

  const characterCount = result.characterCount;
  const expectedCharacterCount = result.expectedCharacterCount;
  const countValue =
    typeof characterCount === 'number' || typeof expectedCharacterCount === 'number'
      ? `${characterCount ?? 'n/a'} / ${expectedCharacterCount ?? 'n/a'}`
      : 'n/a';
  const layoutFeedback = typeof result.layoutFeedback === 'string' ? result.layoutFeedback : 'n/a';
  const layoutTone: Tone = layoutFeedback.toLowerCase() === 'ok' ? 'success' : 'warning';
  const overallFeedback =
    typeof result.overallFeedback === 'string' ? result.overallFeedback : null;

  return (
    <View style={styles.sectionStack}>
      <View style={styles.infoGrid}>
        <InfoPill label="Characters" value={countValue} />
        <InfoPill label="Layout" value={layoutFeedback} tone={layoutTone} />
      </View>

      <View style={styles.flagGrid}>
        <VerdictFlag fieldKey="hasUnexpectedCharacters" value={result.hasUnexpectedCharacters} />
        <VerdictFlag fieldKey="hasExtraPanelStructure" value={result.hasExtraPanelStructure} />
        <VerdictFlag fieldKey="hasTextOrLetters" value={result.hasTextOrLetters} />
        <VerdictFlag fieldKey="hasRenderingArtifacts" value={result.hasRenderingArtifacts} />
        <VerdictFlag
          fieldKey="hasArtworkOutsidePanelBounds"
          value={result.hasArtworkOutsidePanelBounds}
        />
        <VerdictFlag
          fieldKey="hasArtworkOverSpeechBubbles"
          value={result.hasArtworkOverSpeechBubbles}
        />
      </View>

      {overallFeedback ? (
        <View style={styles.feedbackBox}>
          <Text style={styles.feedbackLabel}>OVERALL FEEDBACK</Text>
          <Text style={styles.feedbackText}>{overallFeedback}</Text>
        </View>
      ) : null}
    </View>
  );
}

function RequestManifestSummary({ manifest }: { manifest: unknown }) {
  const record = asRecord(manifest);
  if (!record) return <Text style={styles.valueText}>No request manifest.</Text>;

  const attempts = asArray(record.attempts).map(asRecord).filter(Boolean) as Array<
    Record<string, unknown>
  >;
  const references = asArray(record.references);
  const imageOrder = asArray(record.imageOrder);

  return (
    <View style={styles.sectionStack}>
      <View style={styles.infoGrid}>
        <InfoPill label="Version" value={String(record.version ?? 'n/a')} />
        <InfoPill label="Operation" value={String(record.operation ?? 'n/a')} />
        <InfoPill label="Cache key" value={String(record.cacheKey ?? 'n/a')} />
        <InfoPill label="References" value={references.length} />
        <InfoPill label="Image order" value={imageOrder.length} />
      </View>

      {attempts.length > 0 ? (
        <View style={styles.attemptList}>
          {attempts.map((attempt, index) => (
            <View key={`manifest-attempt-${index}`} style={styles.attemptSummary}>
              <Text style={styles.attemptTitle}>Attempt {index + 1}</Text>
              <View style={styles.infoGrid}>
                <InfoPill label="Role" value={String(attempt.providerRole ?? 'n/a')} />
                <InfoPill label="Kind" value={String(attempt.attemptKind ?? 'n/a')} />
                <InfoPill label="Outcome" value={String(attempt.outcome ?? 'n/a')} />
                <InfoPill label="Prompt mode" value={String(attempt.promptMode ?? 'n/a')} />
                <InfoPill
                  label="Runtime chars"
                  value={String(attempt.runtimePromptChars ?? 'n/a')}
                />
                <InfoPill label="Cached chars" value={String(attempt.cachedPrefixChars ?? 'n/a')} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.rawBlockHeader}>
        <Text style={styles.rawBlockTitle}>RAW REQUEST MANIFEST</Text>
        <Text style={styles.rawBlockHint}>
          Includes full runtimePrompt and image/reference order.
        </Text>
      </View>
      <JsonBlock value={manifest} />
    </View>
  );
}

export default function AdminValidationDetailScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const route = useRoute<RouteProp<AdminStackParamList, 'AdminValidationDetail'>>();
  const id = route.params?.id;
  const query = useAdminImageValidation(id);
  const regenerateMutation = useAdminRegenerateSceneImage();
  const regenerateGraphicNovelPageMutation = useAdminRegenerateGraphicNovelPageImage();
  const [bboxTarget, setBboxTarget] = useState<CharacterBBoxModalTarget | null>(null);
  const item = query.data;
  const validationImageUrl = formatAdminImageUrl(item?.imageUrl);
  const isGraphicPageValidation =
    item?.imageTargetKind === 'graphic_novel_page' ||
    item?.storyFormat === 'graphic_novel' ||
    item?.storyFormat === 'mixed_story';
  const graphicNovelPageNumber = item?.graphicNovelPageNumber ?? item?.sceneIndex;
  const resultObject =
    item?.result && typeof item.result === 'object' && !Array.isArray(item.result)
      ? (item.result as Record<string, unknown>)
      : null;
  const resultCharacters = Array.isArray(resultObject?.characters) ? resultObject.characters : null;
  const cleanResultJson = omitKeys(item?.result, [
    'requestManifest',
    'hasTemplateColorResidue',
    'templateColorResidueDetails',
  ]);
  const manifestSummary = getManifestSummary(item?.requestManifest);

  return (
    <AdminLayout
      navigation={navigation}
      activeRoute="AdminValidations"
      title="Admin / Validation Detail"
    >
      <View style={styles.headerRow}>
        <Text style={styles.recordId}>{id ?? 'n/a'}</Text>
        <View style={styles.headerActions}>
          {item ? (
            <>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('AdminScenesStory', { storyId: item.storyId })}
              >
                <Text style={styles.secondaryButtonText}>Open story scenes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                disabled={
                  isGraphicPageValidation
                    ? regenerateGraphicNovelPageMutation.isPending
                    : regenerateMutation.isPending
                }
                onPress={() => {
                  if (isGraphicPageValidation && graphicNovelPageNumber != null) {
                    regenerateGraphicNovelPageMutation.mutate({
                      storyId: item.storyId,
                      pageNumber: graphicNovelPageNumber,
                    });
                    return;
                  }

                  regenerateMutation.mutate({
                    storyId: item.storyId,
                    sceneId: item.sceneIndex,
                  });
                }}
              >
                <Text style={styles.primaryButtonText}>
                  {isGraphicPageValidation
                    ? regenerateGraphicNovelPageMutation.isPending
                      ? 'Queueing...'
                      : `Regenerate page ${graphicNovelPageNumber ?? item.sceneIndex}`
                    : regenerateMutation.isPending
                      ? 'Queueing...'
                      : `Regenerate scene ${item.sceneIndex}`}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('AdminValidations')}
          >
            <Text style={styles.backButtonText}>Back to validations</Text>
          </TouchableOpacity>
        </View>
      </View>

      {(regenerateMutation.isSuccess || regenerateGraphicNovelPageMutation.isSuccess) && item ? (
        <Text style={styles.statusSuccess}>
          Regeneration queued for story {item.storyId},{' '}
          {isGraphicPageValidation
            ? `page ${graphicNovelPageNumber ?? item.sceneIndex}`
            : `scene ${item.sceneIndex}`}
          .
        </Text>
      ) : null}
      {regenerateMutation.error ? (
        <Text style={styles.statusError}>{(regenerateMutation.error as Error).message}</Text>
      ) : null}
      {regenerateGraphicNovelPageMutation.error ? (
        <Text style={styles.statusError}>
          {(regenerateGraphicNovelPageMutation.error as Error).message}
        </Text>
      ) : null}

      {query.isLoading ? <AdminLoadingState /> : null}
      {query.error ? <AdminErrorState message={(query.error as Error).message} /> : null}

      {item && !query.isLoading && !query.error ? (
        <ScrollView contentContainerStyle={styles.content}>
          <DetailCard
            title="Image & Record"
            icon="image-outline"
            summary={`${isGraphicPageValidation ? 'Graphic novel page' : 'Story scene'} ${
              isGraphicPageValidation
                ? (graphicNovelPageNumber ?? item.sceneIndex)
                : item.sceneIndex
            } · score ${formatValidationScore(item.validationScore, item.validationStatus)}`}
          >
            <View style={styles.imageRecordGrid}>
              <View style={styles.imageColumn}>
                <AuthenticatedAdminImagePreview
                  url={formatAdminImageUrl(item.imageUrl)}
                  style={[
                    styles.previewImage,
                    isGraphicPageValidation ? styles.previewImageGraphicNovel : null,
                  ]}
                  resizeMode={isGraphicPageValidation ? 'contain' : 'cover'}
                />
              </View>
              <View style={styles.recordColumn}>
                <View style={styles.infoGrid}>
                  <InfoPill label="Story" value={compactId(item.storyId)} />
                  <InfoPill
                    label={isGraphicPageValidation ? 'Page' : 'Scene'}
                    value={
                      isGraphicPageValidation
                        ? (graphicNovelPageNumber ?? item.sceneIndex)
                        : item.sceneIndex
                    }
                  />
                  {isGraphicPageValidation ? (
                    <InfoPill label="Screen scene" value={item.sceneIndex} />
                  ) : null}
                  {item.sourceSceneIndex != null && item.sourceSceneIndex !== item.sceneIndex ? (
                    <InfoPill label="DB index" value={item.sourceSceneIndex} />
                  ) : null}
                  <InfoPill label="Attempt" value={item.attempt} />
                  <InfoPill
                    label="Score"
                    value={formatValidationScore(item.validationScore, item.validationStatus)}
                    tone={
                      item.validationScore != null && item.validationScore >= 85
                        ? 'success'
                        : 'warning'
                    }
                  />
                  <InfoPill label="Status" value={item.validationStatus ?? 'n/a'} />
                  <InfoPill label="Validation model" value={item.visionModel ?? 'n/a'} />
                  <InfoPill label="Created" value={new Date(item.createdAt).toLocaleString()} />
                </View>

                {item.providerError ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorBoxLabel}>PROVIDER ERROR</Text>
                    <Text style={styles.errorBoxText}>{item.providerError}</Text>
                  </View>
                ) : null}

                <View style={styles.pathBox}>
                  <Text style={styles.valueKey}>IMAGE STORAGE PATH</Text>
                  <Text style={styles.pathText}>{item.imageStoragePath}</Text>
                </View>
              </View>
            </View>
          </DetailCard>

          <DetailCard
            title="Validation Verdict"
            icon="shield-checkmark-outline"
            summary={`${resultCharacters?.length ?? 0} character verdict(s) · layout ${String(resultObject?.layoutFeedback ?? 'n/a')}`}
          >
            <ValidationVerdict result={resultObject} />
          </DetailCard>

          {resultCharacters && resultCharacters.length > 0 ? (
            <DetailCard
              title="Characters"
              icon="people-outline"
              summary={`${resultCharacters.length} checked`}
            >
              {renderCharacterCards(resultCharacters, 'validation-result-characters', {
                getBBoxTarget: (character) =>
                  characterBBoxTargetFromValidation(character, item.requestManifest),
                onOpenBBox: setBboxTarget,
              })}
            </DetailCard>
          ) : null}

          {item.usage ? (
            <DetailCard
              title="Provider Usage"
              icon="speedometer-outline"
              defaultExpanded={false}
              summary={`${item.usage.provider} · ${item.usage.operation} · ${item.usage.eventCount} event(s) · matched ${item.usage.matchedDeltaMs} ms`}
            >
              <View style={styles.infoGrid}>
                <InfoPill label="Provider" value={item.usage.provider} />
                <InfoPill label="Operation" value={item.usage.operation} />
                <InfoPill label="Usage events" value={item.usage.eventCount} />
                <InfoPill label="Operations" value={item.usage.operations.join(', ')} />
                <InfoPill label="Input units" value={item.usage.inputUnits ?? 'n/a'} />
                <InfoPill label="Output units" value={item.usage.outputUnits ?? 'n/a'} />
                <InfoPill
                  label="Total cost"
                  value={item.usage.costUsd != null ? `$${item.usage.costUsd.toFixed(8)}` : 'n/a'}
                />
                <InfoPill label="Created" value={new Date(item.usage.createdAt).toLocaleString()} />
                <InfoPill label="Usage match" value={`${item.usage.matchedDeltaMs} ms`} />
              </View>
              {item.usage.metadata ? <JsonBlock value={item.usage.metadata} /> : null}
            </DetailCard>
          ) : null}

          <DetailCard
            title="Request Manifest"
            icon="file-tray-full-outline"
            defaultExpanded={false}
            summary={manifestSummary}
          >
            <RequestManifestSummary manifest={item.requestManifest} />
          </DetailCard>

          <DetailCard
            title="Raw Validation JSON"
            icon="code-slash-outline"
            defaultExpanded={false}
            summary="result without duplicated requestManifest"
          >
            <JsonBlock value={cleanResultJson} />
          </DetailCard>
        </ScrollView>
      ) : null}

      <CharacterBBoxModal
        target={bboxTarget}
        imageUrl={validationImageUrl}
        onClose={() => setBboxTarget(null)}
      />
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
  primaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.primary,
  },
  primaryButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '700',
    fontSize: 14,
  },
  statusSuccess: {
    fontSize: 14,
    color: theme.colors.status.success,
  },
  statusError: {
    fontSize: 14,
    color: theme.colors.status.error,
  },
  content: {
    gap: 12,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  column: {
    flex: 1,
    minWidth: 320,
  },
  card: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    overflow: 'hidden',
  },
  cardHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.background.secondary,
  },
  cardHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitleBlock: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  cardSummary: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.text.secondary,
  },
  cardBody: {
    padding: 14,
    gap: 12,
  },
  imageRecordGrid: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  imageColumn: {
    flex: 1.2,
    minWidth: 340,
  },
  recordColumn: {
    flex: 1,
    minWidth: 320,
    gap: 12,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: theme.colors.background.secondary,
  },
  previewImageGraphicNovel: {
    aspectRatio: 1,
  },
  previewImageEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bboxModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.54)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  bboxModalCard: {
    width: '100%',
    maxWidth: 980,
    maxHeight: '92%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
    padding: 14,
    gap: 12,
  },
  bboxModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bboxModalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  bboxImageFrame: {
    width: '100%',
    maxHeight: 620,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  bboxOverlay: {
    position: 'absolute',
    borderWidth: 3,
  },
  bboxOverlayLabel: {
    position: 'absolute',
    marginTop: -22,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  bboxOverlayLabelText: {
    color: theme.colors.text.inverse,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  sectionStack: {
    gap: 12,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoPill: {
    minWidth: 138,
    flexGrow: 1,
    flexBasis: 150,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  infoPillNeutral: {
    backgroundColor: theme.colors.background.secondary,
    borderColor: theme.colors.border.light,
  },
  infoPillSuccess: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
  },
  infoPillWarning: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  infoPillDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  infoPillLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0,
  },
  infoPillValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  infoPillValueNeutral: {
    color: theme.colors.text.primary,
  },
  infoPillValueSuccess: {
    color: theme.colors.status.success,
  },
  infoPillValueWarning: {
    color: theme.colors.status.warning,
  },
  infoPillValueDanger: {
    color: theme.colors.status.error,
  },
  flagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  flagPillSuccess: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
  },
  flagPillDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  flagPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  flagPillTextSuccess: {
    color: theme.colors.status.success,
  },
  flagPillTextDanger: {
    color: theme.colors.status.error,
  },
  feedbackBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    padding: 12,
    gap: 6,
  },
  feedbackLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0,
  },
  feedbackText: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text.primary,
  },
  errorBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: 10,
    gap: 4,
  },
  errorBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.status.error,
    letterSpacing: 0,
  },
  errorBoxText: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.status.error,
  },
  pathBox: {
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    padding: 10,
  },
  pathText: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.text.primary,
    fontFamily: Platform.select({
      web: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      default: undefined,
    }),
  },
  attemptList: {
    gap: 8,
  },
  attemptSummary: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    padding: 10,
    gap: 8,
  },
  attemptTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  rawBlockHeader: {
    gap: 3,
  },
  rawBlockTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0,
  },
  rawBlockHint: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.text.secondary,
  },
  jsonScrollBox: {
    maxHeight: 360,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
  },
  jsonScrollContent: {
    padding: 10,
  },
  jsonText: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.text.primary,
    fontFamily: Platform.select({
      web: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      default: undefined,
    }),
  },
  valueGroup: {
    gap: 8,
  },
  valueRow: {
    gap: 4,
  },
  valueKey: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0,
  },
  valueText: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text.primary,
  },
  booleanFieldRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineFieldRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineFieldValue: {
    flex: 1,
    alignItems: 'flex-end',
  },
  characterRow: {
    gap: 10,
    paddingRight: 8,
  },
  characterCard: {
    width: 360,
    flexShrink: 0,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    gap: 8,
  },
  characterCardHeader: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  characterCardTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.interactive.primary,
    letterSpacing: 0,
  },
  bboxButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#f9a8d4',
    backgroundColor: '#fdf2f8',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  bboxButtonText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: theme.colors.interactive.primary,
  },
  summaryListBox: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
    gap: 8,
  },
  summaryListLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  summaryListItems: {
    gap: 8,
  },
  summaryListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  summaryListMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fce7f3',
    borderWidth: 1,
    borderColor: '#fbcfe8',
  },
  summaryListMarkerText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: theme.colors.interactive.primary,
  },
  summaryListText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.text.primary,
  },
});
