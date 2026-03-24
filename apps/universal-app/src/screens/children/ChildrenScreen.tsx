import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useChildren, useDeleteChild } from '@/api/children';
import { ChildFormContent } from '@/components/ChildFormContent';
import { ChildFormModal } from '@/components/ChildFormModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ChildCard } from './components/ChildCard';
import { theme } from '@/theme';
import type { ReferencePhoto } from '@wondertales/shared';
import type { ChildFormInitialData } from '@/components/ChildFormContent';

function useColumns(): number {
  const { width } = useWindowDimensions();
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  return 2;
}

function mapChildToInitialData(child: Record<string, unknown>): ChildFormInitialData {
  const birthDate = child.birthDate ?? child.birthdate;
  return {
    name: String(child.name ?? ''),
    birthDate: birthDate instanceof Date ? birthDate : new Date(String(birthDate ?? '')),
    languages: Array.isArray(child.languages) ? child.languages : [],
    referencePhotos: child.referencePhotos as ReferencePhoto[] | undefined,
    appearanceTraits: child.appearanceTraits as Record<string, unknown> | undefined,
    personality: child.personality as Record<string, unknown> | undefined,
    interests: child.interests as unknown[] | undefined,
    sensitivities: child.sensitivities as Record<string, unknown> | undefined,
    familyCast: child.familyCast as Record<string, string> | undefined,
    aiGeneratedDescription: child.aiGeneratedDescription as string | undefined,
    descriptionLanguage: child.descriptionLanguage as string | undefined,
    turnaroundSheet: child.turnaroundSheet as { url: string; frontUrl?: string; generatedAt: string } | undefined,
  };
}

export default function ChildrenScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { data, isLoading, error } = useChildren();
  const deleteChild = useDeleteChild();
  const columns = useColumns();
  const paddingHorizontal = theme.spacing[6] * 2;
  const gap = theme.spacing[4];
  const cardWidth = (width - paddingHorizontal - gap * (columns - 1)) / columns;

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [childToDelete, setChildToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingChild, setEditingChild] = useState<{
    id: string;
  } & ChildFormInitialData | undefined>();

  const children = data?.children ?? [];
  const limit = data?.limit ?? null;
  const canCreateMore = data?.canCreateMore ?? false;
  // Inline form only when limit=1 AND at most 1 child (if user has 2+ despite plan, show list)
  const isInlineMode = limit === 1 && children.length <= 1;

  const handleEditChild = (child: Record<string, unknown>) => {
    setEditingChild({
      id: String(child.id ?? ''),
      ...mapChildToInitialData(child),
    });
    setIsModalVisible(true);
  };

  const handleDelete = (childId: string, childName: string) => {
    setChildToDelete({ id: childId, name: childName });
    setDeleteDialogVisible(true);
  };

  const confirmDelete = () => {
    if (childToDelete) {
      deleteChild.mutate(childToDelete.id);
      setDeleteDialogVisible(false);
      setChildToDelete(null);
    }
  };

  const cancelDelete = () => {
    setDeleteDialogVisible(false);
    setChildToDelete(null);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('children_screen.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t('children_screen.error')}</Text>
      </View>
    );
  }

  // Inline mode: limit === 1 — form directly on page, no modal
  if (isInlineMode) {
    const existingChild = children[0];
    return (
      <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('children_screen.title_single')}</Text>
          <Text style={styles.subtitle}>{t('children_screen.subtitle_single')}</Text>
        </View>
        <ChildFormContent
          key={existingChild?.id ?? 'new'}
          childId={existingChild?.id}
          initialData={existingChild ? mapChildToInitialData(existingChild as Record<string, unknown>) : undefined}
          onSuccess={() => {}}
          variant="inline"
        />
        <TouchableOpacity
          style={styles.reportProblemLink}
          onPress={() => setShowFeedbackModal(true)}
        >
          <Text style={styles.reportProblemLinkText}>{t('profile.report_problem')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="children"
      />
    </>
    );
  }

  // List mode: limit > 1 or null — cards + modal + add button (2+ profiles)
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('children_screen.title')}</Text>
        <Text style={styles.subtitle}>{t('children_screen.subtitle')}</Text>
      </View>

      {children.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👶</Text>
          <Text style={styles.emptyText}>{t('children_screen.empty_title')}</Text>
          <Text style={styles.emptyHint}>{t('children_screen.empty_text')}</Text>
          {canCreateMore && (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => {
                setEditingChild(undefined);
                setIsModalVisible(true);
              }}
            >
              <Text style={styles.emptyButtonText}>{t('children_screen.add_button')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <View style={[styles.grid, Platform.OS === 'web' && { gridTemplateColumns: `repeat(${columns}, 1fr)` } as any]}>
            {children.map((child: Record<string, unknown>) => {
              const childId = String(child.id ?? '');
              const childData = {
                id: childId,
                name: String(child.name ?? ''),
                birthDate: child.birthDate as string | undefined,
                birthdate: child.birthdate as string | undefined,
                turnaroundSheet: child.turnaroundSheet as { url: string; frontUrl?: string } | undefined,
                referencePhotos: child.referencePhotos as { url: string }[] | undefined,
              };
              return Platform.OS === 'web' ? (
                <ChildCard
                  key={childId}
                  child={childData}
                  onPress={() => handleEditChild(child)}
                  onDelete={handleDelete}
                />
              ) : (
                <View key={childId} style={{ width: cardWidth }}>
                  <ChildCard
                    child={childData}
                    onPress={() => handleEditChild(child)}
                    onDelete={handleDelete}
                  />
                </View>
              );
            })}
          </View>

          {canCreateMore && (
            <TouchableOpacity
              style={styles.addCharacterButton}
              onPress={() => {
                setEditingChild(undefined);
                setIsModalVisible(true);
              }}
            >
              <Ionicons name="add-circle" size={24} color={theme.colors.text.inverse} />
              <Text style={styles.addCharacterButtonText}>{t('children_screen.add_button')}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <ChildFormModal
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
          setEditingChild(undefined);
        }}
        childId={editingChild?.id}
        initialData={editingChild ? mapChildToInitialData(editingChild as unknown as Record<string, unknown>) : undefined}
      />

      <ConfirmDialog
        visible={deleteDialogVisible}
        title={t('children_screen.delete_confirm_title')}
        message={t('children_screen.delete_confirm_message', { name: childToDelete?.name || '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        variant="danger"
      />

      <TouchableOpacity
        style={styles.reportProblemLink}
        onPress={() => setShowFeedbackModal(true)}
      >
        <Text style={styles.reportProblemLinkText}>{t('profile.report_problem')}</Text>
      </TouchableOpacity>

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="children"
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
  addCharacterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
    marginTop: theme.spacing[6],
    gap: theme.spacing[2],
  },
  addCharacterButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  grid: Platform.select({
    web: {
      display: 'grid' as any,
      gap: theme.spacing[4],
    },
    default: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: theme.spacing[4],
    },
  }),
  emptyState: {
    alignItems: 'center',
    marginTop: theme.spacing[12],
    paddingVertical: theme.spacing[10],
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: theme.spacing[4],
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  emptyHint: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[6],
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
  },
  emptyButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  reportProblemLink: {
    alignSelf: 'center',
    paddingVertical: theme.spacing[4],
    marginTop: theme.spacing[4],
  },
  reportProblemLinkText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
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
