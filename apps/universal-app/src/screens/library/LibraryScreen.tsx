import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useStories } from '@/api/stories';

export default function LibraryScreen() {
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
          <View style={styles.storyCard}>
            <Text style={styles.storyTitle}>{item.title}</Text>
            <Text style={styles.storyMeta}>{item.language} • {item.status}</Text>
          </View>
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  list: {
    padding: 16,
  },
  storyCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  storyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  storyMeta: {
    fontSize: 14,
    color: '#64748b',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 48,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
  },
});
