import React, { useState, useCallback } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  Image,
  StyleSheet,
  LayoutChangeEvent,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import type { SeriesListItem } from '@/api/stories';

const STACK_OFFSET = 20;
const STACK_INSET = 40; // 20*2 — each image is this much smaller to fit 3 stacked
const IMAGE_ASPECT = 16 / 9;

interface Props {
  series: SeriesListItem;
  onPress: (seriesId: string) => void;
  cardWidth?: number;
}

export function SeriesCard({ series, onPress, cardWidth: cardWidthProp }: Props) {
  const { t } = useTranslation();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const cardWidth = cardWidthProp ?? measuredWidth ?? 0;

  const lastStories = series.lastStories || [];
  const ordered = [...lastStories].reverse();

  const imageWidth = cardWidth > 0 ? cardWidth - STACK_INSET : 0;
  const imageHeight = imageWidth > 0 ? imageWidth / IMAGE_ASPECT : 0;
  const stackHeight = imageHeight > 0 ? imageHeight + STACK_INSET : 0;

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (cardWidthProp == null) {
        const w = e.nativeEvent.layout.width;
        if (w > 0) setMeasuredWidth(w);
      }
    },
    [cardWidthProp]
  );

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(series.id)} activeOpacity={0.8}>
      <View
        style={[styles.stackContainer, stackHeight > 0 && { height: stackHeight }]}
        onLayout={handleLayout}
      >
        {ordered.map((story, index) => {
          const offset = index * STACK_OFFSET;
          const thumbnail = formatAssetUrl(story.coverThumbnailUrl || story.coverImageUrl);
          return (
            <View
              key={story.id}
              style={[
                styles.stackImageWrapper,
                {
                  left: offset,
                  top: offset,
                  zIndex: index,
                  width: imageWidth,
                  height: imageHeight,
                },
              ]}
            >
              {thumbnail ? (
                <Image source={{ uri: thumbnail }} style={styles.stackImage} resizeMode="cover" />
              ) : (
                <View style={styles.stackPlaceholder}>
                  <Text style={styles.placeholderIcon}>📖</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {series.baseTitle}
        </Text>
        <Text style={styles.partsCount}>
          {t('series.parts_count', { count: series.totalParts })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {},
  stackContainer: {
    position: 'relative',
    width: '100%',
    marginBottom: theme.spacing[2],
  },
  stackImageWrapper: {
    position: 'absolute',
    borderRadius: theme.borders.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.tertiary,
    ...Platform.select({
      web: { boxShadow: '0 2px 5px rgba(0,0,0,0.2)' },
      default: {
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
    }),
  },
  stackImage: {
    width: '100%',
    height: '100%',
  },
  stackPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.tertiary,
  },
  placeholderIcon: {
    fontSize: 32,
  },
  content: {
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[3],
  },
  title: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  partsCount: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
});
