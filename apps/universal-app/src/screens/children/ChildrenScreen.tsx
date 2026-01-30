import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useChildren } from '@/api/children';
import { ChildFormModal } from '@/components/ChildFormModal';
import { theme } from '@/theme';
import { ReferencePhoto } from '@kazka/shared';

export default function ChildrenScreen() {
  const { data: children, isLoading, error } = useChildren();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingChild, setEditingChild] = useState<{
    id: string;
    name: string;
    birthDate: Date;
    gender?: 'girl' | 'boy' | 'other';
    languages: string[];
    referencePhotos?: ReferencePhoto[];
    appearanceTraits?: any;
    personality?: any;
    interests?: any;
    sensitivities?: any;
    familyCast?: Record<string, string>;
  } | undefined>();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.loadingText}>Loading children...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Failed to load children profiles</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Child Profiles</Text>
        <Text style={styles.subtitle}>
          Create personalized stories for each child
        </Text>
      </View>

      <TouchableOpacity 
        style={styles.addButton}
        onPress={() => {
          setEditingChild(undefined);
          setIsModalVisible(true);
        }}
      >
        <Text style={styles.addButtonIcon}>+</Text>
        <Text style={styles.addButtonText}>Add New Child</Text>
      </TouchableOpacity>

      {!children || children.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👶</Text>
          <Text style={styles.emptyTitle}>No children yet</Text>
          <Text style={styles.emptyText}>
            Add your first child profile to create personalized stories
          </Text>
        </View>
      ) : (
        <View style={styles.childrenList}>
          {children.map((child: any) => (
            <View key={child.id} style={styles.childCard}>
              <View style={styles.childAvatar}>
                <Text style={styles.childAvatarText}>
                  {child.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.childInfo}>
                <Text style={styles.childName}>{child.name}</Text>
                {child.birthDate && (
                  <Text style={styles.childDetail}>
                    Born: {new Date(child.birthDate).toLocaleDateString()}
                  </Text>
                )}
                {child.gender && (
                  <Text style={styles.childDetail}>Gender: {child.gender}</Text>
                )}
                {child.languages && child.languages.length > 0 && (
                  <Text style={styles.childDetail}>
                    Languages: {child.languages.join(', ')}
                  </Text>
                )}
              </View>
              <TouchableOpacity 
                style={styles.editButton}
                onPress={() => {
                  const childData = {
                    id: child.id,
                    name: child.name,
                    birthDate: new Date(child.birthDate),
                    gender: child.gender,
                    languages: child.languages,
                    referencePhotos: child.referencePhotos,
                    appearanceTraits: child.appearanceTraits,
                    personality: child.personality,
                    interests: child.interests,
                    sensitivities: child.sensitivities,
                    familyCast: child.familyCast,
                  };
                  console.log('[ChildrenScreen] Opening edit for child:', {
                    id: child.id,
                    hasPhotos: !!child.referencePhotos,
                    photosCount: child.referencePhotos?.length || 0,
                    photos: child.referencePhotos
                  });
                  setEditingChild(childData);
                  setIsModalVisible(true);
                }}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Child Form Modal */}
      <ChildFormModal
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
          setEditingChild(undefined);
        }}
        childId={editingChild?.id}
        initialData={editingChild}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing[6],
  },
  content: {
    padding: theme.spacing[6],
    minHeight: '100%',
    backgroundColor: theme.colors.background.primary,
  },
  header: {
    marginBottom: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[4],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.lg,
    marginBottom: theme.spacing[6],
  },
  addButtonIcon: {
    fontSize: theme.typography.fontSize['2xl'],
    color: theme.colors.text.inverse,
    marginRight: theme.spacing[2],
    fontWeight: theme.typography.fontWeight.bold,
  },
  addButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  childrenList: {
    gap: theme.spacing[4],
  },
  childCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  childAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.interactive.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing[4],
  },
  childAvatarText: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  childDetail: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[0],
  },
  editButton: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
  },
  editButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: theme.spacing[12],
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: theme.spacing[4],
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.status.error,
    textAlign: 'center',
  },
});
