import React from 'react';
import { TouchableOpacity, View, Text, Image, StyleSheet } from 'react-native';
import { theme } from '@/theme';

interface Props {
  story: {
    id: string;
    title: string;
    language: string;
    status: string;
    scenes?: Array<{ image?: { url?: string } }>;
  };
  onPress: () => void;
}

export function StoryCard({ story, onPress }: Props) {
  // Get first scene image as thumbnail
  const thumbnail = story.scenes?.[0]?.image?.url;
  
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {thumbnail && (
        <Image 
          source={{ uri: thumbnail }} 
          style={styles.thumbnail}
          resizeMode="cover"
        />
      )}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{story.title}</Text>
        <Text style={styles.meta}>{story.language} • {story.status}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: 200,
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
});
