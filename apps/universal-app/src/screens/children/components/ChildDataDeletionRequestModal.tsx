import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCreatePrivacyRequest } from '@/api/privacyRequests';
import { theme } from '@/theme';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import {
  buildChildDataDeletionRequestMessage,
  CHILD_DATA_DELETION_SCOPE_KEYS,
  DEFAULT_CHILD_DATA_DELETION_SCOPES,
  type ChildDataDeletionScope,
} from '@/utils/childDataDeletionRequest';

interface Props {
  visible: boolean;
  child: { id: string; name: string } | null;
  onClose: () => void;
}

export function ChildDataDeletionRequestModal({ visible, child, onClose }: Props) {
  const { t } = useTranslation();
  const createPrivacyRequest = useCreatePrivacyRequest();
  const [scopes, setScopes] = useState<ChildDataDeletionScope[]>([
    ...DEFAULT_CHILD_DATA_DELETION_SCOPES,
  ]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);

  const scopeLabels = useMemo(
    () =>
      Object.fromEntries(
        CHILD_DATA_DELETION_SCOPE_KEYS.map((scope) => [
          scope,
          t(`children_screen.child_data_deletion_scope_${scope}`),
        ])
      ) as Record<ChildDataDeletionScope, string>,
    [t]
  );

  const reset = () => {
    setScopes([...DEFAULT_CHILD_DATA_DELETION_SCOPES]);
    setDetails('');
    setError(null);
  };

  const close = (force = false) => {
    if (createPrivacyRequest.isPending && !force) return;
    reset();
    onClose();
  };

  const toggleScope = (scope: ChildDataDeletionScope) => {
    setError(null);
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
    );
  };

  const submit = async () => {
    if (!child) return;
    if (scopes.length === 0) {
      setError(t('children_screen.child_data_deletion_scope_required'));
      return;
    }

    try {
      const message = buildChildDataDeletionRequestMessage({
        childId: child.id,
        childName: child.name,
        scopes,
        details,
        submittedFrom: 'child_profile',
      });
      await createPrivacyRequest.mutateAsync({
        requestType: 'deletion',
        message,
      });
      close(true);
      Alert.alert(
        t('children_screen.child_data_deletion_success_title'),
        t('children_screen.child_data_deletion_success_message')
      );
    } catch (err) {
      setError(getLocalizedApiError(t, err, 'children_screen.child_data_deletion_error'));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => close()}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.icon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={34}
                color={theme.colors.interactive.primary}
              />
            </View>
            <Text style={styles.title}>
              {t('children_screen.child_data_deletion_request_title', {
                name: child?.name ?? '',
              })}
            </Text>
            <Text style={styles.body}>{t('children_screen.child_data_deletion_request_body')}</Text>

            <View style={styles.scopeList}>
              {CHILD_DATA_DELETION_SCOPE_KEYS.map((scope) => {
                const selected = scopes.includes(scope);
                return (
                  <TouchableOpacity
                    key={scope}
                    style={[styles.scopeButton, selected && styles.scopeButtonSelected]}
                    activeOpacity={0.75}
                    onPress={() => toggleScope(scope)}
                  >
                    <Ionicons
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={selected ? theme.colors.interactive.primary : theme.colors.text.tertiary}
                    />
                    <Text style={styles.scopeText} numberOfLines={2}>
                      {scopeLabels[scope]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.detailsField}>
              <Text style={styles.detailsLabel}>
                {t('children_screen.child_data_deletion_details_label')}
              </Text>
              <TextInput
                style={styles.detailsInput}
                value={details}
                onChangeText={(value) => {
                  setDetails(value);
                  setError(null);
                }}
                placeholder={t('children_screen.child_data_deletion_details_placeholder')}
                placeholderTextColor={theme.colors.text.tertiary}
                multiline
                maxLength={1200}
                editable={!createPrivacyRequest.isPending}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                activeOpacity={0.75}
                disabled={createPrivacyRequest.isPending}
                onPress={() => close()}
              >
                <Text style={styles.cancelButtonText}>
                  {t('children_screen.child_data_deletion_cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.submitButton,
                  (createPrivacyRequest.isPending || scopes.length === 0) && styles.buttonDisabled,
                ]}
                activeOpacity={0.75}
                disabled={createPrivacyRequest.isPending || scopes.length === 0}
                onPress={submit}
              >
                {createPrivacyRequest.isPending ? (
                  <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                ) : (
                  <Ionicons name="send-outline" size={16} color={theme.colors.text.inverse} />
                )}
                <Text style={styles.submitButtonText}>
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
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[5],
  },
  modal: {
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
  content: {
    padding: theme.spacing[6],
  },
  icon: {
    width: 58,
    height: 58,
    borderRadius: theme.borders.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: theme.colors.background.secondary,
    marginBottom: theme.spacing[4],
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  body: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: theme.spacing[5],
  },
  scopeList: {
    gap: theme.spacing[2],
    marginBottom: theme.spacing[5],
  },
  scopeButton: {
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
  scopeButtonSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.background.primary,
  },
  scopeText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    lineHeight: 18,
  },
  detailsField: {
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  detailsLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  detailsInput: {
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
  errorText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.status.error,
    marginBottom: theme.spacing[3],
  },
  buttonRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  button: {
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
  cancelButton: {
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
  },
  cancelButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  submitButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  submitButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
