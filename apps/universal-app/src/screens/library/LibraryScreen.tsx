import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useStories } from '@/api/stories';
import { theme } from '@/theme';
import { StoryCard } from '@/components/StoryCard';
import type { MainDrawerParamList } from '@/types/navigation';

export default function LibraryScreen() {
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { data: stories, isLoading, error } = useStories();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading stories...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text>Error loading stories</Text>
      </View>
    );
  }

  if (!stories || stories.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No stories yet</Text>
        <Text style={styles.emptySubtext}>Create your first story!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <StoryCard 
            story={item}
            onPress={() => navigation.navigate('Story', { storyId: item.id })}
          />
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  list: {
    padding: theme.spacing[4],
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    textAlign: 'center',
    marginTop: theme.spacing[12],
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginTop: theme.spacing[2],
  },
});
