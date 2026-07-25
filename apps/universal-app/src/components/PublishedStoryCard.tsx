import React from 'react';
import { TouchableOpacity, View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { PublicStoryListItem, PublicStoryFormat } from '@wondertales/shared';
import { emojiForAvg } from '@wondertales/shared';
import { theme } from '@/theme';
import { LinearGradient } from '@/components/AppLinearGradient';
import { formatAssetUrl } from '@/utils/assetUrl';

interface Props {
  story: PublicStoryListItem;
  onPress: (slug: string) => void;
  variant: 'grid' | 'list';
  cardWidth?: number;
}

export function PublishedStoryCard({ story, onPress, variant, cardWidth }: Props) {
  const { t } = useTranslation();
  const coverUrl =
    story.coverThumbnailUrl ??
    story.coverImageUrl ??
    story.scenes?.[0]?.imageUrl ??
    story.scenes?.find((s) => s.imageUrl)?.imageUrl ??
    null;
  const thumbnail = coverUrl ? formatAssetUrl(coverUrl) : null;
  const hasAudio = story.hasAudio ?? !!story.audioMetadata;
  const formatKey: Record<PublicStoryFormat, string> = {
    story: 'wizard.format_story',
    graphic_novel: 'wizard.format_comic',
    mixed_story: 'wizard.format_mixed',
  };
  const formatLabel = t(formatKey[story.storyFormat ?? 'story']);

  if (variant === 'grid') {
    return (
      <View style={[styles.gridCard, cardWidth ? { width: cardWidth } : undefined]}>
        <TouchableOpacity
          style={styles.gridCardTouchable}
          onPress={() => onPress(story.publishedSlug)}
          activeOpacity={0.7}
          testID={`published-story-card-${story.publishedSlug}`}
        >
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.gridThumbnail} resizeMode="cover" />
          ) : (
            <View style={styles.gridPlaceholder}>
              <Text style={styles.placeholderIcon}>📖</Text>
            </View>
          )}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.68)']}
            locations={[0.24, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.gridGradient}
          />
          <View style={styles.gridTitleBlock} pointerEvents="none">
            <Text style={styles.gridAuthor} numberOfLines={1}>
              {story.authorDisplayName || 'Anonymous'}
            </Text>
            <Text style={styles.gridTitle} numberOfLines={2}>
              {story.title}
            </Text>
          </View>
          <View style={styles.formatBadge}>
            <Text style={styles.formatBadgeText}>{formatLabel}</Text>
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
        testID={`published-story-card-${story.publishedSlug}`}
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
          <View style={styles.listFormatBadge}>
            <Text style={styles.formatBadgeText}>{formatLabel}</Text>
          </View>
          {story.rating && story.rating.count > 0 && (
            <Text style={styles.listRating}>
              {emojiForAvg(story.rating.avg)} {story.rating.avg.toFixed(1)} ({story.rating.count})
            </Text>
          )}
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
    borderRadius: theme.borders.radius.xl,
    overflow: 'hidden',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    aspectRatio: 16 / 9,
    backgroundColor: theme.colors.background.tertiary,
  },
  gridCardTouchable: {
    height: '100%',
    position: 'relative',
  },
  gridThumbnail: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  gridPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '72%',
  },
  gridTitleBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[6],
    paddingBottom: theme.spacing[5],
  },
  gridTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
    lineHeight: 24,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  gridAuthor: {
    marginBottom: theme.spacing[1],
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    color: 'rgba(255,255,255,0.86)',
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  audioBadge: {
    position: 'absolute',
    top: theme.spacing[2],
    left: theme.spacing[2],
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: theme.borders.radius.full,
    padding: theme.spacing[1],
  },
  formatBadge: {
    position: 'absolute',
    top: theme.spacing[2],
    right: theme.spacing[2],
    maxWidth: '72%',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: theme.borders.radius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  formatBadgeText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  listCard: {
    marginBottom: theme.spacing[3],
    borderRadius: theme.borders.radius.xl,
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
    padding: theme.spacing[5],
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
  listFormatBadge: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.tertiary,
  },
  listRating: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[1],
  },
  audioBadgeList: {
    marginRight: theme.spacing[4],
  },
  placeholderIcon: {
    fontSize: 32,
  },
});
