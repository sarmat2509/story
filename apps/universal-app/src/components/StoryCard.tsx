import React from 'react';
import { TouchableOpacity, View, Text, Image, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
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
    audioMetadata?: { finalAssetId?: string };
  };
  onPress: (id: string) => void;
  onDelete?: (storyId: string, title: string) => void;
  variant?: 'list' | 'grid';
}

const StoryCardComponent = ({ story, onPress, onDelete, variant = 'list' }: Props) => {
  // Prefer thumbnail for library (smaller, faster loading), fallback to full image
  const thumbnailRaw = story.coverThumbnailUrl
    || story.coverImageUrl
    || story.scenes?.find(scene => scene.image?.url)?.image?.url
    || null;
  const thumbnail = formatAssetUrl(thumbnailRaw);
  const hasAudio = story.hasAudio || !!story.audioMetadata?.finalAssetId;
  
  // Grid variant: compact card with image on top
  if (variant === 'grid') {
    return (
      <View style={styles.gridCard}>
        <TouchableOpacity style={styles.gridCardTouchable} onPress={() => onPress(story.id)}>
          {thumbnail ? (
            <Image 
              source={{ uri: thumbnail }} 
              style={styles.gridThumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.gridPlaceholder}>
              <Text style={styles.placeholderIcon}>📖</Text>
            </View>
          )}
          <View style={styles.gridContent}>
            <Text style={styles.gridTitle} numberOfLines={2}>
              {story.title}
            </Text>
          </View>
        </TouchableOpacity>
        
        {/* Audio badge - top left corner */}
        {hasAudio && (
          <View style={styles.audioBadge}>
            <Ionicons name="headset" size={18} color={theme.colors.interactive.primary} />
          </View>
        )}
        
        {/* Delete button - top right corner with hover effect */}
        {onDelete && (
          <Pressable 
            style={({ pressed, hovered }) => [
              styles.deleteButtonGrid,
              Platform.OS === 'web' && hovered && styles.deleteButtonGridHover,
              pressed && styles.deleteButtonGridPressed
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
          <Text style={styles.title} numberOfLines={2}>{story.title}</Text>
          <Text style={styles.meta}>{story.language} • {story.status}</Text>
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
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    overflow: 'hidden',
  },
  listCardTouchable: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
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
  gridCard: {
    position: 'relative',
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    overflow: 'hidden',
  },
  gridCardTouchable: {
    width: '100%',
  },
  gridThumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  gridPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 40,
  },
  gridContent: {
    padding: theme.spacing[3],
  },
  gridTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
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
