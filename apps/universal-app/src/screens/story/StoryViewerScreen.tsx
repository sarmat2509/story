import React from 'react';
import { View, Text, ScrollView, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useStory } from '@/api/stories';
import { theme } from '@/theme';
import type { MainDrawerParamList } from '@/types/navigation';

type StoryViewerRouteProp = RouteProp<MainDrawerParamList, 'Story'>;

export default function StoryViewerScreen() {
  const route = useRoute<StoryViewerRouteProp>();
  const { storyId } = route.params;
  const { data: story, isLoading, error } = useStory(storyId);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>Завантажуємо історію...</Text>
      </View>
    );
  }

  if (error || !story) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Не вдалося завантажити історію</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{story.title}</Text>
      
      {story.scenes?.map((scene: any, index: number) => (
        <View key={scene.sceneId || index} style={styles.scene}>
          {scene.image?.url && (
            <Image 
              source={{ uri: scene.image.url }} 
              style={styles.sceneImage}
              resizeMode="cover"
            />
          )}
          <Text style={styles.sceneText}>{scene.text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.primary,
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.status.error,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[4],
  },
  scene: {
    marginBottom: theme.spacing[8],
  },
  sceneImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    marginBottom: theme.spacing[4],
  },
  sceneText: {
    fontSize: theme.typography.fontSize.lg,
    lineHeight: theme.typography.fontSize.lg * 1.6,
    color: theme.colors.text.primary,
    paddingHorizontal: theme.spacing[6],
  },
});
