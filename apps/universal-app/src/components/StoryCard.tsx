import React from 'react';
import { TouchableOpacity, View, Text, Image, StyleSheet, Pressable, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from '@/components/AppLinearGradient';
import { Ionicons } from '@expo/vector-icons';
import type { StoryAudioMetadata } from '@wondertales/shared';
import { theme } from '@/theme';
import { modernColors, modernShadows } from '@/theme/modernTheme';
import { formatAssetUrl } from '@/utils/assetUrl';

interface Props {
  story: {
    id: string;
    title: string;
    language: string;
    status: string;
    coverImageUrl?: string | null;
    coverThumbnailUrl?: string | null;
    scenes?: Array<{ image?: { url?: string } }>;
    hasAudio?: boolean;
    audioMetadata?: StoryAudioMetadata | null;
    createdByMode?: 'parent' | 'child';
    parentReviewStatus?: 'not_required' | 'pending' | 'approved' | 'rejected';
  };
  onPress: (id: string) => void;
  onDelete?: (storyId: string, title: string) => void;
  variant?: 'list' | 'grid';
}

const StoryCardComponent = ({ story, onPress, onDelete, variant = 'list' }: Props) => {
  const { t } = useTranslation();

  // Prefer thumbnail for library (smaller, faster loading), fallback to full image
  const thumbnailRaw =
    story.coverThumbnailUrl ||
    story.coverImageUrl ||
    story.scenes?.find((scene) => scene.image?.url)?.image?.url ||
    null;
  const thumbnail = formatAssetUrl(thumbnailRaw);
  const hasAudio = story.hasAudio || !!story.audioMetadata?.finalAssetId;
  const reviewStatus = story.createdByMode === 'child' ? story.parentReviewStatus : undefined;
  const reviewBadge =
    reviewStatus && reviewStatus !== 'not_required' ? (
      <View
        style={[
          styles.reviewBadge,
          reviewStatus === 'pending' && styles.reviewBadgePending,
          reviewStatus === 'approved' && styles.reviewBadgeApproved,
          reviewStatus === 'rejected' && styles.reviewBadgeRejected,
        ]}
      >
        <Ionicons
          name={
            reviewStatus === 'approved'
              ? 'checkmark-circle-outline'
              : reviewStatus === 'rejected'
                ? 'close-circle-outline'
                : 'time-outline'
          }
          size={14}
          color={
            reviewStatus === 'approved'
              ? theme.colors.status.success
              : reviewStatus === 'rejected'
                ? theme.colors.status.error
                : theme.colors.status.warning
          }
        />
        <Text
          style={[
            styles.reviewBadgeText,
            reviewStatus === 'approved' && styles.reviewBadgeTextApproved,
            reviewStatus === 'rejected' && styles.reviewBadgeTextRejected,
          ]}
          numberOfLines={1}
        >
          {t(`story_card.parent_review_${reviewStatus}`)}
        </Text>
      </View>
    ) : null;

  // Grid variant: cover image + title overlaid in white, bottom gradient for contrast
  if (variant === 'grid') {
    return (
      <View style={styles.gridRoot}>
        <Pressable
          onPress={() => onPress(story.id)}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.gridShadowOuter,
            Platform.OS === 'web' && hovered && styles.gridShadowOuterHover,
            pressed && styles.gridShadowOuterPressed,
          ]}
        >
          <View style={styles.gridClip}>
            <View style={styles.gridMedia}>
              {thumbnail ? (
                <Image source={{ uri: thumbnail }} style={styles.gridThumbnail} resizeMode="cover" />
              ) : (
                <View style={styles.gridPlaceholder}>
                  <Text style={styles.placeholderIcon}>📖</Text>
                </View>
              )}
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
                locations={[0.25, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.gridGradient}
              />
              <View style={styles.gridTitleBlock} pointerEvents="none">
                <Text style={styles.gridTitle} numberOfLines={2}>
                  {story.title}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>

        {reviewBadge && <View style={styles.reviewBadgeGrid}>{reviewBadge}</View>}

        {/* Audio badge - top left corner */}
        {hasAudio && (
          <View style={[styles.audioBadge, reviewBadge && styles.audioBadgeWithReview]}>
            <Ionicons name="headset" size={18} color={theme.colors.interactive.primary} />
          </View>
        )}

        {/* Delete button - top right corner with hover effect */}
        {onDelete && (
          <Pressable
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.deleteButtonGrid,
              Platform.OS === 'web' && hovered && styles.deleteButtonGridHover,
              pressed && styles.deleteButtonGridPressed,
            ]}
            onPress={() => onDelete(story.id, story.title)}
          >
            <Ionicons name="trash-outline" size={20} color="#fff" />
          </Pressable>
        )}
      </View>
    );
  }

  // List variant: no image, text only with inline delete button
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.listCardTouchable} onPress={() => onPress(story.id)}>
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {story.title}
          </Text>
          <Text style={styles.meta}>
            {story.language} • {story.status}
          </Text>
          {reviewBadge && <View style={styles.reviewBadgeList}>{reviewBadge}</View>}
        </View>
      </TouchableOpacity>

      {/* Delete button - inline on right */}
      {onDelete && (
        <TouchableOpacity
          style={styles.deleteButtonList}
          onPress={() => onDelete(story.id, story.title)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={20} color={theme.colors.text.tertiary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

// Custom comparison: only re-render if story data actually changed
const areEqual = (prevProps: Props, nextProps: Props) => {
  return (
    prevProps.story.id === nextProps.story.id &&
    prevProps.story.title === nextProps.story.title &&
    prevProps.story.status === nextProps.story.status &&
    prevProps.story.coverImageUrl === nextProps.story.coverImageUrl &&
    prevProps.story.coverThumbnailUrl === nextProps.story.coverThumbnailUrl &&
    prevProps.story.createdByMode === nextProps.story.createdByMode &&
    prevProps.story.parentReviewStatus === nextProps.story.parentReviewStatus &&
    prevProps.variant === nextProps.variant &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.onDelete === nextProps.onDelete &&
    // Check if audio status changed
    prevProps.story.hasAudio === nextProps.story.hasAudio &&
    prevProps.story.audioMetadata?.finalAssetId === nextProps.story.audioMetadata?.finalAssetId
  );
};

export const StoryCard = React.memo(StoryCardComponent, areEqual);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[3],
    borderRadius: theme.borders.radius.xl,
    backgroundColor: modernColors.surface,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    overflow: 'hidden',
    ...modernShadows.subtle,
  },
  listCardTouchable: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[5],
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    marginBottom: theme.spacing[1],
    color: theme.colors.text.primary,
  },
  meta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    maxWidth: 180,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    backgroundColor: theme.colors.background.primary,
  },
  reviewBadgePending: {
    borderColor: theme.colors.status.warning,
  },
  reviewBadgeApproved: {
    borderColor: theme.colors.status.success,
  },
  reviewBadgeRejected: {
    borderColor: theme.colors.status.error,
  },
  reviewBadgeText: {
    flexShrink: 1,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.status.warning,
  },
  reviewBadgeTextApproved: {
    color: theme.colors.status.success,
  },
  reviewBadgeTextRejected: {
    color: theme.colors.status.error,
  },
  reviewBadgeList: {
    marginTop: theme.spacing[2],
    alignSelf: 'flex-start',
  },
  gridRoot: {
    position: 'relative',
  },
  gridShadowOuter: {
    borderRadius: theme.borders.radius.xl,
    backgroundColor: modernColors.surface,
    borderWidth: 0,
    borderColor: modernColors.border,
    ...modernShadows.card,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transform: 'translateY(0px)',
        transition: 'transform 180ms ease, box-shadow 180ms ease',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      default: {},
    }),
  },
  gridShadowOuterHover: Platform.select({
    ios: {
      shadowOpacity: 0.22,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 8 },
    web: {
      transform: 'translateY(-3px)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  gridShadowOuterPressed: {
    opacity: 0.97,
  },
  gridClip: {
    borderRadius: 26,
    overflow: 'hidden',
  },
  gridMedia: {
    width: '100%',
    aspectRatio: 16 / 9,
    position: 'relative',
    overflow: 'hidden',
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
  placeholderIcon: {
    fontSize: 40,
  },
  gridGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
  },
  gridTitleBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing[5],
    paddingBottom: theme.spacing[5],
    paddingTop: theme.spacing[6],
    justifyContent: 'flex-end',
  },
  gridTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#FFFFFF',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    lineHeight: 24,
    maxWidth: '82%',
  },
  reviewBadgeGrid: {
    position: 'absolute',
    top: theme.spacing[2],
    left: theme.spacing[2],
    zIndex: 11,
  },
  audioBadge: {
    position: 'absolute',
    top: theme.spacing[2],
    left: theme.spacing[2],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.full,
    padding: theme.spacing[2],
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  audioBadgeWithReview: {
    top: theme.spacing[10],
  },
  deleteButtonGrid: {
    position: 'absolute',
    top: theme.spacing[2],
    right: theme.spacing[2],
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    borderRadius: theme.borders.radius.full,
    padding: theme.spacing[2],
    zIndex: 10,
    elevation: 5,
    ...Platform.select({
      web: {
        // @ts-ignore
        transitionProperty: 'background-color, transform',
        transitionDuration: '200ms',
        cursor: 'pointer',
      },
    }),
  },
  deleteButtonGridHover: Platform.select({
    web: {
      backgroundColor: 'rgba(220, 38, 38, 1)',
      // @ts-ignore
      transform: 'scale(1.1)',
    },
    default: {},
  }),
  deleteButtonGridPressed: {
    backgroundColor: 'rgba(185, 28, 28, 0.9)',
  },
  deleteButtonList: {
    padding: theme.spacing[3],
    justifyContent: 'center',
    alignItems: 'center',
  },
});
