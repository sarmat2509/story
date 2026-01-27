import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useAuthStore } from '@/store/authStore';
import { useStories } from '@/api/stories';
import { useChildren } from '@/api/children';
import { theme } from '@/theme';

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { user } = useAuthStore();
  const { data: stories, isLoading: storiesLoading, error: storiesError } = useStories();
  const { data: children, isLoading: childrenLoading, error: childrenError } = useChildren();

  const storiesCount = stories?.length || 0;
  const childrenCount = children?.length || 0;
  const isLoading = storiesLoading || childrenLoading;
  const hasError = storiesError || childrenError;

  // Show loading state
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  // Show error state
  if (hasError) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Unable to load dashboard</Text>
        <Text style={styles.errorMessage}>
          {(storiesError as any)?.message || (childrenError as any)?.message || 'Please try again later'}
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            // React Query will auto-retry
            window.location.reload();
          }}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Welcome back, {user?.displayName || 'User'}!
        </Text>
        <Text style={styles.subtext}>
          What magical story shall we create today?
        </Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{storiesCount}</Text>
          <Text style={styles.statLabel}>Stories</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{childrenCount}</Text>
          <Text style={styles.statLabel}>Children</Text>
        </View>
      </View>

      <View style={styles.quickActions}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.primaryAction]}
          onPress={() => navigation.navigate('Wizard')}
        >
          <Text style={styles.actionIcon}>✨</Text>
          <Text style={styles.actionText}>Create New Story</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Children')}
        >
          <Text style={styles.actionIcon}>👶</Text>
          <Text style={styles.actionText}>Add Child Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Library')}
        >
          <Text style={styles.actionIcon}>📚</Text>
          <Text style={styles.actionText}>View Story Library</Text>
        </TouchableOpacity>
      </View>

      {stories && stories.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Stories</Text>
          {stories.slice(0, 3).map((story: any) => (
            <View key={story.id} style={styles.storyCard}>
              <Text style={styles.storyTitle}>{story.title}</Text>
              <Text style={styles.storyMeta}>
                {story.language} • {story.status}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing[6],
    minHeight: '100%',
    backgroundColor: theme.colors.background.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
    backgroundColor: theme.colors.background.primary,
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.status.error,
    marginBottom: theme.spacing[2],
  },
  errorMessage: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  retryButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
  },
  retryButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  header: {
    marginBottom: theme.spacing[8],
  },
  greeting: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  subtext: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  stats: {
    flexDirection: 'row',
    gap: theme.spacing[4],
    marginBottom: theme.spacing[8],
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing[5],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: theme.typography.fontSize['4xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.interactive.primary,
    marginBottom: theme.spacing[1],
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  quickActions: {
    marginBottom: theme.spacing[8],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    marginBottom: theme.spacing[3],
  },
  primaryAction: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  actionIcon: {
    fontSize: theme.typography.fontSize['2xl'],
    marginRight: theme.spacing[3],
  },
  actionText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  recentSection: {
    marginBottom: theme.spacing[6],
  },
  storyCard: {
    padding: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    marginBottom: theme.spacing[3],
  },
  storyTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  storyMeta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
});
