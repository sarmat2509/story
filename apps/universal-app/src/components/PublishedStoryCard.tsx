import React from 'react';
import { TouchableOpacity, View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';

export interface PublicStoryListItem {
  id: string;
  title: string;
  publishedSlug: string;
  authorDisplayName: string;
  scenes?: Array<{ sceneId: number; imageUrl?: string | null }>;
  hasAudio?: boolean;
  audioMetadata?: unknown;
}

interface Props {
  story: PublicStoryListItem;
  onPress: (slug: string) => void;
  variant: 'grid' | 'list';
  cardWidth?: number;
}

export function PublishedStoryCard({ story, onPress, variant, cardWidth }: Props) {
  const coverUrl =
    story.scenes?.[0]?.imageUrl ?? story.scenes?.find((s) => s.imageUrl)?.imageUrl ?? null;
  const thumbnail = coverUrl ? formatAssetUrl(coverUrl) : null;
  const hasAudio = story.hasAudio ?? !!story.audioMetadata;

  if (variant === 'grid') {
    return (
      <View style={[styles.gridCard, cardWidth ? { width: cardWidth } : undefined]}>
        <TouchableOpacity
          style={styles.gridCardTouchable}
          onPress={() => onPress(story.publishedSlug)}
          activeOpacity={0.7}
        >
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.gridThumbnail} resizeMode="cover" />
          ) : (
            <View style={styles.gridPlaceholder}>
              <Text style={styles.placeholderIcon}>📖</Text>
            </View>
          )}
          <View style={styles.gridContent}>
            <Text style={styles.gridTitle} numberOfLines={2}>
              {story.title}
            </Text>
            <Text style={styles.gridAuthor} numberOfLines={1}>
              {story.authorDisplayName || 'Anonymous'}
            </Text>
          </View>
        </TouchableOpacity>
        {hasAudio && (
          <View style={styles.audioBadge}>
            <Ionicons name="headset" size={18} color={theme.colors.interactive.primary} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.listCard}>
      <TouchableOpacity
        style={styles.listCardTouchable}
        onPress={() => onPress(story.publishedSlug)}
        activeOpacity={0.7}
      >
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.listThumbnail} resizeMode="cover" />
        ) : (
          <View style={styles.listPlaceholder}>
            <Text style={styles.placeholderIcon}>📖</Text>
          </View>
        )}
        <View style={styles.listContent}>
          <Text style={styles.listTitle} numberOfLines={2}>
            {story.title}
          </Text>
          <Text style={styles.listAuthor} numberOfLines={1}>
            {story.authorDisplayName || 'Anonymous'}
          </Text>
        </View>
        {hasAudio && (
          <View style={styles.audioBadgeList}>
            <Ionicons name="headset" size={18} color={theme.colors.interactive.primary} />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  gridCard: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    overflow: 'hidden',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  gridCardTouchable: {},
  gridThumbnail: {
    aspectRatio: 16 / 9,
    width: '100%',
  },
  gridPlaceholder: {
    aspectRatio: 16 / 9,
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContent: {
    padding: theme.spacing[3],
  },
  gridTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  gridAuthor: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  audioBadge: {
    position: 'absolute',
    top: theme.spacing[2],
    left: theme.spacing[2],
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: theme.borders.radius.full,
    padding: theme.spacing[1],
  },
  listCard: {
    marginBottom: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    overflow: 'hidden',
  },
  listCardTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listThumbnail: {
    width: 80,
    height: 60,
  },
  listPlaceholder: {
    width: 80,
    height: 60,
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    flex: 1,
    padding: theme.spacing[4],
  },
  listTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  listAuthor: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  audioBadgeList: {
    marginRight: theme.spacing[4],
  },
  placeholderIcon: {
    fontSize: 32,
  },
});
