import React, { useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useChildren, useDeleteChild } from '@/api/children';
import { ChildFormModal } from '@/components/ChildFormModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ChildCard } from './components/ChildCard';
import { AnimatedSection } from '@/components/AnimatedSection';
import { AppButton } from '@/components/AppButton';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { theme } from '@/theme';
import { modernColors } from '@/theme/modernTheme';

const cardDelay = (i: number) => Math.min(120 + i * 40, 360);
import type { MainDrawerParamList } from '@/types/navigation';

function useColumns(): number {
  const { width } = useWindowDimensions();
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  return 2;
}

export default function ChildrenScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { width } = useWindowDimensions();
  const enterKey = useScreenEnter();
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [navigation]);

  const children = data?.children ?? [];
  const canCreateMore = data?.canCreateMore ?? false;

  const handleEditChild = (child: Record<string, unknown>) => {
    const childId = String(child.id ?? '');
    if (childId) {
      navigation.navigate('ChildDetail', { childId });
    }
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
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <AnimatedSection delay={0} trigger={enterKey}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('children_screen.title')}</Text>
          <Text style={styles.subtitle}>{t('children_screen.subtitle')}</Text>
        </View>
      </AnimatedSection>

      {children.length === 0 ? (
        <AnimatedSection delay={120} trigger={enterKey}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👶</Text>
            <Text style={styles.emptyText}>{t('children_screen.empty_title')}</Text>
            <Text style={styles.emptyHint}>{t('children_screen.empty_text')}</Text>
            {canCreateMore && (
              <AppButton
                label={t('children_screen.add_button')}
                onPress={() => {
                  setIsModalVisible(true);
                }}
                style={styles.emptyAction}
              />
            )}
          </View>
        </AnimatedSection>
      ) : (
        <>
          <View
            style={[
              styles.grid,
              Platform.OS === 'web' && ({ gridTemplateColumns: `repeat(${columns}, 1fr)` } as any),
            ]}
          >
            {children.map((child: Record<string, unknown>, index: number) => {
              const childId = String(child.id ?? '');
              const childData = {
                id: childId,
                name: String(child.name ?? ''),
                birthDate: child.birthDate as string | undefined,
                birthdate: child.birthdate as string | undefined,
                turnaroundSheet: child.turnaroundSheet as
                  | { url: string; frontUrl?: string }
                  | undefined,
                referencePhotos: child.referencePhotos as { url: string }[] | undefined,
              };
              const cardContent = (
                <ChildCard
                  child={childData}
                  onPress={() => handleEditChild(child)}
                  onDelete={handleDelete}
                />
              );
              return Platform.OS === 'web' ? (
                <AnimatedSection key={childId} delay={cardDelay(index)} trigger={enterKey}>
                  {cardContent}
                </AnimatedSection>
              ) : (
                <AnimatedSection
                  key={childId}
                  delay={cardDelay(index)}
                  trigger={enterKey}
                  style={{ width: cardWidth }}
                >
                  {cardContent}
                </AnimatedSection>
              );
            })}
          </View>

          {canCreateMore && (
            <AnimatedSection delay={cardDelay(children.length)} trigger={enterKey}>
              <AppButton
                label={t('children_screen.add_button')}
                onPress={() => {
                  setIsModalVisible(true);
                }}
                leading={<Ionicons name="add-circle" size={24} color={theme.colors.text.inverse} />}
                style={styles.addChildAction}
              />
            </AnimatedSection>
          )}
        </>
      )}

      <ChildFormModal
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
        }}
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
    backgroundColor: modernColors.page,
    padding: theme.spacing[6],
  },
  content: {
    padding: theme.spacing[6],
    minHeight: '100%',
    backgroundColor: modernColors.page,
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
  addChildAction: {
    marginTop: theme.spacing[6],
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
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surface,
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
  emptyAction: {},
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
