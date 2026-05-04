import React, { useMemo, useState, useLayoutEffect } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useChildren, useDeleteChild } from '@/api/children';
import { useCreatePrivacyRequest } from '@/api/privacyRequests';
import { ChildFormModal } from '@/components/ChildFormModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ChildCard } from './components/ChildCard';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { theme } from '@/theme';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import {
  buildChildDataDeletionRequestMessage,
  CHILD_DATA_DELETION_SCOPE_KEYS,
  DEFAULT_CHILD_DATA_DELETION_SCOPES,
  type ChildDataDeletionScope,
} from '@/utils/childDataDeletionRequest';

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
  const createPrivacyRequest = useCreatePrivacyRequest();
  const columns = useColumns();
  const paddingHorizontal = theme.spacing[6] * 2;
  const gap = theme.spacing[4];
  const cardWidth = (width - paddingHorizontal - gap * (columns - 1)) / columns;

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [childToDelete, setChildToDelete] = useState<{ id: string; name: string } | null>(null);
  const [childDataDeletionRequestVisible, setChildDataDeletionRequestVisible] = useState(false);
  const [childDataDeletionChild, setChildDataDeletionChild] = useState<{ id: string; name: string } | null>(null);
  const [childDataDeletionScopes, setChildDataDeletionScopes] = useState<ChildDataDeletionScope[]>([
    ...DEFAULT_CHILD_DATA_DELETION_SCOPES,
  ]);
  const [childDataDeletionDetails, setChildDataDeletionDetails] = useState('');
  const [childDataDeletionError, setChildDataDeletionError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />
      ),
    });
  }, [navigation]);

  const children = data?.children ?? [];
  const canCreateMore = data?.canCreateMore ?? false;
  const childDataDeletionScopeLabels = useMemo(
    () =>
      Object.fromEntries(
        CHILD_DATA_DELETION_SCOPE_KEYS.map((scope) => [
          scope,
          t(`children_screen.child_data_deletion_scope_${scope}`),
        ])
      ) as Record<ChildDataDeletionScope, string>,
    [t]
  );

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

  const openChildDataDeletionRequest = (childId: string, childName: string) => {
    setChildDataDeletionChild({ id: childId, name: childName });
    setChildDataDeletionScopes([...DEFAULT_CHILD_DATA_DELETION_SCOPES]);
    setChildDataDeletionDetails('');
    setChildDataDeletionError(null);
    setChildDataDeletionRequestVisible(true);
  };

  const closeChildDataDeletionRequest = (force = false) => {
    if (createPrivacyRequest.isPending && !force) return;
    setChildDataDeletionRequestVisible(false);
    setChildDataDeletionChild(null);
    setChildDataDeletionDetails('');
    setChildDataDeletionError(null);
    setChildDataDeletionScopes([...DEFAULT_CHILD_DATA_DELETION_SCOPES]);
  };

  const toggleChildDataDeletionScope = (scope: ChildDataDeletionScope) => {
    setChildDataDeletionError(null);
    setChildDataDeletionScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope]
    );
  };

  const submitChildDataDeletionRequest = async () => {
    if (!childDataDeletionChild) return;
    if (childDataDeletionScopes.length === 0) {
      setChildDataDeletionError(t('children_screen.child_data_deletion_scope_required'));
      return;
    }

    try {
      const message = buildChildDataDeletionRequestMessage({
        childId: childDataDeletionChild.id,
        childName: childDataDeletionChild.name,
        scopes: childDataDeletionScopes,
        details: childDataDeletionDetails,
      });
      await createPrivacyRequest.mutateAsync({
        requestType: 'deletion',
        message,
      });
      closeChildDataDeletionRequest(true);
      Alert.alert(
        t('children_screen.child_data_deletion_success_title'),
        t('children_screen.child_data_deletion_success_message')
      );
    } catch (err) {
      setChildDataDeletionError(
        getLocalizedApiError(t, err, 'children_screen.child_data_deletion_error')
      );
    }
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
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => {
                  setIsModalVisible(true);
                }}
              >
                <Text style={styles.emptyButtonText}>{t('children_screen.add_button')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </AnimatedSection>
      ) : (
        <>
          <View style={[styles.grid, Platform.OS === 'web' && { gridTemplateColumns: `repeat(${columns}, 1fr)` } as any]}>
            {children.map((child: Record<string, unknown>, index: number) => {
              const childId = String(child.id ?? '');
              const childData = {
                id: childId,
                name: String(child.name ?? ''),
                birthDate: child.birthDate as string | undefined,
                birthdate: child.birthdate as string | undefined,
                turnaroundSheet: child.turnaroundSheet as { url: string; frontUrl?: string } | undefined,
                referencePhotos: child.referencePhotos as { url: string }[] | undefined,
              };
              const cardContent = (
                <ChildCard
                  child={childData}
                  onPress={() => handleEditChild(child)}
                  onDelete={handleDelete}
                  onRequestDataDeletion={openChildDataDeletionRequest}
                  dataDeletionRequestLabel={t('children_screen.child_data_deletion_request_button')}
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
              <TouchableOpacity
                style={styles.addCharacterButton}
                onPress={() => {
                  setIsModalVisible(true);
                }}
              >
                <Ionicons name="add-circle" size={24} color={theme.colors.text.inverse} />
                <Text style={styles.addCharacterButtonText}>{t('children_screen.add_button')}</Text>
              </TouchableOpacity>
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

      <Modal
        visible={childDataDeletionRequestVisible}
        transparent
        animationType="fade"
        onRequestClose={() => closeChildDataDeletionRequest()}
      >
        <View style={styles.requestModalOverlay}>
          <View style={styles.requestModal}>
            <ScrollView contentContainerStyle={styles.requestModalContent}>
              <View style={styles.requestModalIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={34}
                  color={theme.colors.interactive.primary}
                />
              </View>
              <Text style={styles.requestModalTitle}>
                {t('children_screen.child_data_deletion_request_title', {
                  name: childDataDeletionChild?.name ?? '',
                })}
              </Text>
              <Text style={styles.requestModalBody}>
                {t('children_screen.child_data_deletion_request_body')}
              </Text>

              <View style={styles.requestScopeList}>
                {CHILD_DATA_DELETION_SCOPE_KEYS.map((scope) => {
                  const selected = childDataDeletionScopes.includes(scope);
                  return (
                    <TouchableOpacity
                      key={scope}
                      style={[
                        styles.requestScopeButton,
                        selected && styles.requestScopeButtonSelected,
                      ]}
                      activeOpacity={0.75}
                      onPress={() => toggleChildDataDeletionScope(scope)}
                    >
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={selected ? theme.colors.interactive.primary : theme.colors.text.tertiary}
                      />
                      <Text style={styles.requestScopeText} numberOfLines={2}>
                        {childDataDeletionScopeLabels[scope]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.requestDetailsField}>
                <Text style={styles.requestDetailsLabel}>
                  {t('children_screen.child_data_deletion_details_label')}
                </Text>
                <TextInput
                  style={styles.requestDetailsInput}
                  value={childDataDeletionDetails}
                  onChangeText={(value) => {
                    setChildDataDeletionDetails(value);
                    setChildDataDeletionError(null);
                  }}
                  placeholder={t('children_screen.child_data_deletion_details_placeholder')}
                  placeholderTextColor={theme.colors.text.tertiary}
                  multiline
                  maxLength={1200}
                  editable={!createPrivacyRequest.isPending}
                />
              </View>

              {childDataDeletionError ? (
                <Text style={styles.requestErrorText}>{childDataDeletionError}</Text>
              ) : null}

              <View style={styles.requestButtonRow}>
                <TouchableOpacity
                  style={[styles.requestButton, styles.requestCancelButton]}
                  activeOpacity={0.75}
                  disabled={createPrivacyRequest.isPending}
                  onPress={() => closeChildDataDeletionRequest()}
                >
                  <Text style={styles.requestCancelButtonText}>
                    {t('children_screen.child_data_deletion_cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.requestButton,
                    styles.requestSubmitButton,
                    (createPrivacyRequest.isPending || childDataDeletionScopes.length === 0) &&
                      styles.requestButtonDisabled,
                  ]}
                  activeOpacity={0.75}
                  disabled={createPrivacyRequest.isPending || childDataDeletionScopes.length === 0}
                  onPress={submitChildDataDeletionRequest}
                >
                  {createPrivacyRequest.isPending ? (
                    <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                  ) : (
                    <Ionicons name="send-outline" size={16} color={theme.colors.text.inverse} />
                  )}
                  <Text style={styles.requestSubmitButtonText}>
                    {createPrivacyRequest.isPending
                      ? t('children_screen.child_data_deletion_submitting')
                      : t('children_screen.child_data_deletion_confirm')}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  requestModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[5],
  },
  requestModal: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  requestModalContent: {
    padding: theme.spacing[6],
  },
  requestModalIcon: {
    width: 58,
    height: 58,
    borderRadius: theme.borders.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: theme.colors.background.secondary,
    marginBottom: theme.spacing[4],
  },
  requestModalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  requestModalBody: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: theme.spacing[5],
  },
  requestScopeList: {
    gap: theme.spacing[2],
    marginBottom: theme.spacing[5],
  },
  requestScopeButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
  requestScopeButtonSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.background.primary,
  },
  requestScopeText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    lineHeight: 18,
  },
  requestDetailsField: {
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  requestDetailsLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  requestDetailsInput: {
    minHeight: 110,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.sm,
    padding: theme.spacing[3],
    textAlignVertical: 'top',
    outlineStyle: 'none' as any,
  },
  requestErrorText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.status.error,
    marginBottom: theme.spacing[3],
  },
  requestButtonRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  requestButton: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  requestCancelButton: {
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
  },
  requestCancelButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  requestSubmitButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  requestSubmitButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  requestButtonDisabled: {
    opacity: 0.55,
  },
});
